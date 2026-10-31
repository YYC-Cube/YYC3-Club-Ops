# 数据库设计

> 生产/开发数据库：PostgreSQL 15（`yyc3_club_ops`，schema `app`）。
> 迁移事实源：`db/migrations/*.sql`；应用仓储：`server/repositories/postgres.ts`。

## 一、总体模型

```text
tenant（租户/品牌）
  └── store（门店）
        ├── room（包厢）
        │     ├── room_order（房间订单）
        │     └── room_event（操作事件）
        └── app_user（员工）── user_store（授权门店）
                              └── session（登录会话）
```

- 所有业务实体携带 `tenant_id + store_id`；
- 金额统一整数「分」；
- 时间统一 `timestamptz`（UTC 存储，展示用 `Asia/Shanghai`）。

## 二、核心表

### 2.1 `app.tenant`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | text PK | 租户 ID |
| `name` | text | 品牌名 |
| `status` | text | `active` / `suspended` |
| `created_at` / `updated_at` | timestamptz | 审计时间 |

### 2.2 `app.store`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | text PK | 门店 ID |
| `tenant_id` | text FK | 所属租户 |
| `code` | text | 门店编码（租户内唯一） |
| `name` | text | 门店名 |
| `timezone` / `currency` | text | 默认 `Asia/Shanghai` / `CNY` |
| `status` | text | `active` / `suspended` |

### 2.3 `app.app_user` 与 `app.user_store`

| 字段 | 类型 | 说明 |
|---|---|---|
| `app_user.id` | text PK | 用户 ID |
| `tenant_id` | text FK | 所属租户 |
| `phone` | text | 登录手机号（租户内唯一） |
| `role` | text | `admin` / `manager` / `cashier` / `waiter` |
| `password_salt` / `password_hash` | text | scrypt 摘要（不存明文） |
| `permissions` | text[] | 权限集合 |
| `status` | text | `active` / `suspended` |
| `user_store` | (user_id, store_id) PK | 员工可访问门店 |

### 2.4 `app.session`

| 字段 | 类型 | 说明 |
|---|---|---|
| `sid` | uuid PK | 会话 ID（Cookie 中签名携带） |
| `user_id` / `tenant_id` / `current_store_id` | text | 会话身份与当前门店 |
| `expires_at` | timestamptz | 单次有效期 |
| `revoked_at` | timestamptz | 登出即写入 |
| `csrf_token` | text NOT NULL | 会话绑定 CSRF Token（`003`） |
| `created_at` | timestamptz | 用于绝对有效期上限判断 |

### 2.5 `app.room` / `app.room_order` / `app.room_event`

| 表 | 关键字段 | 说明 |
|---|---|---|
| `room` | `status`、`price_cents`、`floor`、`capacity` | 唯一 `(store_id, name)` |
| `room_order` | `started_at`、`ended_at`、`billable_hours`、`total_cents`、`status`、`idempotency_key` | 唯一 `(store_id, idempotency_key)` |
| `room_event` | `action`、`actor_id`、`before`、`after` | 开房/结账/清台/状态变更审计 |

### 2.6 `app.login_throttle`（`002`）

| 字段 | 类型 | 说明 |
|---|---|---|
| `scope` | text | `ip` / `phone` |
| `key` | text | 来源 IP 或账号键 |
| `window_started_at` | timestamptz | 当前窗口起点 |
| `attempts` | int | 窗口内尝试次数 |
| `blocked_until` | timestamptz | 封禁截止时间 |
| `updated_at` | timestamptz | 清理依据 |

> 主键 `(scope, key)`；仅通过 `SECURITY DEFINER` 函数读写，应用角色无直连权限。

### 2.7 `app.auth_audit`（`004`）

登录/会话安全审计，**追加写**（应用角色仅 `SELECT` + `INSERT`，无 UPDATE/DELETE）。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | bigserial | 主键 |
| `tenant_id` | text, null | 登录失败且手机号不存在时为 `NULL`（仅 owner 可查） |
| `user_id` | text, null | 事件关联用户（被下线者/登录者） |
| `actor_id` | text, null | 操作者；`force_logout` 为管理员，其余与 `user_id` 一致 |
| `phone` | text, null | 登录尝试账号 |
| `event` | text | `login_success` / `login_failure` / `logout` / `session_refresh` / `force_logout` |
| `ip` | text, null | 来源 IP（`TRUST_PROXY=true` 时可取 `X-Forwarded-For`） |
| `user_agent` | text, null | 截断至 256 字符 |
| `created_at` | timestamptz | 默认 `now()` |

