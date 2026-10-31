# 系统架构

## 概览

YYC³ Club Management System 是 KTV 前台收银与运维管理系统，采用 Next.js App Router 路由分组实现**前台收银**和**运维管理**两大模块的代码组织隔离。

## 路由架构

```
app/
├── page.tsx                → 客户端重定向到 /rooms
├── layout.tsx              → 根布局（AppLayout 侧边栏）
│
├── (pos)/                  → 前台收银 Route Group
│   ├── rooms/page.tsx      → 包厢状态看板 + 详情弹窗 + POS 入口
│   └── pos/page.tsx        → 独立 POS 收银终端
│
└── (admin)/                → 运维管理 Route Group
    ├── dashboard/page.tsx  → 经营数据看板（营收、订单、包厢利用率）
    ├── reports/page.tsx    → 报表分析（趋势图、品类占比、会员统计）
    ├── members/page.tsx    → 会员管理（CRUD、等级、积分、余额）
    ├── inventory/page.tsx  → 库存管理（进销存、预警、盘点）
    ├── staff/page.tsx      → 员工管理 + 权限 + 组织架构
    └── settings/page.tsx   → 系统设置（门店、打印、支付、安全）
```

Route Group `(pos)` 和 `(admin)` **不影响 URL**，仅做代码组织。所有页面共享同一套根布局。

## 布局系统

### AppLayout（`components/layout/app-layout.tsx`）

双模块导航布局：
- **左侧边栏**：双 Tab 切换（前台收银 / 运维管理）
- **顶部栏**：面包屑导航 + 通知/AI 助手按钮
- **主内容区**：渲染当前路由页面

### 侧边栏导航

```
前台收银 Tab:
  ├── 包厢管理  /rooms     [核心]
  └── 点单收银  /pos       [热门]

运维管理 Tab:
  ├── 经营看板  /dashboard
  ├── 报表分析  /reports
  ├── 会员管理  /members
  ├── 库存管理  /inventory
  ├── 员工管理  /staff
  └── 系统设置  /settings
```

## 状态管理

| Store | 文件 | 说明 |
|---|---|---|
| `useStoreContextStore` | `lib/stores/useStoreContextStore.ts` | 会话、门店切换、续期、错误状态 |
| `useRoomStore` | `lib/stores/useRoomStore.ts` | 包厢状态机（开房/结账/清洁/维修/恢复） |
| `useOrderStore` | `lib/stores/useOrderStore.ts` | 订单列表与创建（Phase 2 接入真实数据） |

- Mock 模式使用本地状态机；真实模式通过 `lib/services/*` 调用 API，并以服务端返回值为准。
- 门店作用域唯一来源是 `Session.currentStoreId`，刷新页面前不持久化到 localStorage。
- 会话在 `AppLayout` 中按剩余时间自动续期（到期前 30 分钟或回到前台时）。

## API 客户端

`lib/api/client.ts` — 显式 Mock 的 API 客户端：

- 仅当 `NEXT_PUBLIC_USE_MOCK=true` 时使用 Mock 数据
- 生产/真实模式必须配置 `NEXT_PUBLIC_API_BASE_URL`
- 请求失败（网络、超时、4xx/5xx）**必须抛出错误**，不再静默降级
- 统一 `ApiError`，包含 `status` 与错误码
- 写请求自动附加 `X-CSRF-Token`（会话绑定，内存保存，不落 localStorage）
- 登录/会话/续期响应会同步更新客户端 CSRF 令牌

## 门店上下文（多店 SaaS）

- `Session`（`lib/types.ts`）包含 `tenant`、`user.storeIds`、`stores`、`currentStoreId`。
- `useStoreContextStore` 负责加载会话、切换门店与错误状态；未授权门店直接拒绝。
- `lib/services/store-scope.ts` 提供授权判断、当前门店解析与跨店防御。
- 所有门店相关 API 使用 `/stores/{storeId}/...`，前端再做一次实体归属校验。
- `StoreSwitcher` 仅展示会话授权门店；移动端当前隐藏切换器（已知限制）。

## API 契约

- 契约文件：`contracts/openapi.yaml`（OpenAPI 3.1）
- 前端路径事实源：`lib/api/routes.ts`
- 对齐测试：`lib/api/routes.test.ts` 断言每个模板路径存在于契约中
- 金额统一整数“分”；结账支持 `Idempotency-Key`

## 服务端 API（真实模式）

- 运行：`pnpm api:dev`（默认 `http://127.0.0.1:3032`）
- 框架：Hono + `@hono/node-server`
- 认证：scrypt 密码 + HMAC 会话 Token + 服务端会话表 + HttpOnly Cookie
- CSRF：会话绑定同步令牌，写操作校验 `X-CSRF-Token`
- 续期：`POST /api/auth/refresh` 滑动续期 + 绝对上限
- 限流：IP/账号双维度落库（`app.login_throttle`）
- 房间：`/api/stores/{storeId}/rooms` 查询与开房/结账/清台/状态
- 计费：`lib/pricing.ts`（分单位、超时 15 分钟进位、最低 1 小时）
- 存储：PostgreSQL（`app` schema），`server/repositories/postgres.ts`
- RLS：业务表 `tenant_id + store_id`；认证表按租户/本人作用域
- 迁移/种子：`pnpm db:migrate` / `pnpm db:seed`（需 `.env.local` 的 owner 连接）
- 前端切换：`NEXT_PUBLIC_USE_MOCK=false` + `NEXT_PUBLIC_API_BASE_URL=http://localhost:3032/api`
- 契约：`contracts/openapi.yaml` + `lib/api/routes.ts`

> 详见 `docs/YYC3-Club-Ops-TraeCode-20261031/08-真实会话与房间API.md`、`11-认证RLS与登录限流.md` 与 `12-CSRF与会话刷新.md`。

## 安全链路

```text
浏览器
  └─ 登录（IP/账号限流）→ 服务端 scrypt 校验
       └─ 创建 session（tenant/user/expires/csrf）
            └─ HMAC Cookie（HttpOnly + SameSite=Lax）
                 └─ 每次请求：签名 → 会话表 → 门店授权 → CSRF（写操作）
                      └─ 事务 set_config(tenant/store/user) → PostgreSQL RLS
```

- 未授权门店：403 `forbidden_store`；
- CSRF 失败：403 `csrf_invalid`；
- 会话过期/超绝对上限：401 `session_expired`；
- 登录超限：429 `rate_limited` + `Retry-After`。

## 多店 SaaS 约束

- 所有领域实体必须携带 `storeId`；查询/写入必须由服务端校验门店归属。
- 当前静态导出仅用于开发预览，Phase 2 将迁移到支持服务端的部署形态。
- 详见 `docs/YYC3-Club-Ops-TraeCode-20261031/06-架构决策-多店SaaS.md`。

## 数据类型

`lib/types.ts` — 自包含类型定义：

| 类型 | 说明 |
|---|---|
| `Room` / `RoomStatus` / `RoomType` | 包厢数据 |
| `Order` / `OrderItem` / `OrderType` | 订单数据 |
| `Product` | 商品数据 |
| `Member` | 会员数据 |
| `User` / `UserRole` / `Permission` | 用户与权限 |
| `Session` | 会话 + 门店上下文 + CSRF Token |
| `Tenant` / `Store` | 多店 SaaS 层级 |
| `ApiResponse<T>` | 统一 API 响应 |
