# 02 — Project Context（前端契约快照）

> 基准：YYC3-Club-Ops `b750220`（2026-11-02）/ CMS `189fb9b`（2026-11-02）。
> 信息源：协同规范 03/04/05 + 双仓 git log；未逐文件复核，契约变更时 load order 第 4 步触发重读。
> 更新规则：前端契约（字段/路由/事件/命令）变更后，本文件必须随之重写并更新基准 commit。

## 双仓拓扑

| 仓 | 角色 | 路径 | 会话 |
|---|---|---|---|
| YYC3-Club-Ops | B端 App + 权威版主干 | `~/YYC-Cube/personal/YYC3-Club-Ops` | 本会话（sess_8c66b568） |
| YYC3-Clube-Management-System | CMS 后端 | `/Users/yanyu/YYC-Cube/personal/YYC3-Clube-Management-System` | 停用（方案 B，本会话兼管） |

镜像纪律：`docs/YYC3-Club-Ops_CMS协同规范` 两仓 `diff -rq` 必须 0 差异；90-session-memory 同规镜像。

## 技术栈

- Next.js 16.4.3 + React 19 + shadcn/ui + Radix UI + pnpm monorepo
- DB：PostgreSQL @5433，双库 `yyc3_club_ops` / `yyc3_yy`；Drizzle ORM（`db/migrations/`）
- 契约：`contracts/openapi.yaml`；Server Actions 与 Route Handlers 共用单一 Zod 契约源
- 硬约束：外部输入一律参数绑定；凭据只来自环境变量/密钥服务（S7 密钥双活）

## 同步通道（当前全通）

- **事件（App→CMS）**：Outbox + `master.*` 发布（协同规范 03 §1/§2/§3.6）
- **命令（CMS→App）**：拉取 + ACK 闭环，HMAC-SHA256 服务签名；白名单全开——
  `settings.update` / `updateProduct`（支持 eventExtra 透传）/ `record.archive` / `price.override`
- **投影口径**：增量合并 COALESCE 保旧 + archive 墓碑联动 + 乱序拒绝
- **审计口径**：价格覆写三元组 base/override/effective（overrideCents）

## 测试与门禁

- App 侧：`sync:e2e` 13 场景全过（含并发还原实证）；playwright + vitest（165 测试全绿）
- CMS 侧：jest + msw，resolver 五链映射 + `listen(error)` 全通；门禁基线 **52 失败套件 / 805 通过**（2026-11-02 XHR 专项后复测，见 05）
- msw XHR 拦截：已定案——@happy-dom/jest-environment docblock + rettime/until-async/deferred-promise esbuild 真实转译 vendor（再生脚本 `scripts/msw-vendor.sh`，升版必跑）
- react-compiler：purity/set-state 规则 error 严格态（7 处行级豁免白名单）

## 已知坑（勿重踩）

1. happy-dom 整包环境不兼容 Jest 29（已实证）；per-file docblock 方案已定案可用
2. msw 三 ESM 依赖（rettime 等）禁止回退 CJS stub——stub 缺 emitAsPromise 是 XHR 专项根因
3. 模块级 SQL 常量触发 Mimosa 误拦——函数内参数化模板可过
4. 多编辑后整文件 Write 前必须重读（防 stale 快照覆盖）
