---
file: 14-POS点单与结账闭环.md
description: YYC3-Club-Ops POS 点单与结账闭环落地 - TraeCode - 2026-10-31
author: AI Tutor <TraeCode>
version: v1.0.0
created: 2026-10-31
updated: 2026-10-31
status: active
tags: [phase2],[pos],[checkout],[billing],[receipt]
category: report
---

# 🧾 POS 点单与结账闭环

## 1. 本次范围

把原先只有一个占位组件的 POS 收银台升级为完整闭环：

```text
开房 → 点单（价目表 / 库存扣减）→ 退单（回补库存）
     → 账单实时估算（房费 + 商品）
     → 结账（支付方式 + 幂等键）→ 小票 → 待清洁 → 清台 → 空闲
```

- 服务端：新增价目表、消费明细、账单与结账能力（含 RLS / 库存 / 幂等）；
- 前端：POS 收银台（包厢选择、商品网格、购物车、支付方式、小票弹窗）；
- 契约与文档同步，单测 / PG 集成 / E2E / 真实 API 冒烟全覆盖。

## 2. 数据库（005_pos_items.sql）

| 对象 | 说明 |
|---|---|
| `app.product` | 门店价目表：`name/category/unit/price_cents/member_price_cents/cost_cents/stock/status`，`UNIQUE(store_id, name)` |
| `app.room_order_item` | 消费明细：`order_id` 外键、`name_snapshot` + `unit_price_cents`（下单快照）、`quantity`、`total_cents`、`is_gift`、`created_by` |
| `app.room_order` 新列 | `payment_method`（cash/wechat/alipay/member_card/card）、`room_cents`、`items_cents`；`total_cents` = 房费 + 商品 |
| RLS | 两张新表 `ENABLE + FORCE`，作用域 `app.tenant_id + app.store_id` |
| 权限 | app 角色：`product` SELECT/INSERT/UPDATE；`room_order_item` SELECT/INSERT/UPDATE/DELETE；ro 只读 |

## 3. 服务端实现

| 端点 | 行为 |
|---|---|
| `GET /stores/{storeId}/products` | 仅返回本店 active 商品 |
| `GET /stores/{storeId}/rooms/{roomId}/bill` | 进行中账单：房费按 `now()` 实时估算 + 明细累计；无进行中订单 → 404 |
| `POST /stores/{storeId}/rooms/{roomId}/items` | 点单：锁订单与商品行，校验库存，快照单价，扣减库存，写 `room_event(order_add)` |
| `DELETE /stores/{storeId}/rooms/{roomId}/items/{itemId}` | 退单：删除明细，回补库存，写 `room_event(order_remove)` |
| `POST /.../checkout` | 合并房费与商品，写 `room_cents/items_cents/total_cents/payment_method`，返回小票，房间 → 待清洁 |

约束与防御：

- 全部写操作走 `requireAuth → CSRF → 门店授权 → 参数校验 → 事务作用域`；
- 数量限定 1–99；商品必须属于当前门店且 active（跨店商品直接 404）；
- 库存不足返回 `409 insufficient_stock`；
- 幂等键冲突返回 `409 idempotency_conflict`；重放沿用首次账单与支付方式，不重复扣库存；
- 商品与明细均在事务内 `FOR UPDATE`，避免并发超卖。

## 4. 前端实现

| 文件 | 变更 |
|---|---|
| `components/pos/pos-system.tsx` | 重写为收银台：包厢选择、分类/搜索、商品网格、购物车（退单）、房费/商品/应收、支付方式、小票 Dialog |
| `lib/stores/usePosStore.ts` | 新增：`load/refresh/addProduct/removeLine/settle`，依赖可注入（测试友好） |
| `lib/services/pos.ts` | 新增：价目表/账单/点单/退单/结账，含跨店与包厢一致性校验 |
| `lib/api/client.ts` | 新增 `getProductsForStore/getRoomBill/addRoomItem/removeRoomItem`；Mock 分支支持本地预览 |
| `app/(pos)/rooms/page.tsx` | 「结账（含明细）」改为进入 POS，避免跳过消费明细 |
| `components/room/room-detail-modal.tsx` | 消费中状态操作改为「点单」「结账（含明细）」 |

