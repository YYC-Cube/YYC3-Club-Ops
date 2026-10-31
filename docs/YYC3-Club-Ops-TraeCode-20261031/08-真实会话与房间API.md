---
file: 08-真实会话与房间API.md
description: YYC3-Club-Ops 真实会话与房间 API 实现报告 - TraeCode - 2026-10-31
author: AI Tutor <TraeCode>
version: v1.0.0
created: 2026-10-31
updated: 2026-10-31
status: active
tags: [phase2],[api],[session],[room],[auth]
category: report
---

# 🔐 真实会话与房间 API

## 1. 本次范围

在 Phase 2 Task 2.0/2.1 的契约与门店上下文基础上，落地**可运行的真实 API**：

- 服务端登录、HttpOnly Cookie 会话、登出撤销；
- 门店授权与跨店拒绝；
- 房间查询、开房、结账、清台、维修/恢复；
- 房间 PostgreSQL 事务持久化与幂等结账；
- 小时计费（超时 15 分钟进位，最低 1 小时）；
- 前端登录页与“真实 API / Mock”双模式切换。

> PostgreSQL + RLS 已落地；仍未实现：支付、POS、登录限流、CSRF Token、生产部署。

## 2. 运行方式

```bash
# 首次：建表 + 种子（需 .env.local 的 DATABASE_OWNER_URL）
pnpm db:migrate && pnpm db:seed

# 终端 1：Mock 预览（前端点）
pnpm dev            # http://localhost:3030

# 终端 2：真实 API
pnpm api:dev        # http://127.0.0.1:3032

# 前端切到真实 API
NEXT_PUBLIC_USE_MOCK=false \
NEXT_PUBLIC_API_BASE_URL=http://localhost:3032/api \
pnpm dev
```

真实模式演示账号（来自 `.env.development`）：

| 账号 | 密码 | 门店权限 |
| --- | --- | --- |
| `13800138000` | `yyc3-demo-2026` | 云枢旗舰店 + 滨江店 |
| `13900139000` | `yyc3-demo-2026` | 仅云枢旗舰店（用于验证 403） |

> `.env.development` 仅用于本地预览；生产必须覆盖 `SESSION_SECRET`、`DEMO_ADMIN_PASSWORD` 并开启 `COOKIE_SECURE=true`。

## 3. 架构

```text
Next.js 前端（3030）
  ├─ /login：账号密码登录
  ├─ useStoreContextStore：GET /auth/session
  └─ useRoomStore：读走 GET /stores/{storeId}/rooms
                  写走 start/checkout/clean/status

Node API（Hono，3032）
  ├─ 登录：scrypt 校验 → 服务端 Session 记录 → HMAC 签名 Cookie
  ├─ 鉴权中间件：校验签名 + 服务端会话表 + 门店授权
  ├─ 登录限流：IP/账号计数落库（PostgreSQL 函数）
  ├─ 认证 RLS：登录查询走 auth_lookup，会话按 tenant+user 作用域
  ├─ CSRF：会话绑定令牌，写操作校验 X-CSRF-Token
  ├─ 续期：/auth/refresh 滑动续期（绝对上限）
  ├─ 房间状态机：与前端共享 lib/domain/room-state.ts
  ├─ 计费：lib/pricing.ts（分单位 + 15 分钟进位）
  └─ 存储：PostgreSQL app schema（app 角色 + RLS）
```

## 4. API 清单

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| POST | `/api/auth/login` | 登录，下发 `yyc3_session` |
| GET | `/api/auth/session` | 获取会话与门店上下文 |
| POST | `/api/auth/logout` | 撤销服务端会话并清 Cookie |
| GET | `/api/stores` | 授权门店列表 |
| GET | `/api/stores/{storeId}/rooms` | 门店包厢 |
| GET | `/api/stores/{storeId}/rooms/{roomId}` | 包厢详情 |
| POST | `/api/stores/{storeId}/rooms/{roomId}/start` | 开房 + 创建进行中订单 |
| POST | `/api/stores/{storeId}/rooms/{roomId}/checkout` | 结账 + 计费 + 幂等 |
| POST | `/api/stores/{storeId}/rooms/{roomId}/clean` | 清台 |
| PUT | `/api/stores/{storeId}/rooms/{roomId}/status` | 维修/恢复/预定等手动状态 |

契约文件同步更新：`contracts/openapi.yaml`。

## 5. 安全设计

| 项 | 实现 |
| --- | --- |
| 密码 | `scrypt` + 随机盐，`timingSafeEqual` 校验；不存明文 |
| 会话 | HMAC-SHA256 签名 Token + 服务端 `sessions` 表；登出即撤销 |
| Cookie | `HttpOnly`、`SameSite=Lax`、`Path=/`；生产 `Secure` |
| 前端 Token | **移除 localStorage Token**，仅依赖 Cookie |
| 门店授权 | 每个房间路由二次校验 `session.stores`；未授权 403 |
| 登录限流 | IP 60/5min、账号 5/15min（落库）；超限 429 + `Retry-After` |
| 认证 RLS | `tenant/store/session` FORCE；登录查询走 `auth_lookup` definer 函数 |
| CSRF | 会话绑定同步令牌；写操作校验 `X-CSRF-Token`；缺失/伪造 403 |
| 会话续期 | `POST /auth/refresh` 滑动续期；`SESSION_MAX_LIFETIME_SECONDS` 绝对上限 |
| 跨店数据 | 前端服务层再校验 `room.storeId === storeId` |
| CORS | 仅允许 `APP_ORIGIN`（默认 `http://localhost:3030`）+ credentials |
| 错误 | 统一 `{success:false,error,code}`；不泄露堆栈 |
| 响应头 | `Cache-Control: no-store`、`X-Content-Type-Options: nosniff` |

