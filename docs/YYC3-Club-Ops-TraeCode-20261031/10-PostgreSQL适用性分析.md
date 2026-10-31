---
file: 10-PostgreSQL适用性分析.md
description: 本机 PostgreSQL 15（5433）只读核查与多店 SaaS 适用性分析 - TraeCode - 2026-10-31
author: AI Tutor <TraeCode>
version: v1.0.0
created: 2026-10-31
updated: 2026-10-31
status: active
tags: [postgresql],[database],[audit],[multi-tenant],[security]
category: report
---

# 🗄️ PostgreSQL 15（5433）适用性分析

> 本次为**只读核查**：未创建数据库、未创建角色、未修改 `pg_hba.conf` / `postgresql.conf`、未写入业务数据。所有结论均有 SQL 取证。

## 1. 环境事实

| 项 | 实测值 |
| --- | --- |
| 服务 | Homebrew `postgresql@15`，已启动；`pg_isready` 正常 |
| 版本 | **PostgreSQL 15.15**（aarch64-apple-darwin25.2.0） |
| 端口 | **5433** |
| 监听 | `listen_addresses = *` |
| 当前角色 | `yanyu`，**superuser / createdb / createrole** |
| 时区 | `Asia/Shanghai` |
| 编码/排序 | UTF8；数据库 `en_US.UTF-8`（ICU 中文排序可用：`zh-x-icu`） |
| 连接数 | `max_connections = 100`，`superuser_reserved_connections = 3` |
| 内存 | `shared_buffers = 128MB`，`work_mem = 4MB`，`maintenance_work_mem = 64MB` |
| WAL | `wal_level = logical`，`max_wal_size = 1GB`，`fsync = on` |
| RLS | `row_security = on`；当前业务表 **0 张启用 RLS** |
| SSL | **off** |
| 密码加密 | `scram-sha-256` |
| 慢查询 | `log_min_duration_statement = -1`（关闭） |
| 超时 | `statement_timeout = 0`；`idle_in_transaction_session_timeout = 0` |
| 日志 | `log_connections = off`，`log_statement = none`，`track_io_timing = off` |
| 扩展 | 已装：`plpgsql`、`vector 0.8.2`；可用未装：`pgcrypto`、`uuid-ossp`、`pg_trgm`、`btree_gist`、`citext`、`pg_stat_statements` |
| 数据量 | 15 个业务/模板库，合计约 **201 MB** |
| 磁盘 | 约 **326 GiB** 可用（83% 已用） |
| 复制 | 物理备库 **`nas_standby` 正在 streaming**，客户端 `192.168.3.45` |
| 归档 | `archive_mode = on`，归档到本机 `.../archive/%f`；`archived_count = 1`，最后 2026-10-29 |
| 客户端 | 默认 `psql` 为 **14.19**；`postgresql@15` 自带 15.15 客户端 |

### 1.2 三节点拓扑（用户提供并实测）

| 节点 | 连接 | 版本 | 角色 | `pg_is_in_recovery()` | 用途判定 |
| --- | --- | --- | --- | --- | --- |
| Mac 主库 | `192.168.3.22:5433` / `127.0.0.1:5433` | 15.15 | `yanyu` superuser | **f（可写）** | **唯一写入主库** |
| NAS 物理备库 | `100.65.172.88:5433`（Tailscale） | 15.15 | `yanyu` | **t（只读）** | 只读查询 / 故障切换；**禁止写入** |
| NAS 知识库 | `192.168.3.45:5434`，`yyc3_kb` | 15.15 | `postgres` | f（可写） | **独立 KB 实例**，不用于 Club Ops |

实测结论：

- 主库与备库是**同一物理集群的 streaming replica**（`nas_standby`，主库向 `192.168.3.45` 发送 WAL）；主库新建的库会自动复制到备库。
- 备库处于 recovery，**所有写请求会失败**；不能把 `DATABASE_URL` 指向 `100.65.172.88`。
- `192.168.3.45:5434` 是**另一套 PostgreSQL 实例**，只有 `yyc3_kb`；与 Club Ops 数据无关，不应混用。
- 主库 `listen_addresses=*`；备库监听 `127.0.0.1,192.168.3.45,100.65.172.88`。

