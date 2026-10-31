---
file: 02-主数据同步契约-CMS到App.md
description: Club-Ops B端 App 与 CMS PC 的双向数据同步契约：中央配置 CMS→App、门店运营数据 App→CMS、CMS 纠正命令；含归属、版本、冲突、API/事件、验收
author: AI Tutor <TraeCode>
version: v1.1.0
created: 2026-11-01
updated: 2026-11-01
status: draft
tags: [sync],[bidirectional],[master-data],[operational-data],[contract],[cms],[club-ops]
category: contract
---

# 🔄 数据同步契约：App ↔ CMS（双向）

> **文件名说明**：本文件保留原名以兼容既有链接；内容已按 2026-11-01 决策升级为**双向同步**。
>
> **最新定位（以本版为准）**：
> - **Club-Ops App = B 端「生产经营管理运维端」**：门店现场交易、运营、管理、运维的主要操作与编辑入口。
> - **CMS PC = 中央数据管理与汇总端**：接收 App 的门店运营数据，提供跨店汇总、报表、中央配置与必要纠正。
> - **不再采用“CMS 唯一维护所有主数据、App 只读”的旧假设。**
>
> **核心原则**：
> 1. **门店级数据（store-scoped）第一写入方 = App**，编辑/变更后通过 Outbox 同步到 CMS PC。
> 2. **中央级配置（tenant/集团级）第一写入方 = CMS**，发布后 App 只读同步。
> 3. **同一字段禁止双写**：需要双边的实体做字段级拆分；CMS PC 对门店级字段的修改走“纠正命令”，由 App 应用后回传。
> 4. 交易事实（房态/订单/账单/支付/交接/寄存/审批/任务）仍由 App 唯一写入，见 `03`。

---

## 1. 变更说明（为什么改）

| 旧假设（v1.0） | 新决策（v1.1） |
|---|---|
| CMS 唯一维护商品、房型、价格、套餐、员工、会员、艺人等主数据 | **App 负责门店级生产经营数据的创建/编辑/变更**，并同步 CMS PC |
| App 只读主数据缓存 | App 对门店级数据有写权限；对中央配置只读 |
| 只有 CMS→App 单向 | 三条通道：CMS→App 中央配置、App→CMS 门店数据、CMS→App 纠正命令 |
| CMS 直接改主数据后下发 | CMS 对门店级字段只发“纠正命令”，不直接改 App 事实 |
| 报表由 CMS 从零维护 | CMS 基于 App 同步数据构建汇总与报表 |

**决策依据**：B 端 App 是门店生产经营的实际操作端，商品、价格、会员、员工、艺人、房型、设置等大量变更发生在门店现场；若强制回 CMS PC 操作，会阻断营业。CMS PC 的职责是中央配置、跨店汇总、报表与审计。

---

## 2. 数据分级与归属

### 2.1 三级归属

| 级别 | 定义 | 第一写入方 | 同步方向 |
|---|---|---|---|
| **C 中央配置** | 租户/集团级、全店统一、模板类 | **CMS** | CMS→App（只读） |
| **S 门店运营** | 单店生产经营数据、可现场编辑 | **App** | App→CMS（事件） |
| **T 交易事实** | 房态、订单、账单、支付、交接、寄存、审批、任务 | **App** | App→CMS（事件，见 `03`） |
| **R 报表读模型** | 汇总、指标、对账结果 | **CMS**（由 C/S/T 投影） | CMS→App（查询） |

### 2.2 实体归属矩阵