索引：`(tenant_id, created_at DESC)`、`(user_id, created_at DESC)`。

## 三、RLS 策略

| 表 | RLS | 作用域 |
|---|---|---|
| `room` / `room_order` / `room_event` | ENABLE + **FORCE** | `app.tenant_id` + `app.store_id` |
| `tenant` | ENABLE + **FORCE** | `app.tenant_id` |
| `store` | ENABLE + **FORCE** | `app.tenant_id` |
| `session` | ENABLE + **FORCE** | `app.tenant_id` + `app.user_id`；过期行允许清理 |
| `app_user` / `user_store` | ENABLE（不 FORCE） | `app.tenant_id`；登录前由 definer 函数读取 |
| `auth_audit` | ENABLE + **FORCE** | SELECT 按 `app.tenant_id`；INSERT 用 `IS NOT DISTINCT FROM` 同时放行空租户与本人租户；**无 UPDATE/DELETE 策略** → 不可篡改 |

作用域通过事务级 `set_config('app.tenant_id'/'app.store_id'/'app.user_id', ..., true)` 设置；未设置时查询返回 0 行。

### 3.1 认证函数

| 函数 | 用途 | 权限 |
|---|---|---|
| `app.auth_lookup(phone)` | 登录前精确取 1 行（含门店绑定） | 仅 app 角色 EXECUTE |
| `app.hit_login_throttle(...)` | 原子开窗/计数/封禁 | 仅 app 角色 EXECUTE |
| `app.reset_login_throttle(...)` | 登录成功清账号计数 | 仅 app 角色 EXECUTE |
| `app.prune_login_throttle(...)` | 清理历史计数 | 仅 app 角色 EXECUTE |
| `app.revoke_user_sessions(actor, tenant, user)` | 按用户撤销全部有效会话，**DB 层校验操作者为 manager/admin** | 仅 app 角色 EXECUTE |

所有函数 `REVOKE ALL ... FROM PUBLIC`，并固定 `SET search_path = app, pg_catalog`。

`revoke_user_sessions` 说明：`session` 为 FORCE RLS，管理员作用域只覆盖本人会话，因此该函数以 owner 身份执行，先校验操作者角色（纵深防御），再在事务内把 `app.user_id` 切换为目标用户完成撤销，返回撤销数量。

## 四、状态机

```text
available → occupied → cleaning → available
    ↘ reserved ↗       ↘ maintenance ↗
```

- 结账：`occupied → cleaning`，写订单 `paid` 与 `room_event(checkout)`；
- 清台：`cleaning → available`；
- 非法迁移由应用状态机 + 数据库事务共同拒绝（409）。

## 五、金额与计费

- 存储：`price_cents` / `hourly_rate_cents` / `total_cents`；
- 计费：整小时后 ≤15 分钟不进位，>15 分钟进位，最低 1 小时；
- 幂等：结账必须带 `Idempotency-Key`，唯一约束兜底。

## 六、迁移与种子

```bash
pnpm db:migrate          # 主库：001 → 002 → 003
pnpm db:migrate:test     # 测试库
pnpm db:seed             # 1 租户 / 2 门店 / 2 用户 / 8 包厢
pnpm db:seed:test
```

规则：

1. 只新增迁移文件（`NNN_*.sql`），不修改已应用历史；
2. 新表必须显式授权 app 角色；多店数据必须启用 RLS；
3. 涉及金额/权限/唯一约束的变更需 2 人评审；
4. 生产先迁移后发应用，回滚以兼容旧版本为目标。

## 七、前端类型映射

`lib/types.ts` 中的 `Tenant`、`Store`、`User`、`Session`、`Room` 与数据库字段一一对应：

- `Session.csrfToken` 仅真实 API 返回；
- 金额字段使用 `priceCents` 等整数；
- `Session.currentStoreId` 必须存在于 `stores`。

## 八、待建设

| 项 | 优先级 |
|---|---|
| 商品/库存/会员/支付表 | P0（Phase 2/3） |
| 操作审计查询与保留策略 | P1 |
| 会话审计（登录成功/失败、续期） | P1 |
| 分区/归档与备份恢复演练 | P1（生产） |

---

相关文档：[`11-认证RLS与登录限流.md`](./YYC3-Club-Ops-TraeCode-20261031/11-认证RLS与登录限流.md)、[`12-CSRF与会话刷新.md`](./YYC3-Club-Ops-TraeCode-20261031/12-CSRF与会话刷新.md)、[`10-PostgreSQL适用性分析.md`](./YYC3-Club-Ops-TraeCode-20261031/10-PostgreSQL适用性分析.md)。
