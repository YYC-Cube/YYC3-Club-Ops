---
file: 11-认证RLS与登录限流.md
description: YYC3-Club-Ops 认证表 RLS 与登录限流落地 - TraeCode - 2026-10-31
author: AI Tutor <TraeCode>
version: v1.0.0
created: 2026-10-31
updated: 2026-10-31
status: active
tags: [phase2],[auth],[rls],[rate-limit],[security]
category: report
---

# 🔐 认证表 RLS 与登录限流

## 1. 本次范围

在 `001_init.sql`（业务表 RLS）基础上补齐认证侧安全能力：

- `002_auth_rls.sql`：`tenant/store/app_user/user_store/session` 五张认证表启用 RLS；
- 登录前查询收敛为 `app.auth_lookup(phone)`（SECURITY DEFINER，精确 1 行）；
- 会话读写改为 `tenant_id + user_id` 双重作用域，跨用户/跨租户读取返回 0 行；
- 登录限流落库（IP + 账号双维度），超限返回 `429` + `Retry-After`；
- 契约同步：`contracts/openapi.yaml` 增加 400/401/429 与 `Retry-After`。

> 仍未实现：CSRF Token、会话刷新、登录审计日志、锁定通知。

## 2. 数据库设计（002_auth_rls.sql）

### 2.1 认证表 RLS 策略

| 表 | RLS | 作用域键 | 说明 |
| --- | --- | --- | --- |
| `app.tenant` | ENABLE + **FORCE** | `app.tenant_id` | 仅能读当前租户 |
| `app.store` | ENABLE + **FORCE** | `app.tenant_id` | 仅能读当前租户门店 |
| `app.app_user` | ENABLE（不 FORCE） | `app.tenant_id` | 登录前无租户上下文，由 definer 函数读取 |
| `app.user_store` | ENABLE（不 FORCE） | `app.tenant_id` | 同上；函数内聚合 `store_ids` |
| `app.session` | ENABLE + **FORCE** | `app.tenant_id` + `app.user_id` | 本人可读写；过期行可被清理 |

为什么 `app_user`/`user_store` 不 `FORCE`：

- 登录发生在租户确定之前，应用角色此时没有任何作用域；
- 直接放开 SELECT 会泄露租户内所有账号；
- 因此只允许 owner 拥有的 `SECURITY DEFINER` 函数读取，函数**仅按手机号精确匹配 active 用户**，不接受任意过滤条件，应用角色仍受 RLS 约束（无上下文查询返回 0 行）。

### 2.2 会话策略

```sql
-- SELECT / INSERT / UPDATE：tenant_id = app.tenant_id AND user_id = app.user_id
-- DELETE：expires_at <= now()（仅清理过期会话，无需作用域）
```

- `getSession(sid, tenantId, userId)`：即使 sid 正确，跨用户/跨租户也返回 0 行；
- `revokeSession(sid, tenantId, userId)`：只能撤销本人会话；
- `cleanupExpiredSessions`：只依赖过期删除策略，不能删除有效会话。

### 2.3 最小权限函数

| 函数 | 用途 | 授权 |
| --- | --- | --- |
| `app.auth_lookup(text)` | 登录前按手机号精确取 1 行 + 门店绑定 | 仅 `yyc3_club_ops_app` EXECUTE |
| `app.hit_login_throttle(text,text,int,int,int)` | 原子完成开窗/计数/封禁 | 同上 |
| `app.reset_login_throttle(text,text)` | 登录成功清账号计数 | 同上 |
| `app.prune_login_throttle(int)` | 清理历史限流行 | 同上 |

- 全部 `REVOKE ALL ... FROM PUBLIC`；
- 函数固定 `SET search_path = app, pg_catalog`，防 search_path 注入；
- `login_throttle` 表不授予应用角色任何直连权限（手机号/IP 属敏感信息）。

## 3. 登录限流

### 3.1 规则与默认值

| Scope | 默认阈值 | 窗口 | 封禁 | 目的 |
| --- | --- | --- | --- | --- |
| `ip` | 60 次 | 300s | 300s | 限制单来源跨账号爆破 |
| `phone` | 5 次 | 900s | 900s | 限制单账号密码猜测 |

可用环境变量覆盖：`LOGIN_IP_LIMIT`、`LOGIN_IP_WINDOW_SECONDS`、`LOGIN_IP_BLOCK_SECONDS`、`LOGIN_PHONE_*`；`TRUST_PROXY=true` 时才采信 `X-Forwarded-For`。

### 3.2 执行顺序（server/app.ts）

```text
POST /api/auth/login
  1. 来源 IP 限流（解析请求体之前，防无效 JSON 绕过）
  2. 解析 + 校验参数（账号 ≤64、密码 ≤128）
  3. 账号限流
  4. 查询账号（auth_lookup）→ scrypt 校验
  5. 成功：reset(phone)；不清 IP
  6. 失败：保留计数 → 超限 429 + Retry-After
```

- 响应：`429 { success:false, code:"rate_limited" }` + `Retry-After`；
- 失败响应不区分“账号不存在/密码错误”，避免枚举；
- 限流实现：`PostgresLoginRateLimiter`（生产，多实例一致）/ `MemoryLoginRateLimiter`（单测）。

