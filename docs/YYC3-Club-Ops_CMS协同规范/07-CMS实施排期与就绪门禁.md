---
file: 07-CMS实施排期与就绪门禁.md
description: 按双向协同规范 01 §10 就绪门禁，给出 CMS PC 侧中央配置、门店运营数据接收/投影、纠正命令、事件日志与对账的 10 周实施排期
author: AI Tutor <TraeCode>
version: v1.1.1
created: 2026-11-01
updated: 2026-11-01
status: plan
tags: [cms],[schedule],[readiness],[bidirectional],[operational-data],[command]
category: plan
---

# 🗓️ CMS 实施排期与就绪门禁（双向版）

> **定位**：Club-Ops App 是 **B 端生产经营管理运维端**，门店级数据由 App 创建/编辑/变更并同步 CMS PC；CMS PC 负责**中央配置、汇总、报表、审计与必要纠正**。
> **目标**：让 CMS 从“Mock 为主的管理后台”升级为**可接收 App 运营数据、可下发中央配置/纠正命令、可对账的中央数据平台**。
> **依据**：`01-协同定义总规范.md` §10.1；`02-主数据同步契约-CMS到App.md` v1.1。
> **周期**：10 周（2 名后端 + 1 名前端 + QA 兼职）。
> **前置**：CMS 为 Next 16 + Jest 57 suites/517 tests；新增能力必须保持现有测试全绿。

---

## 1. 现状基线（必须先承认）

| 能力 | 现状 | 影响 |
|---|---|---|
| 多租户 | ❌ 无 `tenant` 模型；`User/Product/Store` 只有 `storeId` | 无法做租户隔离与同步版本 |
| 中央配置 | ❌ 无 tenant/store 开通、全局模板、权限模板、报表定义 | App 无中央配置可拉取 |
| 同步 API | ❌ 无 `/api/v1/sync/*` | App 无法拉配置、回传运营数据/交易 |
| 服务认证 | ❌ 仅用户 JWT（localStorage） | 无法安全地服务间调用 |
| 运营数据接收 | ❌ 无 `operational_*` 投影表 | App 编辑的商品/会员/员工/艺人等无法汇总 |
| 事件日志 | ❌ 无 | 无法去重/重放/对账 |
| 纠正命令 | ❌ 无 | CMS PC 无法对门店错误数据做受控修正 |
| 对账 | ❌ 无 | App→CMS 差异无法发现 |
| 监控 | 🟡 有基础日志/安全扫描 | 无同步延迟/DLQ/命令/对账指标 |

**结论**：先补“数据接收与通道”，再谈“CMS PC 功能对齐”；不能先做 UI。

---

## 2. 工作分解（WBS）

### W1 租户、ID 与字段 owner 基线（P0）

| # | 任务 | 产出 | 验收 |
|---|---|---|---|
| W1.1 | `tenant` 表 + `store.tenant_id` | 迁移脚本 | 所有门店/投影可按租户过滤 |
| W1.2 | `user` 中央身份 + `user_store` 多门店 | 迁移 + 兼容读 | 员工可授权多店 |
| W1.3 | `sync_id_map` 表 | 映射表 | `cms:store_1 ↔ str_...` 可追溯 |
| W1.4 | 字段 owner 注册表 | `field_owner` 配置/代码 | 商品/员工/房型/设置等字段归属可校验 |
| W1.5 | ID 规则 | 文档 + 工具 | tenant/store/user 由 CMS 生成；product/member/artist 由 App 生成 |

**落点**：`scripts/migrations/20261101_tenant.sql`、`lib/db/tenant.ts`、`lib/sync/field-owner.ts`。

### W2 CMS 数据层：中央配置 + 运营投影（P0）