| 实体/域 | 级别 | 第一写入方 | 说明 |
|---|---|---|---|
| `tenant`、`store` 开通信息 | C | CMS | 租户/门店 ID、编码、状态、时区 |
| 门店地址/电话/营业时间 | S | App | 店长可改，CMS 汇总 |
| 全局商品模板、全局分类/口味 | C | CMS | 可选；门店可引用 |
| 门店商品、门店分类/口味、套餐 | S | **App** | 门店建品/改价/上下架/沽清 |
| 门店商品价格、会员价、库存、成本 | S | **App** | 现场调价/盘点 |
| 房型模板、计费模板、开房套餐模板 | C | CMS | 集团统一模板 |
| 门店房型/房间/区域 | S | **App** | 房号、容量、楼层、区域 |
| 门店计时/包断/低消/套餐价格 | S | **App** | 门店实际售价 |
| 门店设置（支付/密码/审批/打印等） | S | **App** | 店长现场开关；中央默认值来自 CMS |
| 员工账号身份（登录手机号/密码/状态） | C | CMS | 认证身份由中央管理 |
| 员工门店档案（组别/职务/管辖/额度） | S | **App** | 门店排班/权限/额度 |
| 会员主档、等级、余额、积分、充值规则 | S | **App** | 门店办卡/充值/消费 |
| 艺人档案、组别、等级、台费/台票规则、artist_setting 7 项 | S | **App** | 门店艺人运营 |
| 仓库、供应商、库存、调拨、盘点 | S | **App** | 门店进销存 |
| 交易事实（房态/订单/支付/交接/寄存/审批/任务） | T | **App** | 见 `03` |
| 跨店报表/指标/对账 | R | CMS | 只读投影 |
| 品牌素材/报表定义/权限模板 | C | CMS | 中央统一 |

> **冲突原则**：同一实体若既有 C 又有 S 字段，必须按字段拆分，不得两端同时写同一字段。字段级 owner 见 `04`。

---

## 3. 三条同步通道

```text
通道 A：CMS → App（中央配置，只读）
   CMS 发布 tenant/store 开通、全局模板、权限模板、报表定义
   → App GET /api/v1/sync/master/{domain}?since=...
   → App 原子应用 central_sync_version

通道 B：App → CMS（门店运营数据 + 交易事实）
   App 业务事务 + app.sync_outbox 同事务
   → 批量 POST /api/v1/sync/events/batch（见 03）
   → CMS 写 sync_event_log + 更新 operational 投影
   → CMS PC 汇总/报表

通道 C：CMS → App（纠正命令，可选）
   CMS PC 对门店级记录的纠正/封存/强制下架
   → App GET /api/v1/sync/commands?since=...
   → App 校验权限与字段归属，应用到本地
   → App 产生 master.* 事件回传（通道 B）
   → CMS 记录 command.applied / rejected
```

**关键约束**：

- 通道 B 是**唯一门店数据入口**；CMS PC 不直接写 App 数据库。
- 通道 C 不直接改 CMS 投影；必须等 App 应用并回传事件后，CMS 才更新投影。
- 通道 A 与 C 均带版本号；App 必须校验版本，不允许静默覆盖本地未同步数据。

---

## 4. 通道 A：中央配置（CMS → App）

### 4.1 拉取 API

```http
GET /api/v1/sync/master/{domain}?tenantId={tenantId}&storeId={storeId}&since={version}&limit={n}
Authorization: X-YYC3-Key-Id, X-YYC3-Timestamp, X-YYC3-Nonce, X-YYC3-Signature
```

**适用域（C 级）**：`tenant`、`store_onboarding`、`global_catalog`、`global_pricing_template`、`permission_template`、`report_definition`、`brand_asset`。

**响应结构**（保持 v1.0）：

```json
{
  "success": true,
  "data": {
    "domain": "global_pricing_template",
    "tenantId": "tnt_01H...",
    "version": 20261101001,
    "full": false,
    "items": [
      {
        "id": "tpl_01H...",
        "version": 20261101001,
        "updatedAt": "2026-11-01T12:00:00+08:00",
        "deleted": false,
        "fields": { "name": "周末黄金档", "hourlyPriceCents": 28000 }
      }
    ],
    "tombstones": [],
    "nextSince": 20261101001,
    "hasMore": false
  }
}
```

- `version` 为 `tenant + domain` 单调递增。
- `since` 过旧（>30 天）返回 `full=true`。
- App 原子应用并更新 `central_sync_version`；C 级数据在 App **只读**。

---

## 5. 通道 B：门店运营数据（App → CMS）

### 5.1 事件而不是“第二个 API”

门店级数据的创建/编辑/删除，统一走 `03` 的 Outbox 事件通道，不新增一套 REST 写入接口。原因：

- 与交易事实共用同一套幂等/重试/顺序/DLQ；
- 保证“业务事务成功 = 数据必达”；
- 避免 CMS 直接写 App 表或双写。

### 5.2 事件命名