## 5. 验证结果

### 5.1 门禁

| 检查 | 结果 |
|---|---|
| `pnpm db:migrate` / `db:migrate:test` | ✅ 005 已应用（app_tables=12） |
| `pnpm db:seed` / `db:seed:test` | ✅ 每店 6 个商品（矿泉水/百威/洋酒套餐/果盘/瓜子/小吃拼盘） |
| `pnpm typecheck` | ✅ 0 error |
| `pnpm lint` | ✅ 0 error / 37 warning |
| `pnpm test` | ✅ **150 passed（16 文件）** |
| `pnpm test:coverage` | ✅ Stmts 92.23% / Branch 80.25% / Funcs 96.10% / Lines 93.97% |
| `pnpm test:e2e` | ✅ 15 passed |
| `pnpm build` | ✅ 14 页 |
| `pnpm audit --prod` | ✅ No known vulnerabilities |

### 5.2 真实 API 实测（3032 + PostgreSQL）

```text
GET /stores/store-demo-001/products → 6 条（含库存）
POST rooms/room-fs-vip-01/start → 200
POST items（果盘 ×2）→ 200 itemsCents=13600 roomCents=58000 total=71600
商品库存 30 → 28（扣减生效）
DELETE items/{id} → 200 itemsCents=0（库存回补）
POST items（果盘 ×1）→ 结账 wechat → 200 room=58000 items=6800 total=64800 roomStatus=cleaning
幂等重放（改 cash）→ 200 total=64800（沿用原 wechat，未重复计费）
GET bill（结账后）→ 404；POST clean → 200
POST items 缺 CSRF → 403
```

### 5.3 自动化用例

| ID | 场景 | 结果 |
|---|---|---|
| POS-01 | 价目表按门店返回，跨店商品不可见 | ✅ 单测 + PG |
| POS-02 | 未开房点单 → 409；缺 CSRF → 403；数量越界 → 400 | ✅ |
| POS-03 | 点单累计金额、库存扣减、退单回补 | ✅ 单测 + PG |
| POS-04 | 库存不足 → 409 `insufficient_stock`；跨店商品 → 404 | ✅ |
| POS-05 | 结账合并房费+商品，返回小票（orderNo/items/paymentMethod） | ✅ 单测 + PG + 实测 |
| POS-06 | 幂等重放不重复计费、不覆盖支付方式 | ✅ 单测 + PG + 实测 |
| POS-07 | 非法支付方式 → 400 `validation_error` | ✅ |
| POS-08 | 结账后账单 404、房间进入待清洁 | ✅ 单测 + PG + 实测 |
| POS-09 | POS 页点单/退单/出小票（浏览器） | ✅ E2E |

### 5.4 顺带修复

进入 POS 时会无条件重拉包厢列表，把房间页的最新状态覆盖回初始值（结账后返回列表显示「空闲」）。现改为：同门店已加载则不重拉；结账成功后同步房间 store 状态为「待清洁」，由 E2E 用例 `空闲包厢可完成开房 → POS 点单结账 → 清台` 守护。

## 6. 已知边界

| 边界 | 说明 |
|---|---|
| 会员价/折扣 | 仅快照标准价；会员价、折扣与免单策略待会员域接入 |
| 套餐/加料 | 未实现套餐组合与规格（口味）选择 |
| 支付网关 | 结账仅记录支付方式，未对接真实支付/退款 |
| 库存台账 | 仅扣减 `product.stock`，未区分仓库与出入库流水 |
| 小票打印 | 前端展示小票；未接入热敏打印机/打印模板 |
| 并发 | 事务 + 行锁已覆盖；高并发压测待补 |

## 7. 后续

1. 会员域接入（会员价、余额、积分抵扣）；
2. 套餐与商品规格（口味/加料）；
3. 支付网关与退款、小票打印；
4. 库存出入库流水与盘点。

---

> ***YanYuCloudCube*** · *言启象限 | 语枢未来*
