---
file: 03-交易回传契约-App到CMS.md
description: Club-Ops App 的交易事实与门店运营数据通过 Outbox/事件回传 CMS，以及纠正命令结果事件；含表结构、事件目录、传输、重试、幂等、顺序与验收
author: AI Tutor <TraeCode>
version: v1.1.0
created: 2026-11-01
updated: 2026-11-01
status: draft
tags: [outbox],[event],[sync],[transaction],[cms]
category: contract
---

# 📤 交易回传契约：App → CMS

> **方向固定**：App 是交易事实唯一写入方，CMS 只读投影。
> **机制**：业务表与 Outbox 同事务；异步批量推送；至少一次 + 幂等 + 顺序。
> **禁止**：CMS 直接读 App 库；App 直接把报表写入 CMS；事件丢失后由人工改报表。

---

## 1. Outbox 表结构（App 侧）

```sql
CREATE TABLE app.sync_outbox (
  id                uuid PRIMARY KEY,
  tenant_id         text NOT NULL,
  store_id          text NOT NULL,
  aggregate_type    text NOT NULL,          -- room/order/bill/payment/handover/...
  aggregate_id      text NOT NULL,
  event_type        text NOT NULL,
  event_version     int  NOT NULL DEFAULT 1,
  sequence          bigint NOT NULL,         -- 同一聚合根内递增
  occurred_at       timestamptz NOT NULL,
  actor_id          text,
  idempotency_key   text NOT NULL,
  payload           jsonb NOT NULL,
  payload_checksum  text NOT NULL,          -- sha256(canonical json)
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','sending','sent','failed','dead')),
  attempts          int NOT NULL DEFAULT 0,
  next_retry_at     timestamptz,
  last_error        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  sent_at           timestamptz,
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX idx_outbox_pending ON app.sync_outbox (status, next_retry_at);
CREATE INDEX idx_outbox_aggregate ON app.sync_outbox (aggregate_type, aggregate_id, sequence);
```

**写入规则**

- 与业务写在同一事务：`INSERT business...` + `INSERT outbox...`，事务提交即事件“必达”。
- `sequence` 由聚合根当前版本 +1（可用 `SELECT ... FOR UPDATE` 或业务版本号）。
- `event_id` = `id`；重试复用同一 `id`，不得重新生成。
- `payload` 保存**事实快照**（金额/状态/快照名称），不依赖后续查询。
- 禁止在 Outbox 中放大段二进制/图片；只放引用。

---

## 2. 事件信封