| # | 域 | 表/仓储 | 说明 |
|---|---|---|---|
| W2.1 | 租户/门店 | `tenant`、`store`、`store_area` | 中央开通信息 |
| W2.2 | 中央模板 | `global_catalog`、`global_pricing_template`、`permission_template`、`report_definition` | CMS 唯一写入 |
| W2.3 | 运营投影-商品 | `operational_product`、`operational_category`、`operational_package`、`operational_delivery`、`operational_snack`、`operational_price_strategy`、`operational_points` | 接收 App 数据（含 PC 手册商品 9 子模块） |
| W2.4 | 运营投影-房型/价格 | `operational_room`、`operational_pricing` | 接收 App 数据 |
| W2.5 | 运营投影-会员 | `operational_member`、`operational_member_level` | 接收 App 数据 |
| W2.6 | 运营投影-员工档案 | `operational_staff`、`operational_staff_group` | 不含密码 |
| W2.7 | 运营投影-艺人 | `operational_artist`、`operational_artist_rule` | 与现有艺人表衔接 |
| W2.8 | 运营投影-设置/仓库/库存/设备 | `operational_settings`、`operational_warehouse`、`operational_inventory`、`operational_device`、`operational_vod`、`operational_movie`、`operational_rule` | 接收 App 数据（含 PC 手册设置 10 子模块） |
| W2.9 | 接收日志/账单更正 | `sync_event_log`、`command_log`、`bill_adjustment` | 去重/顺序/命令状态/账单更正 |

> **评审补充（2026-11-01，见 [`09-评审记录-PC模块命令映射.md`](./09-评审记录-PC模块命令映射.md)）**：
> W2 建表按手册子模块拆批次，优先覆盖 **设置 10 + 艺人设置（13 表）→ 商品 9（12 表）→ 仓库 12（12 表）→ 报表 MVP 4 组/8 张（5 表）**；W2.3/W2.8 的聚合表需按该批次拆细（补 flavor / room_package / price / time_rule / supplier / stock_policy / device / vod / movie / artist_setting 等），否则命令边界与字段 owner 无法落地。

**落点**：`lib/db/repositories/operational/*.ts`、`lib/db/repositories/central/*.ts`、`scripts/migrations/20261101_sync.sql`。

### W3 中央配置 API（CMS→App，P0）

| # | 任务 | 产出 | 验收 |
|---|---|---|---|
| W3.1 | `GET /api/v1/sync/master/{domain}` | 快照/增量/分页 | `since`、`centralVersion`、`tombstones` 正确 |
| W3.2 | 版本发布器 | 每次中央配置写入递增版本 | 同一实体只返回最新版本 |
| W3.3 | 墓碑 | 软删除 + `deleted_at` | App 可感知删除 |
| W3.4 | 引用完整性 | 发布前校验 | 悬空引用 `409 reference_conflict` |
| W3.5 | ETag/304 | 无变化快速返回 | 降低轮询成本 |
| W3.6 | 全量重建 | 管理端点/脚本 | 清空缓存可恢复 |

**落点**：`app/api/v1/sync/master/[domain]/route.ts`、`lib/sync/central-publisher.ts`。

### W4 服务认证与安全（P0）

| # | 任务 | 产出 | 验收 |
|---|---|---|---|
| W4.1 | HMAC-SHA256 签名校验 | `lib/security/service-auth.ts` | 方法/路径/时间戳/nonce/body hash |
| W4.2 | KeyId + 密钥轮换 | 双 Key 并存 | 轮换期无中断 |
| W4.3 | 重放防护 | nonce 缓存 + ±5 分钟 | 旧请求 401 |
| W4.4 | 来源限制 | IP allowlist/网关 | 非授信来源 403 |
| W4.5 | 租户/门店校验 | 事件/配置必须带 tenant/store | 跨租户 403 |
| W4.6 | 字段 owner 校验 | 事件只改 App 字段 | `forbidden_field` |

### W5 事件接收与运营投影（P0）

| # | 任务 | 产出 | 验收 |
|---|---|---|---|
| W5.1 | `POST /api/v1/sync/events/batch` | 批量接收 | ≤100/批；ACK 格式正确 |
| W5.2 | `sync_event_log` + 去重 | 事件日志表 | `event_id` 唯一；重复返回 duplicate |
| W5.3 | 分支处理 | 交易 / `master.*` / `command.*` | 三类事件正确路由 |
| W5.4 | 运营投影：商品/套餐/营销/房型 | `operational_*` | 5s 内更新；字段 owner 正确 |
| W5.5 | 运营投影：会员/员工/艺人 | `operational_*` | 余额/台费/权限正确 |
| W5.6 | 运营投影：设置/仓库单据/库存/设备/VOD | `operational_*` | 开关/库存/打印/影片正确 |
| W5.7 | 交易投影 | 订单/账单/支付/房态/交接/寄存/审批/任务 | 金额/状态正确 |
| W5.8 | 重放/重建 | 按 aggregate/time | 结果与首次一致 |