| 事件 | 聚合根 | 说明 |
|---|---|---|
| `master.product.created` | `product` | 门店新建商品 |
| `master.product.updated` | `product` | 改价/改名/上下架/沽清 |
| `master.product.deleted` | `product` | 删除/停用 |
| `master.room.created/updated/deleted` | `room` | 房间/区域/容量 |
| `master.pricing.updated` | `pricing` | 计时/包断/低消/套餐价 |
| `master.member.created/updated` | `member` | 办卡/资料/等级/余额变动 |
| `master.staff.created/updated` | `staff` | 员工门店档案/组别/职务/额度 |
| `master.artist.created/updated` | `artist` | 艺人档案/等级/组别/台费规则/artist_setting 7 项 |
| `master.settings.updated` | `settings` | 门店设置开关 |
| `master.warehouse.created/updated` | `warehouse` | 仓库/供应商 |
| `master.inventory.adjusted` | `inventory` | 盘点/调拨/报损/领用 |
| `master.store.updated` | `store` | 门店地址/电话/营业时间 |

> 完整 PC 手册子模块事件（套餐/配送/小吃/价格策略/积分/仓库单据/设备/VOD/影片/账单更正）见 `03` §3.8 与 `08`。

> 事件信封、传输、重试、幂等、顺序见 `03`；本文件只定义“哪些数据、谁写、字段怎么变”。