### 3.3 计数实现

- `app.login_throttle` 主键 `(scope, key)`；
- 单条 `INSERT ... ON CONFLICT DO UPDATE` 原子更新（开窗/计数/封禁），并发下不丢计数；
- 封禁到期后重新开窗（attempts=1）；
- 启动时 `prune_login_throttle(86400)` 清理一天前计数。

## 4. 代码变更

| 文件 | 变更 |
| --- | --- |
| `db/migrations/002_auth_rls.sql` | 新增：认证表 RLS、限流表/函数、auth_lookup |
| `server/rate-limit.ts` | 新增：限流端口 + 内存实现 + 默认策略 |
| `server/login-throttle.ts` | 新增：PostgreSQL 限流实现（consume/reset/prune） |
| `server/db/pool.ts` | 新增：共享连接池（仓储与限流复用） |
| `server/app.ts` | 登录前 IP/账号限流、429、`Retry-After`、会话调用传作用域 |
| `server/config.ts` | 新增限流配置解析与 `TRUST_PROXY` |
| `server/index.ts` | 注入 `PostgresLoginRateLimiter`，启动清理历史计数 |
| `server/ports.ts` | `getSession/revokeSession` 增加 tenant/user 参数 |
| `server/repositories/postgres.ts` | `withScope` 统一设置 tenant/store/user；`findUserByPhone` 改走 `auth_lookup` |
| `server/repositories/memory.ts` | 同步会话签名 |
| `server/db/seed.ts` | 种子前建立租户作用域（tenant/store 已 FORCE RLS） |
| `contracts/openapi.yaml` | 登录 400/401/429 + `Retry-After` |

## 5. 验证结果

### 5.1 迁移与种子

```text
pnpm db:migrate       ✅ applied 001_init.sql / 002_auth_rls.sql，app_tables=9
pnpm db:migrate:test  ✅ 同上（测试库）
pnpm db:seed          ✅ tenant=tenant-demo-001 stores=2 users=2
pnpm db:seed:test     ✅ 同上
```

### 5.2 RLS 实测（应用角色 `yyc3_club_ops_app`）

| 场景 | 结果 |
| --- | --- |
| 无租户上下文 `SELECT app.app_user` | **0 行** |
| 无用户上下文 `SELECT app.session` | **0 行** |
| 设置 `tenant-demo-001` 后 `app_user` | 2 行 |
| 设置 `tenant-demo-001` 后 `app.store` | 2 行 |
| 跨用户读取同一 sid（cashier） | `null` |
| 跨租户读取同一 sid | `null` |
| 应用角色直连 `app.login_throttle` | **42501 无权限** |

### 5.3 限流实测（真实 API `127.0.0.1:3032`）

```text
错误账号 13100000000 连续 6 次
attempt 1~5 → 401 unauthorized
attempt 6   → 429 rate_limited, Retry-After: 900
正确账号 13800138000 → 200（双门店会话）
GET /auth/session → 200
POST /auth/logout → 200
GET /auth/session（旧 Cookie）→ 401
数据库：ip 127.0.0.1 attempts=7 blocked=nil；phone 13100000000 attempts=6 blocked=+15min
```

### 5.4 门禁

| 检查 | 结果 |
| --- | --- |
| `pnpm typecheck` | ✅ 0 error |
| `pnpm lint` | ✅ 0 error / 36 warning |
| `pnpm test` | ✅ **108 passed（14 文件）** |
| `pnpm test:coverage` | ✅ Stmts 92.88% / Branch 80.82% / Funcs 95.06% / Lines 94.85% |
| `pnpm test:e2e` | ✅ 14 passed |
| `pnpm build` | ✅ 14 页 |
| `pnpm audit --prod --audit-level=high` | ✅ 0 漏洞 |

新增测试：

- `server/rate-limit.test.ts` 6 条：窗口/封禁/递减/重置/键规范化/scope 隔离；
- `server/app.test.ts` +3 条：账号封禁与恢复、成功重置、IP 先于解析；
- `server/repositories/postgres.test.ts` +2 条：认证表 RLS、限流函数与直连拒绝。

## 6. 已知边界

| 边界 | 状态 | 建议 |
| --- | --- | --- |
| CSRF Token | ✅ 已完成（见 `12-CSRF与会话刷新.md`） | — |
| 会话刷新 | ✅ 已完成（滑动续期 + 绝对上限） | — |
| 登录审计 | ❌ | 建议记录 success/failure + IP + UA（注意 PII 最小化） |
| 锁定通知 | ❌ | 可接入短信/企微告知管理员 |
| 限流清理 | ⚠️ | 启动时清理；多实例长期运行建议加定时任务 |
| 管理员解锁 | ❌ | 需要时加受审计的“手动解除封禁”接口 |

## 7. 后续

1. 登录/会话审计与强制下线；
2. RBAC 细粒度（角色/权限在数据库层校验）；
3. POS 结账与支付幂等；
4. 生产部署：TLS、备份/PITR、监控、`pg_hba` 收紧。