**落点**：`app/api/v1/sync/events/batch/route.ts`、`lib/sync/event-ingest.ts`、`lib/sync/projections/*.ts`。

### W6 纠正命令中心（P0）

| # | 任务 | 产出 | 验收 |
|---|---|---|---|
| W6.1 | `GET /api/v1/sync/commands` | App 拉取命令 | `since`/`commandVersion` 正确 |
| W6.2 | `POST /api/v1/sync/commands/{id}/ack` | ACK/拒绝 | 更新命令状态 |
| W6.3 | 命令生成 UI/API | CMS PC “纠正”按钮 | 只允许中央配置/受控门店字段 |
| W6.4 | 命令审计 | `command_log` | 谁发/谁批/App 是否应用 |
| W6.5 | 超时/重试/告警 | 任务 | 未 ACK >10 分钟告警 |
| W6.6 | 并发冲突 | `version_conflict` | 不丢数据、不覆盖 App 新编辑 |

### W7 CMS PC 界面与运维（P1）

| # | 任务 | 产出 | 验收 |
|---|---|---|---|
| W7.1 | 中央配置管理 | 租户/门店/全局模板/权限模板/报表定义 | 可直接编辑 |
| W7.2 | 门店数据视图 | 商品/套餐/价格/会员/员工/艺人/设置/仓库单据/设备/VOD/影片 | **只读 + 纠正/导入命令** |
| W7.3 | 交易/报表/账单视图 | 订单/账单/支付/交接/寄存/审批/任务/账单更正 | 只读 + 报表；账单更正走命令 |
| W7.4 | 同步监控页 | `/dashboard/sync` | 各域版本/延迟/DLQ/命令 |
| W7.5 | 事件日志查询 | 筛选/详情/重放 | 权限受限 |
| W7.6 | 对账页面 | 差异列表/趋势 | 财务可用 |

**关键**：CMS PC 的“数据管理”必须区分三类数据，不能把门店数据做成可直接编辑的表单。

### W8 质量与上线（P0）

| # | 任务 | 产出 | 验收 |
|---|---|---|---|
| W8.1 | 契约测试 | `__tests__/sync/*` | 双向配置/运营事件/命令/幂等/乱序/租户 |
| W8.2 | 沙箱联调 | 与 Club-Ops dev | 用例 C1~C14/T1~T12/S1~S8/R1~R5 |
| W8.3 | 性能 | 运营 1000 条、事件 100/批 | P95 达标 |
| W8.4 | 安全 | 签名/重放/PII/权限 | 0 高危 |
| W8.5 | 灰度 | 1 店 → 10% → 全量 | 对账 0 差异 |
| W8.6 | 回滚演练 | 关闭开关/重建投影 | 30 分钟内恢复 |

---

## 3. 10 周排期

| 周 | 工作包 | 里程碑 | 交付 |
|---|---|---|---|
| W1 | W1 | M1 租户/ID/字段 owner 基线 | tenant 迁移、ID 映射、field owner |
| W2 | W2（中央配置） | M2 中央配置表 | tenant/store/模板/权限/报表定义 |
| W3 | W2（运营投影） | M3 运营投影表 | 商品/房型/价格/会员/员工/艺人/设置/仓库 |
| W4 | W3 | M4 中央配置 API | 快照/增量/墓碑/ETag |
| W5 | W4 | M5 服务认证 | 签名/重放/租户/字段 owner |
| W6 | W5（交易+运营事件） | M6 事件接收 | batch + event log + 分支 |
| W7 | W5（投影） | M7 运营/交易投影 | operational/transaction 投影 |
| W8 | W6 | M8 命令中心 | 拉取/ACK/审计/冲突 |
| W9 | W7 + 对账 | M9 CMS PC 视图 + T+1 对账 | 中央可编辑/门店只读+纠正/报表 |
| W10 | W8 | M10 灰度与上线 | 契约测试/监控/回滚 |