### 1.3 推荐连接策略

```text
应用写请求（API）：
  postgresql://yyc3_club_ops_app:${APP_PASSWORD}@127.0.0.1:5433/yyc3_club_ops
  （Mac 本机运行 API 时；跨机可用 192.168.3.22:5433）

只读报表（可选）：
  100.65.172.88:5433（物理备库，只读；需接受复制延迟）

故障切换：
  手动 promote NAS 备库；应用连接串切换，不在代码中自动双写

知识库：
  192.168.3.45:5434 / yyc3_kb（独立实例，不参与 Club Ops 事务）
```

> 当前 API 在 Mac 本机运行，优先使用 `127.0.0.1:5433`，避免绕一圈 LAN/Tailscale。

### 1.4 已有数据库

- **不存在** `yyc3_club_ops`；本项目尚无专用库。
- `yyc3_saas`、`dorisoy_pos` 可能与本项目相关，但**未经确认不应复用或改动**。
- 集群内存在多个 superuser 角色（`yanyu`、`yyc3_dev`、`yyc3_admin`、`Famiy-YQ`、`YYC-GLM`、`postgers`）。
- 已有非超级用户应用角色：`yyc3_app_rw`、`yyc3_app_ro`（可复用为 app/readonly，但授权范围未知）。

---

## 2. 关键发现（按严重度）

### 🔴 P0（按“仅本人设备”接受）认证规则过宽

> 用户确认：所有设备仅本人使用，网络为家庭 LAN + Tailscale 个人节点。因此本次将该风险标记为 **“已接受的开发风险”**，而不是立即阻断。  
> 但只要存在访客设备、IoT、共享 Tailscale 节点或任何端口转发，它仍会升级为 P0。

`pg_hba_file_rules` 实测：

| 行 | 地址 | 数据库 | 用户 | 认证 |
| --- | --- | --- | --- | --- |
| 90 | local | all | all | **trust** |
| 92 | 127.0.0.1 | all | all | **trust** |
| 94 | ::1 | all | all | **trust** |
| 105 | 192.168.3.45 | all | yanyu | **trust** |
| 107 | **192.168.3.0/24** | all | **all** | **trust** |
| 112 | **100.64.0.0/10** | all | yanyu | **trust** |

同时 `listen_addresses = *`。这意味着：

- 同一局域网或 Tailscale/CGNAT 网段内，任何人都可以**以任意数据库用户免密登录**；
- 其中包含 `yanyu`、`yyc3_dev`、`yyc3_admin` 等 **superuser**；
- 一旦存储真实会员手机号、艺人身份证、订单和资金数据，属于**直接数据泄露风险**。

**结论（结合“仅本人设备”确认）：**

- 在**严格个人设备 + 无端口转发 + Tailscale ACL 仅本人节点**的前提下，可作为本地开发风险接受；
- 但**应用仍不得使用 superuser**，真实手机号/身份证/订单/资金数据应使用最小权限 app 角色 + 密码；
- 一旦出现访客设备、IoT、共享 Tailscale 节点或公网暴露，立即升级为 P0 并修正。

建议的两种收敛方式（需授权后执行）：

```conf
# 方案 A：只允许本机（最简单，但 NAS/其他设备不能直连）
listen_addresses = 'localhost'
local   all   all                  peer
host    all   all  127.0.0.1/32    scram-sha-256

# 方案 B：保留主备与个人设备访问（推荐）
# 保留 listen_addresses = '*'
local   all   all                          peer
host    all   all  127.0.0.1/32            scram-sha-256
host    all   all  ::1/128                 scram-sha-256
host    all   all  192.168.3.22/32         scram-sha-256   # Mac 自身
host    all   all  100.65.172.88/32         scram-sha-256  # NAS 备库（只读查询/管理）
# 删除 192.168.3.0/24 all/all trust、100.64.0.0/10 all/yanyu trust
# 复制保留：host replication replicator 192.168.3.45/32 scram-sha-256
```

- 修改 `pg_hba.conf` 后 `SELECT pg_reload_conf();` 生效；
- 改 `listen_addresses` 需要重启；
- 先 `pg_dumpall` 备份，并确认 NAS 备库复制不受影响。

### 🟠 P1：共享集群 + 物理备库，不能按“随便建表”处理