```json
{
  "eventId": "evt_01H...",
  "eventType": "order.checkout.completed",
  "eventVersion": 1,
  "aggregateType": "room_order",
  "aggregateId": "ord_01H...",
  "tenantId": "tnt_01H...",
  "storeId": "str_01H...",
  "sequence": 3,
  "occurredAt": "2026-11-01T23:59:00+08:00",
  "actorId": "usr_01H...",
  "producer": "yyc3-club-ops",
  "idempotencyKey": "checkout:ord_01H...:1",
  "payloadChecksum": "sha256:...",
  "payload": {
    "roomCents": 58000,
    "itemsCents": 6800,
    "totalCents": 64800,
    "paymentMethod": "wechat",
    "paidAt": "2026-11-01T23:58:30+08:00"
  }
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `eventId` | ✅ | 全局唯一，重试不变 |
| `eventType` | ✅ | 见第 3 节目录 |
| `eventVersion` | ✅ | 从 1 开始；破坏性变更升版本 |
| `aggregateType/Id` | ✅ | 聚合根 |
| `tenantId/storeId` | ✅ | 租户/门店 |
| `sequence` | ✅ | 聚合根内严格递增 |
| `occurredAt` | ✅ | 业务发生时间（服务端） |
| `actorId` | 否 | 操作人 |
| `producer` | ✅ | `yyc3-club-ops` |
| `idempotencyKey` | ✅ | 业务动作幂等键 |
| `payloadChecksum` | ✅ | 防篡改/校验 |
| `payload` | ✅ | 事实字段（见 `04`） |

---

## 3. 事件目录（MVP）

### 3.1 房态

| 事件 | 聚合根 | 关键字段 |
|---|---|---|
| `room.session.started` | `room_session` | roomId、orderId、startedAt、pricingSnapshot |
| `room.session.extended` | `room_session` | roomId、extendedMinutes、newEndAt |
| `room.session.transferred` | `room_session` | fromRoomId、toRoomId |
| `room.status.changed` | `room` | roomId、from、to、reason、actorId |
| `room.session.closed` | `room_session` | roomId、orderId、endedAt、durationMinutes |

### 3.2 订单/账单/支付

| 事件 | 聚合根 | 关键字段 |
|---|---|---|
| `order.opened` | `room_order` | orderId、orderNo、roomId、startedAt |
| `order.item.added` | `room_order` | itemId、productId、nameSnapshot、unitPriceCents、qty、totalCents、isGift |
| `order.item.removed` | `room_order` | itemId、reason、actorId |
| `order.checkout.completed` | `room_order` | roomCents、itemsCents、totalCents、paymentMethod、paidAt、receiptNo |
| `order.refunded` | `room_order` | refundCents、reason、approvalId |
| `payment.recorded` | `payment` | method、amountCents、paidAt、channelTxnId（脱敏） |
| `payment.refunded` | `payment` | amountCents、reason、approvalId |

### 3.3 交接/寄存/挂账

| 事件 | 聚合根 | 关键字段 |
|---|---|---|
| `handover.created` | `handover` | shift、cashCents、cardCents、wechatCents、alipayCents、creditCents、memberCents、totalCents |
| `handover.confirmed` | `handover` | confirmedBy、confirmedAt、varianceCents |
| `deposit.created` | `deposit` | depositNo、memberId、roomId、productId、qty、expiresAt、code |
| `deposit.withdrawn` | `deposit` | depositId、withdrawnAt、verifyMethod、actorId |
| `deposit.forfeited` | `deposit` | depositId、forfeitedAt、reason |
| `credit.created` | `credit` | creditId、memberId、roomId、amountCents、guarantorId |
| `credit.repaid` | `credit` | creditId、amountCents、method、repaidAt |

### 3.4 审批/任务

| 事件 | 聚合根 | 关键字段 |
|---|---|---|
| `approval.requested` | `approval` | type、amountCents、roomId、applicantId、reason、items |
| `approval.approved` | `approval` | approvalId、approverId、approvedAt、note |
| `approval.rejected` | `approval` | approvalId、approverId、rejectedAt、reason |
| `task.created` | `task` | type、source、roomId、assigneeId、dueAt |
| `task.completed` | `task` | taskId、completedAt、actorId |

### 3.5 库存/艺人/预订

| 事件 | 聚合根 | 关键字段 |
|---|---|---|
| `inventory.count.posted` | `stock_count` | countId、warehouseId、lines（productId、systemQty、actualQty、diffQty） |
| `inventory.adjustment.posted` | `stock_adjustment` | adjustmentId、type、lines |
| `artist.clock.started` | `artist_clock` | artistId、roomId、startedAt、feeRuleId |
| `artist.clock.stopped` | `artist_clock` | clockId、stoppedAt、durationMinutes、feeCents |
| `artist.fee.txn.posted` | `stage_fee_txn` | artistId、type（recharge/deduct/manual）、amountCents、balanceAfter |
| `artist.ticket.txn.posted` | `stage_ticket_txn` | artistId、type（buy/use）、qty、amountCents |
| `booking.created` | `booking` | bookingId、roomTypeId、arrivalAt、memberId |
| `booking.cancelled` | `booking` | bookingId、reason、cancelledAt |
| `queue.created` | `queue` | queueId、roomTypeId、memberId、number |
| `queue.called` | `queue` | queueId、roomId、calledAt |

> 新增事件必须先在 `04` 登记字段与 CMS 投影目标，再实现。

### 3.6 门店运营数据事件（App→CMS）

> App 是门店级数据的第一写入方；以下事件与交易事件共用同一 Outbox/传输/去重/顺序机制。

| 事件 | 聚合根 | 关键字段 |
|---|---|---|
| `master.product.created` | `product` | productId、name、categoryId、unit、priceCents、stock、status |
| `master.product.updated` | `product` | productId、changedFields、fields、recordVersion |
| `master.product.deleted` | `product` | productId、deletedAt、recordVersion |
| `master.room.created/updated/deleted` | `room` | roomId、name、type、area、capacity、floor、status |
| `master.pricing.updated` | `pricing` | pricingId、roomTypeId、hourlyPriceCents、minimumSpendCents、packagePriceCents |
| `master.member.created/updated` | `member` | memberId、cardNo、level、balanceCents、points、status |
| `master.staff.created/updated` | `staff` | userId、storeId、groupId、role、permissions、quotaCents |
| `master.artist.created/updated` | `artist` | artistId、groupId、levelId、badgeNo、stageFeeRule、status |
| `master.settings.updated` | `settings` | storeId、changedKeys、settings |
| `master.warehouse.created/updated` | `warehouse` | warehouseId、name、type、supplierId |
| `master.inventory.adjusted` | `inventory` | productId、warehouseId、deltaQty、reason、recordVersion |
| `master.store.updated` | `store` | storeId、address、phone、businessHours |

**运营数据事件载荷**

```json
{
  "eventType": "master.product.updated",
  "aggregateType": "product",
  "aggregateId": "prd_01H...",
  "sequence": 7,
  "payload": {
    "operation": "update",
    "writer": "app",
    "recordVersion": 7,
    "storeId": "str_01H...",
    "changedFields": ["priceCents", "status"],
    "fields": { "priceCents": 1200, "status": "active" }
  }
}
```

**约束**：

- `writer` 必须为 `app`；CMS 拒绝其他写入方。
- `changedFields` 必须属于 App owner；否则 CMS 返回 `forbidden_field`。
- `recordVersion` 必须大于 CMS 已知版本；否则 `version_conflict`。
- 运营数据事件与交易事件同批传输时，按聚合根分别排序。

### 3.7 纠正命令结果事件（App→CMS）

| 事件 | 聚合根 | 关键字段 |
|---|---|---|
| `command.applied` | `command` | commandId、recordVersion、eventId、appliedAt、actorId |
| `command.rejected` | `command` | commandId、code、reason、rejectedAt、actorId |

- `command.applied` 必须同时携带被修改记录的新 `master.*` 事件（先发数据事件，再发 applied）。
- `command.rejected` 不产生数据事件；CMS 标记命令失败并告警。
- 命令事件同样走 Outbox，保证 ACK 可追踪。

### 3.8 PC 手册基线扩展事件（App→CMS）

> 依据 `08-PC功能基线与同步映射.md` 的 42+ 子模块，以下事件用于覆盖 PC 手册中的商品/仓库/设置/账单能力；字段与命令映射见 `08`。

| 事件组 | 事件示例 | 聚合根 |
|---|---|---|
| 商品目录 | `master.product_category.*`、`master.product_flavor.*`、`master.package.*` | 分类/口味/套餐 |
| 开房套餐 | `master.room_package.*`、`master.room_package_price.*` | 开房套餐/价格 |
| 计费规则 | `master.pricing.*`、`master.pricing_rule.*` | 计时/包断/低消/进位 |
| 营销规则 | `master.delivery_rule.*`、`master.room_snack.*`、`master.price_strategy.*`、`master.points_exchange.*` | 配送/小吃/价格策略/积分 |
| 仓库单据 | `inventory.purchase.posted`、`purchase_return.posted`、`transfer.posted`、`damage.posted`、`requisition.posted` | 采购/退货/调拨/报损/领用 |
| 库存 | `inventory.count.posted`、`inventory.stock.updated`、`master.stock_policy.*` | 盘点/实时库存/不足出货策略 |
| 设备与VOD | `master.device.*`、`master.print.*`、`master.vod.*`、`master.movie.*` | 收银机/打印机/VOD/影片 |
| 门店规则 | `master.deposit_rule.*`、`master.rounding_rule.*`、`master.marquee.*` | 寄存/抹零/走马灯 |
| 艺人设置 | `master.artist_setting.*` | 艺人设置 7 项 |
| 账单更正 | `bill.adjusted` | 账单修改/删除（由命令触发） |

**约束**：

- 事件字段 owner、`recordVersion`、命令来源见 `08` 与 `04`。
- 仓库单据必须由 App 应用后产生，PC 不直接写库存。
- `bill.adjusted` 必须在 `command.bill.correct` 应用成功后产生，并携带 `sourceCommandId`。

---

## 4. 传输协议

### 4.1 批量推送

```http
POST /api/v1/sync/events/batch
Content-Type: application/json
X-YYC3-Key-Id: {keyId}
X-YYC3-Timestamp: {unixSeconds}
X-YYC3-Nonce: {random}
X-YYC3-Signature: HMAC-SHA256(secret, method + path + timestamp + nonce + bodySha256)
```

```json
{
  "producer": "yyc3-club-ops",
  "batchId": "bat_01H...",
  "sentAt": "2026-11-01T23:59:30+08:00",
  "events": [ { 事件信封 } ]
}
```

**响应**

```json
{
  "success": true,
  "data": {
    "accepted": 99,
    "duplicates": 1,
    "rejected": [
      { "eventId": "evt_...", "code": "version_conflict", "message": "expected sequence 4, got 5" }
    ],
    "acknowledgedThrough": "2026-11-01T23:59:30+08:00"
  },
  "requestId": "req_01H..."
}
```

### 4.2 约束

| 项 | 约束 |
|---|---|
| 批量大小 | ≤100 事件；≤5MB |
| 单事件 | ≤256KB |
| 超时 | 连接 5s / 读取 15s |
| 签名时间窗 | ±5 分钟 |
| nonce | 10 分钟内不可重复 |
| 幂等 | CMS 以 `eventId` 唯一约束去重 |
| 顺序 | 同聚合根按 `sequence`；跨聚合根不保证 |
| 重试 | 指数退避 1s→5s→30s→5m→30m→2h；最多 24h |
| 死信 | 超过上限 → `dead`，告警 + 人工重放 |
| 重放 | 复用原 `eventId`；CMS 返回 duplicate，不重复投影 |

### 4.3 乱序处理

- CMS 期望 `sequence = last_sequence + 1`；若超前 → `409 version_conflict`，暂不投影。
- App 收到 409 后，先补发缺口事件；仍失败则告警。
- 允许 CMS 暂存“未来事件”（最多 24h），缺口补齐后按序投影；暂存区不参与报表。

### 4.4 失败分类

| 类型 | 处理 |
|---|---|
| 网络/超时/5xx | 重试（自动） |
| 401/403/签名失败 | 不重试，告警 + 检查密钥/时间 |
| 400 字段非法 | 不重试，进 DLQ，人工修复后重放 |
| 409 乱序/版本 | 重试（先补缺口） |
| 409 幂等载荷冲突 | 不重试，告警（同一 key 不同 payload 属实现 bug） |

---

## 5. CMS 侧入库

### 5.1 表

```sql
CREATE TABLE cms.sync_event_log (
  event_id        text PRIMARY KEY,
  event_type      text NOT NULL,
  event_version   int NOT NULL,
  aggregate_type  text NOT NULL,
  aggregate_id    text NOT NULL,
  tenant_id       text NOT NULL,
  store_id        text NOT NULL,
  sequence        bigint NOT NULL,
  writer          text NOT NULL DEFAULT 'app',
  record_version  bigint,
  command_id      text,
  occurred_at     timestamptz NOT NULL,
  received_at     timestamptz NOT NULL DEFAULT now(),
  producer        text NOT NULL,
  payload         jsonb NOT NULL,
  payload_checksum text NOT NULL,
  status          text NOT NULL DEFAULT 'applied'
);