> 关键路径：W1 → W2 → W5 → W6；W3/W4 可与 W2 并行；W7 依赖 W5 投影。

---

## 4. 门禁映射（01 §10.1）

| 门禁项 | 工作包 | 验收证据 |
|---|---|---|
| tenant 模型 + store.tenant_id | W1 | 迁移执行截图/SQL |
| 中央配置表 + `/sync/master/*` | W2/W3 | OpenAPI + 契约测试 |
| `/sync/events/batch` | W5 | 批量 ACK/去重/乱序测试 |
| `operational_*` 投影 | W2/W5 | 商品/会员/员工/艺人/设置数据正确 |
| 纠正命令中心 | W6 | 下发/应用/拒绝/并发测试 |
| 服务认证 + 字段 owner | W4 | 伪造/重放/越权字段用例 |
| CMS PC 三类视图 | W7 | 中央可编辑/门店只读+纠正 |
| T+1 对账 | W9 | 0 差异报告 |
| 审计/监控 | W7 | 看板 + 告警截图 |

---

## 5. RACI

| 事项 | R | A | C | I |
|---|---|---|---|---|
| 租户/ID/字段 owner | CMS 后端 | CMS 负责人 | 架构组/App 负责人 | QA |
| 中央配置 | CMS 后端 | CMS 负责人 | 运营/财务 | QA |
| 运营投影 | CMS 后端 | 架构组 | App 负责人 | 财务 |
| 事件接收 | CMS 后端 | 架构组 | App 负责人 | 运维 |
| 纠正命令 | CMS 后端/前端 | CMS 负责人 | App 负责人/安全 | 运营 |
| 对账 | 财务/数据 | 项目负责人 | 两侧后端 | 运维 |
| 灰度上线 | 运维 | 项目负责人 | QA/安全 | 全员 |

---

## 6. 风险与对策

| 风险 | 等级 | 对策 |
|---|---|---|
| 仍按“CMS 主数据、App 只读”旧模型开发 | 高 | 以本文件 v1.1 + `02` v1.1 为准；评审签字 |
| CMS PC 直接编辑门店表导致双写 | 高 | 门店视图只读 + 纠正命令；数据库权限禁止直写 |
| App 事件字段越权 | 高 | field owner 校验 + `forbidden_field` |
| 历史数据无 tenant/store | 高 | 先回填 + 校验 + 只读窗口 |
| 金额元→分迁移误差 | 高 | 统一转换函数 + 对账抽样 |
| 事件乱序/重复 | 高 | event log + sequence + 幂等测试 |
| 命令与 App 并发 | 高 | recordVersion + `version_conflict` + 重新下发 |
| 10 周排期过紧 | 中 | P0 先上；对账/监控可延后 1~2 周 |
| 与 App 版本不兼容 | 中 | 契约先冻结；双版本并行 |
| 安全漏洞存量 | 中 | 独立审计；不复用 Dashboard 依赖 |

---

## 7. 完成定义（DoD）

- [ ] 01 §10.1 全部勾选。
- [ ] `pnpm type-check` / `lint` / `test` / `build` 全绿（57 suites/517 tests 不回归）。
- [ ] 契约测试覆盖中央配置/运营事件/命令/幂等/乱序/租户/重放。
- [ ] 沙箱联调用例 C1~C14、T1~T12、S1~S8、R1~R5 通过。
- [ ] App 编辑商品/会员/员工/艺人后，CMS 5s 内可见。
- [ ] CMS 纠正命令可下发/应用/回执；并发冲突不丢数据。
- [ ] CMS PC 门店数据只读 + 纠正，不能直接编辑。
- [ ] 对账 T+1 0 差异；差异单可追溯。
- [ ] 监控/告警/重放/回滚演练完成。

---

## 8. 变更记录

| 版本 | 日期 | 变更 | 作者 |
|---|---|---|---|
| v1.1.0 | 2026-11-01 | **重大修正**：CMS 不再是门店主数据唯一写入方；改为中央配置 + 运营投影 + 纠正命令；重写 WBS/排期/门禁/RACI/风险 | TraeCode |
| v1.0.0 | 2026-11-01 | 初版（CMS 唯一维护主数据、App 只读；已被本版替代） | TraeCode |