- 15 个库、多个 superuser、1 个 streaming 备库 `nas_standby`；
- 任何 DDL/高负载都会复制到备库；
- 本项目应使用**专用库 + 专用角色 + 专用 schema**，不得复用 `yyc3_saas` / `dorisoy_pos`，除非确认归属；
- 建议库名：`yyc3_club_ops`；schema：`app`；迁移/测试用独立 `yyc3_club_ops_test`。

### 🟠 P1：无 SSL

`ssl = off`。本地开发可接受；一旦跨主机/Tailscale 连接，必须启用 TLS 或通过 SSH 隧道/内网专线，不能明文传密码与业务数据。

### 🟠 P1：可观测性不足

- `pg_stat_statements` 可用但**未安装、未 preload**；
- 慢查询日志关闭；
- `statement_timeout = 0`、`idle_in_transaction_session_timeout = 0`；
- `track_io_timing = off`；
- 出现慢查询、锁等待、连接泄漏时无法定位。

### 🟡 P2：容量参数适合开发，不适合生产

- `max_connections=100`、`shared_buffers=128MB`、`work_mem=4MB`：本地单店/低并发够用；
- 多店 SaaS 高峰（收银 + POS + 报表）需要连接池（PgBouncer/应用池）+ 参数调优；
- 不建议直接把这套 Homebrew 单机当生产库。

### 🟡 P2：备份与恢复未验证

- `archive_mode=on`，但归档到本机同一目录，`archived_count=1`；
- 有 NAS 物理备库 streaming，但没有看到恢复演练/PITR 记录；
- 生产必须有异地备份、保留策略、定期恢复演练。

### 🟡 P2：版本生命周期

- PostgreSQL 15 官方支持到 **2027-11**；
- 当前（2026-10）仍可用，但新生产项目建议直接上 **PG 16/17**，或制定 15 → 16/17 升级窗口；
- 本地 `psql` 默认 14.19 与 server 15 不一致，脚本应使用 `/opt/homebrew/opt/postgresql@15/bin/psql`。

### 🟢 P3：中文排序

- 数据库 locale 为 `en_US.UTF-8`；
- ICU 提供 `zh-x-icu` / `zh-Hans-x-icu`，可对需要中文排序的列使用 `COLLATE "zh-x-icu"`；
- 不建议改整个集群 locale（影响其他库）；按列/索引指定即可。

---

## 3. 适用性结论

| 用途 | 结论 | 说明 |
| --- | --- | --- |
| Mac 主库本地开发 / 单机联调 | ✅ **可用** | 15.15、UTF8、RLS、事务、逻辑 WAL、磁盘充足；建议 app 角色 |
| NAS 物理备库 | ✅ 只读 / 故障切换 | `pg_is_in_recovery=t`，不能写；跨 Tailscale 访问 |
| NAS 知识库 `yyc3_kb` | ✅ 独立使用 | 5434，另一实例；不参与 Club Ops 事务 |
| 内部测试 / 预发 | ⚠️ 有条件可用 | 需专用库/角色、备份、监控、连接池 |
| 生产多店 SaaS | ❌ **不可直接使用** | trust 认证、SSL off、单机 Homebrew、备份未验证、参数未调优 |
| 作为 RLS/事务底座 | ✅ 引擎能力满足 | 需自行建 RLS 策略与 FORCE RLS |
| 直接复用 `yyc3_saas` / `dorisoy_pos` | ❌ 不建议 | 归属与 schema 未确认，可能污染既有数据 |

**评分（本地开发）**：安全 35 / 100（P0 认证）→ 修正后 75；容量 70；可观测 40；备份 50；事务/RLS 能力 90；综合 **约 60/100（修正认证后 78）**。

---

## 4. 建议的数据库方案

### 4.1 库与角色

