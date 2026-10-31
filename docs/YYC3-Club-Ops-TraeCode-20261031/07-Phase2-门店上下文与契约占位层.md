---
file: 07-Phase2-门店上下文与契约占位层.md
description: YYC3-Club-Ops Phase 2 Task 2.0/2.1 门店上下文与 API 契约占位层 - TraeCode - 2026-10-31
author: AI Tutor <TraeCode>
version: v1.0.0
created: 2026-10-31
updated: 2026-10-31
status: active
tags: [phase2],[multi-tenant],[store-context],[openapi],[contract]
category: report
---

# 🏬 Phase 2：门店上下文与契约占位层

## 1. 本次范围

本阶段只做 **Task 2.0（门店上下文）** 与 **Task 2.1（契约占位层）**，不实现真实后端、认证、数据库或 POS。

目标：

- 让“门店”成为前端数据访问的**唯一作用域**；
- 让 API 路径、实体模型、错误语义有可评审的契约；
- 在无后端时以**显式 Mock** 运行，且不把 Mock 伪装成生产成功；
- 为 Phase 2 后续的 POS、服务端、RLS 打地基。

## 2. 交付结构

```text
lib/
├── types.ts                         # Tenant / Store / Session / Room(priceCents) 等
├── api/
│   ├── routes.ts                    # 前端唯一路径事实源
│   └── routes.test.ts               # 路径构造 + OpenAPI 对齐测试
├── mocks/
│   └── preview-session.ts           # 显式预览数据：1 租户 / 2 门店 / 每店 4 包厢
├── services/
│   ├── session.ts                   # 会话加载 + 会话合法性校验
│   ├── store-scope.ts               # 门店授权、当前门店解析、跨店防御
│   └── rooms.ts                     # 门店包厢查询 + 跨店返回校验
├── stores/
│   └── useStoreContextStore.ts      # 会话/门店切换/错误状态
└── components/layout/store-switcher.tsx
contracts/
└── openapi.yaml                     # OpenAPI 3.1 契约占位
```

## 3. 门店上下文设计

### 3.1 Session 是唯一授权来源

```ts
interface Session {
  user: User            // storeIds + permissions
  tenant: Tenant
  stores: Store[]       // 会话授权门店列表
  currentStoreId: string
  expiresAt: string
}
```

规则：

1. `currentStoreId` 必须存在于 `stores`；
2. `stores` 必须全部属于同一 `tenant`；
3. 切换门店只允许 `stores` 内门店；
4. 未授权切换**直接拒绝**，不静默回退到第一个门店；
5. 无门店会话直接判定为不可用。

### 3.2 运行时数据流

```text
AppLayout
  └─ useStoreContextStore.loadSession()
       └─ getSession() → apiClient.getSession()
            └─ Mock: PREVIEW_SESSION / 真实: GET /auth/session
  └─ StoreSwitcher（授权门店下拉 + 重试）
RoomsPage / Dashboard
  └─ currentStoreId
       └─ useRoomStore.fetchRooms(currentStoreId)
            └─ listRooms(storeId) → GET /stores/{storeId}/rooms
                 └─ 响应逐条校验 room.storeId === storeId
```

### 3.3 写操作的双重作用域校验

`useRoomStore` 写操作必须同时满足：

- `activeStoreId` 已存在；
- 目标房间属于当前门店；
- 状态迁移合法。

任一失败：写入 `error` 并向调用方抛错，不允许静默成功。

## 4. 契约占位层

### 4.1 OpenAPI

`contracts/openapi.yaml` 定义：

- `/auth/session`、`/auth/login`、`/auth/logout`
- `/stores`
- `/stores/{storeId}/rooms`
- `/stores/{storeId}/rooms/{roomId}`
- `/stores/{storeId}/rooms/{roomId}/status`
- `/stores/{storeId}/rooms/{roomId}/start`
- `/stores/{storeId}/rooms/{roomId}/checkout`
- `/stores/{storeId}/rooms/{roomId}/clean`
- `/health`

关键约定：

| 约定 | 内容 |
| --- | --- |
| 门店作用域 | 路径显式携带 `storeId`；服务端二次校验会话授权 |
| 金额 | 整数“分”（`priceCents`、`totalCents`） |
| 会话 | HttpOnly Cookie 或 Bearer；禁止长期 Token 存 localStorage（生产） |
| 幂等 | 结账支持 `Idempotency-Key` |
| 错误码 | `unauthorized`、`forbidden_store`、`no_store`、`invalid_session`、`room_state_conflict`、`idempotency_conflict` 等 |
| 角色 | `admin / manager / cashier / waiter` |
| 权限 | 复用 `Permission` 枚举，服务端必须执行 |