CREATE UNIQUE INDEX uq_event_sequence
  ON cms.sync_event_log (aggregate_type, aggregate_id, sequence);
```

### 5.2 处理顺序

```text
接收 → 验签/时间窗/nonce → 校验信封/租户/门店
→ 去重（event_id 已存在 → duplicate）
→ 分支：
   A. 交易事件 → 顺序校验 → 写日志 → 更新交易投影
   B. 运营数据事件(master.*) → 校验 writer/字段owner/recordVersion
      → 写日志 → 更新 operational 投影
   C. 命令结果(command.*) → 写日志 → 更新命令状态（applied/rejected）
→ 更新对账指标
→ 返回 ACK
```

- 事件日志与投影更新在同一 CMS 事务；投影失败则事件不 ACK，App 重试。
- 投影必须**幂等**：同一事件重复应用结果一致。
- 支持按 `aggregate_id` 重放重建单个聚合；支持按时间范围全量重建。
- 报表读模型只读；不允许后台手工改数（修正走“调整单”事件或纠正命令）。
- **字段 owner 校验**：运营数据事件只能改 App owner 字段；CMS 拒绝 `forbidden_field`。
- **recordVersion 校验**：必须大于 CMS 已知版本；否则 `version_conflict`。
- **CMS PC 修改**：只能改中央配置；门店级 `operational_*` 表禁止后台直接写，必须走命令并等待 App 事件。

---

## 6. 保留与清理

| 数据 | 保留 |
|---|---|
| App Outbox `sent` | 30 天（之后归档/删除） |
| App Outbox `dead` | 永久直到人工处理 |
| CMS `sync_event_log` | 至少 2 年（财务审计） |
| CMS 投影 | 按报表保留策略 |
| 重放窗口 | 2 年内可按聚合重建 |

---

## 7. 监控

| 指标 | 阈值 |
|---|---|
| Outbox pending 数 | >1000 告警 |
| 最老 pending 年龄 | >60s 告警 |
| 失败率 | >1%（5 分钟）告警 |
| DLQ 深度 | >0 立即告警 |
| 乱序事件数 | >0 告警 |
| 签名失败 | 突增告警（疑似密钥/攻击） |
| 事件到 ACK P95 | >5s 告警 |

---

## 8. 验收用例

| # | 用例 | 期望 |
|---|---|---|
| E1 | 开房成功 | 业务表 + Outbox 同事务；事件 5s 内 ACK |
| E2 | 点单/退单 | 每次 item 事件有序；CMS 投影金额正确 |
| E3 | 结账 | 一条 `checkout.completed` 含房费+商品+支付方式；幂等重放不重复入账 |
| E4 | 断网 30 分钟 | Outbox 累积；恢复后按序补发；CMS 最终一致 |
| E5 | 重复投递 | CMS 返回 duplicate，投影不变 |
| E6 | 乱序投递 | CMS 409/暂存；补缺口后正确投影 |
| E7 | 非法 payload | 400 → DLQ；修复后重放成功 |
| E8 | 跨租户事件 | 403/拒绝；不落库 |
| E9 | 签名伪造 | 401；不落库；告警 |
| E10 | 交接/寄存/审批 | 事件与业务一致；报表可查 |
| E11 | 重放重建 | 按 aggregate 重建投影，结果与首次一致 |
| E12 | 金额一致性 | App 小票 = CMS 报表 = 对账结果（分） |
| E13 | App 新建/改价/删除商品 | CMS 5s 内更新 operational 投影；PC 可见 |
| E14 | App 改会员/员工/艺人 | CMS 投影更新；字段 owner 校验通过 |
| E15 | App 改中央配置字段 | CMS 拒绝 `forbidden_field` |
| E16 | CMS 下发纠正命令 | App 应用 → 回传 master 事件 + command.applied → CMS 投影更新 |
| E17 | 命令与 App 并发 | `version_conflict`；CMS 重新下发；不丢数据 |
| E18 | 命令未 ACK | CMS 重试 + 告警；不直接改投影 |

---

## 9. 变更记录

| 版本 | 日期 | 变更 | 作者 |
|---|---|---|---|
| v1.1.0 | 2026-11-01 | 新增门店运营数据事件（master.*）、命令结果事件、事件日志 writer/recordVersion/commandId、CMS 分支处理与 E13~E18 | TraeCode |
| v1.0.0 | 2026-11-01 | 初版：Outbox、信封、事件目录、传输、入库、验收 | TraeCode |