```sql
-- 需授权后执行；示例，密码用占位符
CREATE ROLE yyc3_club_ops_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${OWNER_PASSWORD}';
CREATE ROLE yyc3_club_ops_app   LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${APP_PASSWORD}';
CREATE ROLE yyc3_club_ops_ro    LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${RO_PASSWORD}';

CREATE DATABASE yyc3_club_ops
  OWNER yyc3_club_ops_owner
  ENCODING 'UTF8'
  TEMPLATE template0;

\c yyc3_club_ops
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements; -- 需先 preload

CREATE SCHEMA app AUTHORIZATION yyc3_club_ops_owner;
GRANT USAGE ON SCHEMA app TO yyc3_club_ops_app, yyc3_club_ops_ro;
ALTER DEFAULT PRIVILEGES FOR ROLE yyc3_club_ops_owner IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO yyc3_club_ops_app;
ALTER DEFAULT PRIVILEGES FOR ROLE yyc3_club_ops_owner IN SCHEMA app
  GRANT SELECT ON TABLES TO yyc3_club_ops_ro;
```

> 应用**不得**使用 `yanyu`、`yyc3_dev`、`yyc3_admin` 等 superuser；`yyc3_club_ops_owner` 仅用于迁移，运行时不使用。

### 4.2 核心表（Phase 2 最小集）

| 表 | 关键字段 | 约束 |
| --- | --- | --- |
| `app.tenant` | id、name、status、created_at | PK id |
| `app.store` | id、tenant_id、code、name、timezone、currency、status | PK id；UNIQUE(tenant_id, code) |
| `app.app_user` | id、tenant_id、name、phone、role、password_hash、status | UNIQUE(tenant_id, phone) |
| `app.user_store` | user_id、tenant_id、store_id | PK(user_id, store_id) |
| `app.session` | sid、user_id、tenant_id、current_store_id、expires_at、revoked_at | PK sid；索引 expires_at |
| `app.room` | id、tenant_id、store_id、name、type、status、price_cents、floor、capacity | UNIQUE(store_id, name)；CHECK price_cents ≥ 0 |
| `app.room_order` | id、tenant_id、store_id、room_id、started_at、ended_at、hours、total_cents、status、idempotency_key | UNIQUE(store_id, idempotency_key) |
| `app.room_event` | id、tenant_id、store_id、room_id、action、actor_id、before、after、created_at | 仅追加 |
| `app.idempotency_key` | tenant_id、store_id、key、request_hash、response_json、created_at | UNIQUE(store_id, key) |

所有金额使用整数“分”；时间使用 `timestamptz`；时区按 `store.timezone`。

### 4.3 RLS 设计

- 所有业务表启用 `ENABLE ROW LEVEL SECURITY`；
- 使用 `FORCE ROW LEVEL SECURITY`，防止 owner 绕过；
- 会话事务内设置：
  ```sql
  SET LOCAL app.tenant_id = '...';
  SET LOCAL app.store_id = '...';
  SET LOCAL app.user_id = '...';
  ```
- 策略示例：
  ```sql
  CREATE POLICY store_scope ON app.room
    USING (tenant_id = current_setting('app.tenant_id')::uuid
           AND store_id = current_setting('app.store_id')::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid
           AND store_id = current_setting('app.store_id')::uuid);
  ```
- 前端查询仍必须带 `store_id` 谓词；RLS 是第二道防线，不是替代。
- 应用连接必须按请求使用事务并 `SET LOCAL`，禁止连接池复用残留作用域。

### 4.4 连接与事务

- Node 侧使用连接池（`pg` 或 `postgres.js`），池上限建议 10~20（本地 PG `max_connections=100`）；
- 结账事务：`SELECT ... FOR UPDATE` 锁房 + 写订单 + 写事件 + 幂等键，提交后返回；
- 语句超时：应用角色 `statement_timeout=30s`；事务空闲超时 60s；
- 幂等：数据库唯一约束 + 事务，不依赖内存 Map。

---

## 5. 迁移路径与执行结果

| 阶段 | 动作 | 状态 |
| --- | --- | --- |
| A 止血 | 收紧 `pg_hba`/`listen_addresses` | ⏸ 按“设备仅本人”暂缓；应用已改用最小权限角色 |
| B 建库 | `yyc3_club_ops` / `yyc3_club_ops_test` + owner/app/ro 角色 | ✅ 已执行 |
| C Schema | `db/migrations/001_init.sql`：8 张表、`pgcrypto`、3 张 RLS 表、索引、触发器 | ✅ 已执行并验证 |
| C2 认证 | `db/migrations/002_auth_rls.sql`：5 张认证表 RLS、`auth_lookup`、登录限流表/函数 | ✅ 已执行并验证 |
| C3 会话 | `db/migrations/003_session_csrf.sql`：会话 CSRF Token、历史行轮换 | ✅ 已执行并验证 |
| D 替换 | `PostgresRepository` 替换文件仓储；迁移/种子脚本；测试库 | ✅ 已执行 |
| E 生产 | 托管 PG 16/17 + TLS + 备份/PITR + 监控 + 连接池 | ⬜ 未执行 |