### 4.2 路径事实源

`lib/api/routes.ts` 同时提供：

- `API_PATHS`：OpenAPI 模板路径；
- `apiRoutes`：运行时构造函数，自动编码与拒绝空参数。

`routes.test.ts` 会读取 `contracts/openapi.yaml` 并断言**每个模板路径都存在**，防止代码与契约漂移。

## 5. 显式 Mock 与预览模式

- `NEXT_PUBLIC_USE_MOCK` 默认 false；
- `.env.development` 显式设为 true，保证本地 `pnpm dev` 可运行；
- CI 的 GitHub Pages 预览构建显式设为 true；
- 生产必须为 false 并配置网关地址；失败抛 `ApiError`，不降级。

预览数据：

| 门店 | 包厢 |
| --- | --- |
| 云枢旗舰店 `store-demo-001` | VIP-01、VIP-02、STD-01、STD-02 |
| 滨江店 `store-demo-002` | 滨江-VIP、滨江-01、滨江-02、滨江-03 |

## 6. 验证结果

| 检查 | 结果 |
| --- | --- |
| `pnpm typecheck` | ✅ 0 error |
| `pnpm lint` | ✅ 0 error / 36 warning |
| `pnpm test` | ✅ **60 passed**（8 文件） |
| `pnpm test:coverage` | ✅ 行 93.37% / 分支 93.90% / 函数 84.74% |
| `pnpm test:e2e` | ✅ **14 passed** |
| `pnpm build` | ✅ 13 页；类型与 lint 校验执行 |
| `pnpm audit --prod --audit-level=high` | ✅ 0 漏洞 |

新增测试覆盖：

- 会话加载、幂等加载、force 重载、错误态；
- 门店授权/未授权切换、无门店会话；
- 跨店实体防御、空门店参数；
- 房间加载按门店隔离、跨店写操作拒绝；
- API 路径编码与 OpenAPI 路径一致性；
- E2E：切换门店后仅展示该门店包厢、390px 无溢出。

**实测截图**：

- `attachments/yyc3_phase2_store_flagship.png`：云枢旗舰店 + 门店切换器
- `attachments/yyc3_phase2_store_river.png`：切换到滨江店后的 4 个独立包厢
- `attachments/yyc3_phase2_dashboard_store.png`：管理端按当前门店展示

## 7. 已知边界（必须明确）

| 边界 | 状态 | 影响 |
| --- | --- | --- |
| 真实后端会话 | ❌ 未实现 | 目前仅 Mock/契约，不能真实登录 |
| 服务端 RBAC / RLS | ❌ 未实现 | 前端校验不能替代服务端授权 |
| 静态导出 | ⚠️ 仍存在 | 无鉴权、事务、支付回调能力 |
| POS / 管理模块 | ❌ 占位 | 业务仍不可生产 |
| 移动端门店切换 | ⚠️ 隐藏 | 小屏只显示当前门店名，不提供切换控件 |
| 会话刷新/过期 | ❌ 未实现 | 401 处理与刷新待 Phase 4 |
| OpenAPI 自动校验 | ⚠️ 仅路径对齐 | Schema 级校验待引入 Prism/Redocly |

## 8. 下一步（Phase 2 剩余）

1. 后端评审 `contracts/openapi.yaml`，冻结 v0.2 契约；
2. 实现 `GET /auth/session` 与服务端门店授权；
3. PostgreSQL + RLS，实现 `/stores/{storeId}/rooms` 与写接口；
4. 将 `useRoomStore` 从 Mock 切到真实服务层，加入 401/403/409 处理；
5. 迁移静态导出到 Node 运行时；
6. 再进入 POS（商品/购物车/支付/幂等）。

## 9. 验收结论

- Task 2.0（前端门店上下文）：**✅ 占位完成**；服务端会话/RLS 未完成。
- Task 2.1（契约占位）：**✅ 占位完成**；契约评审与真实实现未完成。
- 整体 Phase 2：**🟡 进行中**，不能标记完成。

> 后续真实会话与房间 API 已落地，见 [`08-真实会话与房间API.md`](./08-真实会话与房间API.md)。本文件保留 Task 2.0/2.1 的占位设计基线。