## 6. 房间状态机与计费

状态机（前后端共享）：

```text
available → occupied → cleaning → available
    ↘ reserved ↗        ↘ maintenance ↗
```

计费规则（`lib/pricing.ts`）：

- 金额统一为“分”；
- 整小时后剩余 ≤15 分钟不进位，>15 分钟进位；
- 最低 1 小时；
- 结账返回 `billableHours` 与 `totalCents`。

示例：房价 ¥580/小时，消费 76 分钟 → 2 小时 → ¥1160.00。

> 该规则来自《YYC3-艺人管理-开发文档》的“超时 15 分钟进位”；门店级计费配置待 Phase 3。

## 7. 持久化（PostgreSQL + RLS）

- 专用库：`yyc3_club_ops` / 测试库 `yyc3_club_ops_test`；
- schema：`app`；表：`tenant/store/app_user/user_store/session/room/room_order/room_event`；
- 应用角色：`yyc3_club_ops_app`（非 superuser、非 bypassrls）；
- 迁移/种子角色：`yyc3_club_ops_owner`（仅用于 `pnpm db:migrate` / `db:seed`）；
- `room` / `room_order` / `room_event` 启用 **FORCE ROW LEVEL SECURITY**；
- 每次事务 `set_config('app.tenant_id'/'app.store_id', ..., true)`，未设置作用域返回 0 行；
- 结账在事务内 `SELECT ... FOR UPDATE` + 订单/房态/事件 + 唯一幂等键；
- 迁移：`db/migrations/001_init.sql`；种子：`server/db/seed.ts`。

**实测**：

- 应用角色无门店上下文查询 `app.room` → **0 行**；
- 设置旗舰店上下文 → 4 行；设置滨江店上下文 → 4 行（互不串店）；
- 开房/结账/清台后：`room_order` 1 条 paid、`room_event` 3 条、NAS 备库已同步；
- app 角色不能 INSERT `app_user/store`，只能 DML 业务表/会话。

**生产仍缺**：限流、CSRF、审计、备份/PITR、监控、连接池调优。

## 8. 前端接入

- `runtimeConfig` 统一读取 `NEXT_PUBLIC_USE_MOCK` / `NEXT_PUBLIC_API_BASE_URL`；
- `useRoomStore`：
  - Mock 模式：本地状态机（保证静态预览可用）；
  - 真实模式：调用服务层 → 用服务端返回的房间替换本地状态；
- 新增 `/login` 页面；`AppLayout` 在 `/login` 下不加载会话，避免无意义的 401；
- 侧栏会话错误提供“重试 / 去登录”；
- API 请求统一 `credentials: "include"`。

## 9. 验证结果

| 检查 | 结果 |
| --- | --- |
| `pnpm typecheck` | ✅ 0 error |
| `pnpm lint` | ✅ 0 error / 36 warning |
| `pnpm test` | ✅ **124 passed（14 文件）** |
| `pnpm test:coverage` | ✅ Stmts 93.08% / Branch 80.87% / Funcs 95.34% / Lines 94.99% |
| `pnpm test:e2e` | ✅ 14 passed（Mock 模式） |
| `pnpm build` | ✅ 14 页（含 `/login`） |
| `pnpm audit --prod --audit-level=high` | ✅ 0 漏洞 |
| 真实 API 浏览器实测 | ✅ 登录 → Cookie(HttpOnly) → 开房 → 结账 → 清台，0 console error |

真实 API 实测截图：`attachments/yyc3_phase2_real_api_flow.png`。

服务端集成测试覆盖：

- 登录成功/失败、未登录 401、登出撤销；
- 门店授权、跨店 403；
- 门店房间隔离；
- 开房 → 76 分钟结账（2 小时/¥1160）→ 清台 → 再开房；
- 幂等键重复结账返回同一订单；
- 非法状态迁移 409；
- 维修/恢复；
- PostgreSQL 集成：用户/门店/会话、RLS 门店隔离、开房/结账/清台、跨店拒绝；
- 密码与 Token 签发/篡改/过期。

## 10. 已知边界

| 边界 | 状态 |
| --- | --- |
| PostgreSQL / RLS | ✅ 已实现（业务表 + 认证表） |
| auth 表 RLS | ✅ 已启用（`002_auth_rls.sql`） |
| 登录限流 | ✅ IP + 账号双维度（429 + `Retry-After`） |
| CSRF Token | ✅ 同步令牌；写操作缺失/伪造 403 |
| 会话刷新 | ✅ 滑动续期 + 绝对上限（超限需重新登录） |
| 支付/退款/小票 | ❌ 未实现 |
| 登录/会话审计、强制下线 | ❌ 未实现 |
| 门店切换服务端持久化 | ⚠️ 前端切换，服务端按每个请求 storeId 校验 |
| GitHub Pages | ❌ 无法托管 API；仅静态 Mock 预览 |
| POS/管理模块 | ❌ 仍为占位 |
| 艺人管理域 | ❌ 未实现，见 `09-艺人管理域对接评估.md` |

## 11. 下一步

1. 登录/会话审计、强制下线；
2. POS 与库存/会员事务；
3. 生产部署（API + PostgreSQL TLS/备份/监控/HA）。