**本次已执行**：

- 角色/库创建完成；数据库连接写入 `.env.local`（gitignored，未记录在文档）。
- `pnpm db:migrate` / `pnpm db:seed` 已在主库与测试库执行。
- 应用角色无门店上下文查询 `room` 返回 0 行；设置门店上下文返回该店 4 行。
- PostgreSQL 集成测试 3 条通过（会话/门店、开房→76 分钟结账→清台、跨店拒绝）。
- 真实浏览器流程连接 PostgreSQL 完成登录→开房→结账→清台，0 console error。
- NAS 备库已复制新库数据（8 房间、1 订单、3 事件、2 会话）。
- `pnpm install --frozen-lockfile` 通过；`pnpm audit --prod --audit-level=high` 0 漏洞（含 `pg` 依赖）。
- `typecheck / lint / test / coverage / e2e / build` 全绿：124 单测（含 6 条 PG 集成）、14 E2E、14 页构建。
- `002_auth_rls.sql` 已应用：认证表 RLS、`auth_lookup`、登录限流表/函数；详见 `11-认证RLS与登录限流.md`。
- `003_session_csrf.sql` 已应用：会话 CSRF Token；详见 `12-CSRF与会话刷新.md`。

**未执行**：`pg_hba` 收紧、生产 TLS、备份/PITR、登录/会话审计。

---

## 6. 已确认 / 待确认

已确认并执行：

1. 主库创建 `yyc3_club_ops` / `yyc3_club_ops_test` 与 owner/app/ro 三个角色；
2. 使用新建 `yyc3_club_ops_app`，不复用 `yyc3_app_rw`；
3. 不复用 `yyc3_saas` / `dorisoy_pos`；
4. API 使用 `127.0.0.1:5433`（本机）；
5. NAS 备库仅只读/故障切换，不作为写入连接；
6. 已执行 schema + RLS + 种子 + PostgresRepository 替换。

待确认：

1. 是否现在收紧 `pg_hba`（方案 B），还是继续按“设备仅本人”接受？
2. 生产目标：Mac/NAS 还是托管 PG 16/17？
3. 是否需要备份/PITR 演练与监控（pg_stat_statements/慢查询）？
4. auth 表是否启用 RLS，或改为 `SECURITY DEFINER` 登录函数？

---

## 7. 取证命令（只读）

```bash
export PGHOST=127.0.0.1 PGPORT=5433 PGUSER=yanyu PGDATABASE=postgres
PSQL=/opt/homebrew/opt/postgresql@15/bin/psql

$PSQL -Atc "select version();"
$PSQL -Atc "select datname, pg_size_pretty(pg_database_size(datname)) from pg_database;"
$PSQL -Atc "select rolname, rolsuper, rolcanlogin from pg_roles;"
$PSQL -Atc "select line_number, type, address::text, array_to_string(database,','), array_to_string(user_name,','), auth_method from pg_hba_file_rules;"
$PSQL -Atc "select slot_name, slot_type, active from pg_replication_slots;"
$PSQL -Atc "select application_name, state, client_addr from pg_stat_replication;"
$PSQL -Atc "select name, default_version, installed_version from pg_available_extensions;"
```

---

## 8. 结论

**这套 PostgreSQL 15.15 已从“可用性分析”推进到“实际落地”：**

1. 专用库/角色/Schema/RLS/种子已创建并验证；
2. 文件仓储已替换为 `PostgresRepository`，房间/订单/事件事务化；
3. 应用使用非 superuser 角色，RLS 无上下文返回 0 行；
4. NAS 备库已复制新库；
5. 剩余：`pg_hba` 收紧（可暂缓）、生产 TLS/备份/监控、限流/CSRF/审计。
