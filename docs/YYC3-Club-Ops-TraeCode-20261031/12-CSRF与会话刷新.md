---
file: 12-CSRF与会话刷新.md
description: YYC3-Club-Ops CSRF 同步令牌与会话滑动续期落地 - TraeCode - 2026-10-31
author: AI Tutor <TraeCode>
version: v1.0.0
created: 2026-10-31
updated: 2026-10-31
status: active
tags: [phase2],[csrf],[session],[security],[refresh]
category: report
---

# 🛡️ CSRF 同步令牌与会话刷新

## 1. 本次范围

在认证表 RLS 与登录限流之后，补齐两项会话安全能力：

- **CSRF**：会话绑定同步令牌，写操作校验 `X-CSRF-Token`；
- **会话刷新**：`POST /auth/refresh` 滑动续期 + 绝对有效期上限；
- 前端自动续期（到期前 / 回到前台）与令牌内存管理；
- 契约、环境变量、开发文档同步。

## 2. 数据库（003_session_csrf.sql）

| 变更 | 说明 |
|---|---|
| `app.session.csrf_token text NOT NULL` | 每个会话独立随机令牌（32 字节 hex） |
| 历史行轮换 | 迁移期间临时 `NO FORCE`，写入随机值后立即恢复 `FORCE` |
| 绝对上限 | 复用 `session.created_at`，刷新时校验 `created_at >= now() - maxLifetime` |

> 未新增表；`002` 的 session RLS 策略覆盖新列。

## 3. 服务端实现

### 3.1 登录

```text
IP 限流 → 参数校验 → 账号限流 → scrypt 校验
  → 生成 sid + csrfToken
  → cleanupExpiredSessions
  → 事务写入 session（tenant/user/store/expires/csrf）
  → HMAC Cookie（HttpOnly/SameSite=Lax）
  → 返回 Session（含 csrfToken）
```

### 3.2 鉴权中间件

| 顺序 | 校验 |
|---|---|
| 1 | Cookie 存在且签名有效 |
| 2 | 会话记录存在、未撤销、未过期、身份匹配 |
| 3 | 用户/租户/门店查询（RLS 作用域） |
| 4 | **CSRF**：`POST/PUT/PATCH/DELETE` 校验 `X-CSRF-Token`（恒定时间比较） |
| 5 | `buildSession` 注入 csrfToken |

失败码：`403 csrf_invalid`。

### 3.3 刷新

`POST /api/auth/refresh`（需 CSRF）：

```sql
UPDATE app.session
   SET expires_at = to_timestamp($4 / 1000.0)
 WHERE sid = $1 AND tenant_id = $2 AND user_id = $3
   AND revoked_at IS NULL AND expires_at > now()
   AND created_at >= now() - make_interval(secs => $5)
RETURNING ...
```

- 成功：签发新 Cookie，返回新 `expiresAt`；CSRF Token 保持不变；
- 超过绝对上限 / 已过期：删除 Cookie，返回 `401 session_expired`。

### 3.4 登出

- 读取会话记录；存在则校验 CSRF → 撤销；
- 会话已失效时幂等返回 200 并清 Cookie。

## 4. 前端实现

| 文件 | 变更 |
|---|---|
| `lib/api/client.ts` | 内存保存 CSRF；写请求自动注入；`refreshSession()`；登出清空 |
| `lib/api/routes.ts` | 新增 `/auth/refresh` 路径 |
| `lib/services/session.ts` | 新增 `refreshSession()` 服务 |
| `lib/stores/useStoreContextStore.ts` | 新增 `refreshSession` 动作；门店授权变化时回退 |
| `components/layout/app-layout.tsx` | 到期前 30 分钟 / 回到前台自动续期 |

## 5. 验证结果

### 5.1 门禁

| 检查 | 结果 |
|---|---|
| `pnpm db:migrate` / `db:migrate:test` | ✅ 003 已应用 |
| `pnpm typecheck` | ✅ 0 error |
| `pnpm lint` | ✅ 0 error / 36 warning |
| `pnpm test` | ✅ **124 passed（14 文件）** |
| `pnpm test:coverage` | ✅ Stmts 93.08% / Branch 80.87% / Funcs 95.34% / Lines 94.99% |
| `pnpm test:e2e` | ✅ 14 passed |
| `pnpm build` | ✅ 14 页 |

### 5.2 真实 API 实测（3032）

```text
login=200，csrf_len=64
GET /auth/session（无 CSRF）=200
PUT /rooms/.../status（无 CSRF）=403 {"code":"csrf_invalid"}
PUT 状态（带 CSRF）=200 → 恢复=200
POST /auth/refresh（带 CSRF）=200，返回新 expiresAt 与新 Cookie
GET /auth/session（新 Cookie）=200
POST /auth/logout（无 CSRF）=403
POST /auth/logout（带 CSRF）=200
GET /auth/session（旧 Cookie）=401
```

### 5.3 自动化用例

| ID | 场景 | 结果 |
|---|---|---|
| CSRF-01 | 写操作缺少令牌 → 403 | ✅ |
| CSRF-02 | 伪造令牌 → 403 | ✅ |
| CSRF-03 | 正确令牌 → 200 | ✅ |
| CSRF-04 | GET 不需要令牌 | ✅ |
| CSRF-05 | 登出缺少令牌 → 403 | ✅ |
| REFRESH-01 | 刷新延长有效期并下发新 Cookie | ✅ |
| REFRESH-02 | 刷新缺少 CSRF → 403 | ✅ |
| REFRESH-03 | 仓储层绝对上限拒绝续期 | ✅ PostgreSQL 集成 |
| REFRESH-04 | 前端续期保留当前门店 / 回退默认门店 | ✅ 单测 |
| REFRESH-05 | 刷新失败进入 error | ✅ 单测 |

## 6. 已知边界

| 边界 | 说明 |
|---|---|
| 令牌轮换 | 续期不轮换 CSRF Token；如需轮换在 refresh 中重新生成 |
| 登录/续期/登出审计 | ✅ 已在 `13-审计与强制下线` 补全（`app.auth_audit`） |
| 强制下线 | ✅ 已在 `13-审计与强制下线` 补全（`POST /admin/users/{userId}/force-logout`） |
| 并发刷新 | 多标签页同时刷新会重复请求；结果幂等但可加去抖 |
| 绝对上限 | 默认 7 天，按业务可调 |

## 7. 后续

1. 登录/续期/登出审计与异常告警；
2. 管理员强制下线与会话列表；
3. CSRF Token 轮换策略；
4. POS 结账链路接入 CSRF 与幂等。

---

> ***YanYuCloudCube*** · *言启象限 | 语枢未来*