### 5.3 事件载荷（运营数据）

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
    "fields": {
      "name": "青岛啤酒",
      "priceCents": 1200,
      "memberPriceCents": 1000,
      "stock": 96,
      "status": "active"
    }
  }
}
```

- `recordVersion` 由 App 按聚合根递增；CMS 用它做顺序与幂等。
- `changedFields` 用于 CMS 只更新变化字段，避免覆盖 CMS 侧未同步字段。
- `writer` 固定 `app`；CMS 收到非 `app` 的运营数据写入应拒绝。

---

## 6. 通道 C：CMS 纠正命令（CMS → App）

### 6.1 适用场景

- CMS PC 发现门店数据错误（价格异常、重复商品、错误会员等级、艺人资料错误）。
- 集团要求强制下架/封存/改价（需审批）。
- 门店数据异常需要中央纠正，但**不允许 CMS 直接改 App 事实**。

### 6.2 API

```http
GET /api/v1/sync/commands?tenantId={tenantId}&storeId={storeId}&since={commandVersion}
POST /api/v1/sync/commands/{commandId}/ack
```

**命令结构**

```json
{
  "commandId": "cmd_01H...",
  "commandType": "record.correct",
  "aggregateType": "product",
  "aggregateId": "prd_01H...",
  "tenantId": "tnt_01H...",
  "storeId": "str_01H...",
  "issuesAt": "2026-11-01T12:10:00+08:00",
  "version": 3,
  "fields": { "priceCents": 1500, "status": "inactive" },
  "reason": "集团价格纠偏",
  "operatorId": "usr_01H..."
}
```

**命令类型**

| 类型 | 说明 | App 行为 |
|---|---|---|
| `record.correct` | 纠正门店级字段 | 校验权限 → 应用 → 发 `master.*.updated` → ack |
| `record.archive` | 封存/停用 | 应用 → 发 `master.*.deleted` → ack |
| `catalog.publish` | 发布中央模板到门店 | 合并模板 → 发 `master.*` → ack |
| `catalog.import` | PC 批量导入商品/分类/口味/套餐 | 逐条应用 → 发 `master.*` → ack |
| `stock.document` | PC 采购/退货/调拨/报损/领用/盘点单据 | 应用库存 → 发 `inventory.*` → ack |
| `bill.correct` | PC 账单修改/删除 | 校验权限 → 应用 → 发 `bill.adjusted` → ack |
| `settings.update` | PC 批量设置变更 | 应用 → 发 `master.settings.updated` → ack |
| `device.update` | 打印/收银机/VOD/影片配置 | 应用 → 发 `master.device.*`/`master.vod.*` → ack |
| `artist_setting.update` | 艺人设置 7 项 | 应用 → 发 `master.artist_setting.*` → ack |
| `store.suspend` | 停业/暂停 | 锁定交易 → 发 `store.status.changed` → ack |
| `price.override` | 强制价格 | 应用 → 发事件 → ack |

> PC 手册中的商品/仓库/设置/账单模块与上述命令的逐项映射见 `08-PC功能基线与同步映射.md`。

**ACK**

```json
{ "commandId": "cmd_01H...", "status": "applied", "recordVersion": 8, "eventId": "evt_01H..." }
```

失败：`rejected` + `code`（`forbidden_field` / `not_found` / `version_conflict` / `unauthorized`），并告警。

### 6.3 命令约束

- 命令只能改 `C` 级字段或**门店级字段的受控子集**；不能改交易事实。
- App 必须校验操作人/门店/字段归属；越权拒绝。
- 命令应用后必须回传事件；CMS 只在收到事件后更新投影。
- 命令数量/频率限流；高额/批量纠正需审批。

---

## 7. 版本、并发与冲突

### 7.1 版本分层

| 版本 | 作用域 | 生成方 | 用途 |
|---|---|---|---|
| `centralVersion` | tenant + domain | CMS | 中央配置增量 |
| `commandVersion` | tenant + store | CMS | 纠正命令增量 |
| `recordVersion` | 单条门店记录 | App | 运营数据顺序/并发 |
| `syncVersion` | tenant + store + domain | App | 本地已应用版本 |

### 7.2 冲突裁决

| 场景 | 裁决 |
|---|---|
| App 改门店字段 vs CMS 中央模板 | 门店字段 App 胜；模板字段 CMS 胜（字段级 owner） |
| CMS 命令 vs App 并发编辑 | 命令先到：App 应用后版本 +1；App 先改：命令基于旧版本 → `version_conflict`，CMS 重新下发 |
| 同一记录重复事件 | CMS 以 `eventId` 去重；`recordVersion` 相同视为重复 |
| 旧 `recordVersion` 事件 | CMS 拒绝/忽略，返回 `version_conflict` |
| 字段不属于 App | CMS 拒绝 `forbidden_field` |
| 中央配置版本回退 | 禁止；发布更高版本修正 |
| 命令未 ACK | CMS 重试；超过阈值告警，不直接改投影 |

### 7.3 字段级 owner

- 每条门店记录带 `field_owners` 元数据（或按实体类型固定规则）。
- App 事件只允许改 `owner=app` 的字段；CMS 命令只允许改 `owner=cms` 或受控 `app` 字段（通过命令）。
- 新增字段必须声明 owner；未声明默认 `app`（门店级）或 `cms`（中央级），见 `04`。

---

## 8. App 侧应用规则

### 8.1 数据表分层

| 表 | 归属 | 说明 |
|---|---|---|
| `app.central_config` | C | 中央配置只读缓存（tenant/模板/权限模板） |
| `app.central_sync_state` | C | `centralVersion`/ETag/最后同步 |
| `app.operational_product` | S | 门店商品（App 第一写入） |
| `app.operational_room` | S | 房间/区域（App 第一写入） |
| `app.operational_pricing` | S | 门店价格/套餐（App 第一写入） |
| `app.operational_member` | S | 会员主档（App 第一写入） |
| `app.operational_staff` | S | 员工门店档案（App 第一写入） |
| `app.operational_artist` | S | 艺人档案/规则（App 第一写入） |
| `app.operational_settings` | S | 门店设置（App 第一写入） |
| `app.operational_warehouse` | S | 仓库/库存（App 第一写入） |
| `app.sync_outbox` | S/T | 与业务事务同库（见 `03`） |
| `app.sync_command_log` | C | 命令应用/拒绝记录 |

### 8.2 写入规则

- App 页面/服务写 `operational_*`，同一事务写 `sync_outbox`。
- 写 `central_config` 一律拒绝（`403 forbidden_central_write`）。
- 订单/账单保存快照；主数据改价不回写历史。
- 删除采用软删除 + `master.*.deleted` 事件。
- 本地编辑产生的 `recordVersion` 不得回退；冲突时以服务端最新版本为准。

### 8.3 降级

| 场景 | 行为 |
|---|---|
| CMS 不可达 | App 继续本地交易与门店编辑；Outbox 累积；恢复补发 |
| 中央配置落后 | 使用最后缓存；标记 `stale`；禁止使用未同步的新模板 |
| 命令无法应用 | 记录 `sync_command_log`，告警；不阻塞正常交易 |
| 本地记录与 CMS 投影不一致 | 以 App 事实为准；CMS 通过事件重建投影 |

---

## 9. CMS 侧接收与投影

| 能力 | 要求 |
|---|---|
| `sync_event_log` | 所有 App 事件入库、去重、顺序校验 |
| `operational_*` 投影表 | 商品/房型/价格/会员/员工/艺人/设置/仓库/库存 |
| 中央配置表 | tenant/store 开通、全局模板、权限模板、报表定义 |
| 命令中心 | 生成/下发/跟踪 `command.applied/rejected` |
| 报表读模型 | 基于 operational + transactions 汇总 |
| CMS PC 编辑 | 仅允许 C 级字段；S 级字段只能发命令 |
| 审计 | 谁改了什么、命令谁批的、App 是否应用 |

> CMS PC 的“数据管理”界面应区分：
> - **中央配置**：可直接编辑；
> - **门店数据**：只读 + “纠正”按钮（生成命令）；
> - **交易数据**：只读 + 报表/审计。

---

## 10. 调度与监控

| 数据 | 方向 | 频率/延迟 |
|---|---|---|
| 中央配置 | CMS→App | 5 分钟轮询 + 变更通知；P95 ≤60s |
| 门店运营数据 | App→CMS | Outbox 实时；P95 ≤5s |
| 纠正命令 | CMS→App | 1 分钟轮询；P95 ≤60s |
| 命令 ACK | App→CMS | 实时；P95 ≤5s |
| 交易事实 | App→CMS | 实时；P95 ≤5s |

**指标**：各域版本延迟、Outbox pending、DLQ、命令未 ACK 数、字段冲突数、对账差异。

---

## 11. 验收用例

| # | 用例 | 期望 |
|---|---|---|
| M1 | App 新建商品 | CMS 5s 内收到 `master.product.created`，PC 可见 |
| M2 | App 改价/沽清 | CMS 收到 updated；报表用新价；历史账单不变 |
| M3 | App 删除商品 | CMS 收到 deleted；PC 标记停用；历史可查 |
| M4 | App 新建会员/充值 | CMS 会员投影更新；余额一致 |
| M5 | App 改员工职务/额度 | CMS 员工投影更新；权限生效 |
| M6 | App 改艺人台费规则 | CMS 艺人投影/报表更新 |
| M7 | App 改门店设置 | CMS 收到 settings.updated；PC 展示一致 |
| M8 | CMS 发布中央模板 | App 60s 内可见；只读 |
| M9 | CMS 纠正门店价格 | App 收到命令 → 应用 → 回传事件 → CMS 投影更新 |
| M10 | CMS 纠正与 App 并发 | 版本冲突返回 `version_conflict`，重新下发 |
| M11 | App 尝试写中央配置 | 403 `forbidden_central_write` |
| M12 | App 事件改 CMS 字段 | CMS 拒绝 `forbidden_field` |
| M13 | 门店隔离 | A 店数据不进 B 店；CMS 按 storeId 汇总 |
| M14 | CMS 宕机 30 分钟 | App 正常营业；恢复后追平 |

---

## 12. 待建能力

### 12.1 App

- `operational_*` 表与仓储（商品/房型/价格/会员/员工/艺人/设置/仓库）。
- Outbox 覆盖运营数据事件（不只交易）。
- 中央配置缓存 + 只读校验。
- 命令接收/校验/应用/ACK。
- 字段 owner 元数据与冲突处理。

### 12.2 CMS

- tenant/store 开通与中央配置表。
- `sync_event_log` + 去重/顺序。
- `operational_*` 投影表与重建。
- 命令中心（生成/下发/跟踪）。
- CMS PC 界面区分“中央配置可编辑 / 门店数据只读+纠正 / 交易只读”。
- 对账 + 监控。

---

## 13. 变更记录

| 版本 | 日期 | 变更 | 作者 |
|---|---|---|---|
| v1.1.0 | 2026-11-01 | **重大修正**：App 为 B 端生产经营管理运维端；门店级数据 App 第一写入并同步 CMS PC；中央配置 CMS→App；CMS 纠正走命令；新增双向版本/字段 owner/命令通道/验收 | TraeCode |
| v1.0.0 | 2026-11-01 | 初版（CMS 唯一维护、App 只读；已被本版替代） | TraeCode |
