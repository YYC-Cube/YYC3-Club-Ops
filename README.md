<div align="center">
  <img src="./public/yyc3-family.png" alt="YYC³ Club Ops — 多店 KTV 运营 SaaS" width="100%" />
</div>

<div align="center">

# YYC³ Club Ops

> **多店 KTV 运营 SaaS** · 前台收银 · 包厢运营 · 经营分析
>
> **当前状态：开发预览版（非生产）** · [club.yyc3.top](https://club.yyc3.top)

<!-- 徽章：设计规范见 docs/BRAND_BADGES.md -->
[![状态](https://img.shields.io/badge/status-preview-orange?style=flat-square)](#状态说明)
[![Next.js](https://img.shields.io/badge/Next.js-15.5.28-black?style=flat-square&logo=nextdotjs)](#技术栈)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](#技术栈)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)](#技术栈)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?style=flat-square&logo=postgresql)](#技术栈)
[![Tests](https://img.shields.io/badge/tests-124%20passed-3FB950?style=flat-square)](#质量命令)
[![License](https://img.shields.io/badge/license-MIT-yellow?style=flat-square)](./LICENSE)
[![Docs](https://img.shields.io/badge/docs-YYC3%20Standards-blueviolet?style=flat-square)](./docs/README.md)

[![CI](https://github.com/YYC-Cube/YYC3-Club-Ops/actions/workflows/deploy.yml/badge.svg)](https://github.com/YYC-Cube/YYC3-Club-Ops/actions/workflows/deploy.yml)
[![Security](https://img.shields.io/badge/security-policy-success?style=flat-square)](./SECURITY.md)
[![贡献](https://img.shields.io/badge/contributing-welcome-informational?style=flat-square)](./CONTRIBUTING.md)

**关键词**：`多店 SaaS` `KTV` `POS 收银` `包厢运营` `多租户` `门店隔离` `PostgreSQL RLS` `HttpOnly 会话` `CSRF` `登录限流` `Next.js App Router` `React 19` `shadcn/ui` `Radix UI` `Hono` `Vitest` `Playwright`

</div>

---

## 状态说明

本仓库定位为**多店 SaaS**（租户 `tenant` + 门店 `store` 两级模型），当前处于 Phase 2（门店上下文 / 契约 / 真实 API / 数据库安全）：

- ✅ **包厢运营**：加载、详情、开房、结账、清洁、维修/恢复、点单入口
- ✅ **工程基线**：lockfile、类型检查、ESLint、单元测试、E2E、依赖审计、CI 门禁
- ✅ **门店上下文**：会话加载、门店切换、门店级数据隔离与越权校验
- ✅ **真实 API**：登录、HttpOnly Cookie 会话、房间查询/开房/结账/清台、15 分钟进位计费
- ✅ **数据库安全**：PostgreSQL 15 + 业务表/认证表 RLS、SECURITY DEFINER 登录函数
- ✅ **认证安全**：会话绑定 CSRF Token、IP/账号登录限流（429 + `Retry-After`）、会话滑动续期
- ✅ **契约先行**：`contracts/openapi.yaml` + `lib/api/routes.ts` + 服务层
- 🚧 **POS 收银**：仍为占位（Phase 2）
- 🚧 **报表 / 会员 / 库存 / 员工权限 / 系统设置**：仍为占位（Phase 3）
- 🚧 **支付、艺人管理**：尚未接入（Phase 2/3）

> ⚠️ 线上站点显示“开发预览 · 非生产”，**请勿作为生产收银系统使用**。

### 数据库拓扑

| 节点 | 地址 | 角色 |
|---|---|---|
| Mac 主库 | `127.0.0.1:5433` / `192.168.3.22:5433` | 可写（开发） |
| NAS 备库 | `100.65.172.88:5433` | 只读 / 故障切换（streaming） |
| NAS 知识库 | `192.168.3.45:5434` / `yyc3_kb` | 独立实例，不参与 Club Ops |

应用使用专用 `yyc3_club_ops_app`（非 superuser、非 bypassrls），业务表与认证表均启用 RLS；登录限流计数落库。

## 技术栈

| 层级 | 技术 | 版本 | 说明 |
|---|---|---|---|
| 前端 | Next.js | 15.5.28 | App Router + 静态导出（生产迁移中） |
| 前端 | React | 19 | Client Components |
| 语言 | TypeScript | 5 | `strict: true`，构建强制类型检查 |
| 样式 | Tailwind CSS | 4 | `@tailwindcss/postcss` |
| 组件 | shadcn/ui + Radix UI | new-york | 无障碍原语 + 可组合组件 |
| 状态 | Zustand | 5 | 房间 / 订单 / 门店上下文 |
| API | Hono + @hono/node-server | 4.13 | 本地 Node API（3032） |
| 数据库 | PostgreSQL | 15.15 | 事务 + RLS + 物理备库 |
| 测试 | Vitest + Playwright | 5 / 1.64 | 单测 / 集成 / E2E |
| 包管理 | pnpm | 12.14 | workspace + frozen lockfile |

## 快速开始

要求 Node.js ≥ 22.22.2、pnpm ≥ 9。

```bash
pnpm install

# 首次：迁移 + 种子（需要 .env.local 中的 DATABASE_OWNER_URL）
pnpm db:migrate
pnpm db:seed

# 终端 1：Mock 预览（前端）
pnpm dev                     # http://localhost:3030（.env.development 显式 Mock）

# 终端 2：真实 API（PostgreSQL）
pnpm api:dev                 # http://127.0.0.1:3032

# 前端切到真实 API
NEXT_PUBLIC_USE_MOCK=false \
NEXT_PUBLIC_API_BASE_URL=http://localhost:3032/api \
pnpm dev
```

真实模式演示账号：

| 账号 | 密码 | 门店权限 |
|---|---|---|
| `13800138000` | `yyc3-demo-2026` | 云枢旗舰店 + 滨江店 |
| `13900139000` | `yyc3-demo-2026` | 仅云枢旗舰店（验证 403） |

> 演示账号仅用于本地预览，生产必须覆盖 `SESSION_SECRET`、`DEMO_ADMIN_PASSWORD` 并开启 `COOKIE_SECURE=true`。

## 质量命令

```bash
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint .
pnpm test        # Vitest（含服务端/PostgreSQL 集成测试）
pnpm test:coverage
pnpm test:e2e    # Playwright（首次需 pnpm exec playwright install chromium）
pnpm build       # 静态导出到 out/
pnpm api:dev     # 本地真实 API（3032）
pnpm audit --prod --audit-level=high
```

当前实测：**124 单测 / 14 E2E / 14 页构建 / 0 高危漏洞**；覆盖率 Stmts 93.08%、Branch 80.87%、Funcs 95.34%、Lines 94.99%。

## 安全模型

| 能力 | 实现 |
|---|---|
| 密码 | `scrypt` + 随机盐 + `timingSafeEqual`，不存明文 |
| 会话 | HMAC-SHA256 签名 Token + 服务端 `app.session`；登出即撤销 |
| Cookie | `HttpOnly`、`SameSite=Lax`、生产 `Secure` |
| CSRF | 会话绑定同步令牌，写操作必须携带 `X-CSRF-Token`；缺失/伪造返回 403 |
| 会话续期 | `POST /auth/refresh` 滑动续期，受 `SESSION_MAX_LIFETIME_SECONDS` 绝对上限约束 |
| 登录限流 | IP 60/5min、账号 5/15min（落库），超限 429 + `Retry-After` |
| 多店隔离 | `tenant + store` RLS；认证表按租户/本人作用域 |
| 安全审计 | `app.auth_audit` 追加写：登录成功/失败、登出、续期、强制下线 |
| 强制下线 | `POST /admin/users/{userId}/force-logout`（店长及以上 + CSRF） |
| 跨店防御 | 前端服务层 + 服务端门店授权双重校验 |

安全政策与漏洞上报见 [SECURITY.md](./SECURITY.md)。

## 环境变量

| 变量 | 说明 | 默认 |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | 多店 SaaS 网关地址 | 空（未接入） |
| `NEXT_PUBLIC_USE_MOCK` | 是否显式使用 Mock 数据 | 开发 `true` / 生产 `false` |
| `SESSION_SECRET` | 会话 HMAC 密钥（≥16 位） | 开发示例值，生产必须覆盖 |
| `DEMO_ADMIN_PASSWORD` | 本地种子账号密码 | 开发示例值，生产必须覆盖 |
| `DATABASE_URL` | 应用连接（app 角色，非 superuser） | `.env.local`，不提交 |
| `DATABASE_OWNER_URL` | 迁移/种子（owner 角色） | `.env.local`，不提交 |
| `API_PORT` | 本地 API 端口 | `3032` |
| `APP_ORIGIN` | CORS 允许的前端源 | `http://localhost:3030` |
| `COOKIE_SECURE` | Cookie Secure 标记 | 生产 `true` |
| `SESSION_TTL_SECONDS` | 单次会话有效期 | `28800` |
| `SESSION_MAX_LIFETIME_SECONDS` | 会话绝对上限（超过必须重新登录） | `604800` |
| `TRUST_PROXY` | 是否采信 `X-Forwarded-For`（仅受信代理后开启） | `false` |
| `LOGIN_IP_LIMIT` / `LOGIN_IP_WINDOW_SECONDS` / `LOGIN_IP_BLOCK_SECONDS` | 来源 IP 限流 | `60` / `300` / `300` |
| `LOGIN_PHONE_LIMIT` / `LOGIN_PHONE_WINDOW_SECONDS` / `LOGIN_PHONE_BLOCK_SECONDS` | 账号限流 | `5` / `900` / `900` |

完整样例见 [.env.example](./.env.example)；`.env.development` 仅含公开变量。生产禁止开启 Mock，接口失败必须显式报错，不允许静默降级。

## 门店上下文

- 会话由 `GET /auth/session` 返回，包含 `tenant`、`user`、`stores`、`currentStoreId`、`csrfToken`、`expiresAt`。
- 门店切换只允许会话授权列表内的门店；未授权切换直接拒绝，不静默回退。
- 所有门店相关请求使用 `/stores/{storeId}/...`；前端再做一次跨店防御校验。
- 会话在到期前自动滑动续期；绝对上限到达后必须重新登录。

相关代码：`lib/stores/useStoreContextStore.ts`、`lib/services/store-scope.ts`、`lib/services/session.ts`、`lib/api/routes.ts`。

## 项目结构

```text
app/
├── (pos)/                  # 前台收银
│   ├── rooms/              # 包厢管理（已闭环）
│   └── pos/                # POS 收银（Phase 2）
├── (admin)/                # 运维管理
│   ├── dashboard/          # 经营看板
│   ├── reports/            # 报表分析
│   ├── members/            # 会员管理
│   ├── inventory/          # 库存管理
│   ├── staff/              # 员工管理
│   └── settings/           # 系统设置
└── login/                  # 真实 API 登录
lib/
├── money.ts                # 分单位金额工具
├── api/                    # API 客户端 + 路径契约
├── mocks/                  # 显式预览数据（tenant/store/room）
├── services/               # 会话、门店作用域、房间服务
├── stores/                 # Zustand 状态机（含门店上下文）
└── types.ts                # 领域模型（Tenant/Store/Session/Room...）
contracts/
└── openapi.yaml            # 前后端契约（OpenAPI 3.1）
server/
├── app.ts                  # Hono API：会话/门店/房间/CSRF/限流
├── index.ts                # 本地 API 入口（3032）
├── repositories/
│   ├── memory.ts           # 单测内存实现
│   └── postgres.ts         # PostgreSQL + RLS 实现
├── db/
│   ├── migrate.ts          # 迁移脚本
│   ├── seed.ts             # 种子数据
│   └── pool.ts             # 共享连接池
├── rate-limit.ts           # 限流端口 + 内存实现
├── login-throttle.ts       # PostgreSQL 限流实现
├── config.ts / env.ts
├── security.ts             # scrypt / HMAC / CSRF
└── domain.ts
db/migrations/
├── 001_init.sql            # 租户/门店/用户/会话/房间/订单/事件 + RLS
├── 002_auth_rls.sql        # 认证表 RLS + 登录限流
├── 003_session_csrf.sql    # 会话 CSRF Token
├── 004_auth_audit.sql      # 登录/会话审计 + 强制下线函数
└── 005_pos_items.sql       # POS 价目表 + 消费明细 + 结账字段
```

## 部署

push / PR 触发 GitHub Actions：`install → typecheck → lint → test → audit → build → e2e`，`main` 通过后部署 GitHub Pages。

```bash
pnpm build   # 产物在 out/
```

> GitHub Pages 为纯静态托管，无法承载鉴权、事务与支付回调；当前预览构建显式开启 Mock。真实 API 需以 Node 服务 + PostgreSQL 独立部署，生产化仍需 TLS、备份/PITR、监控与 `pg_hba` 收紧。

## 文档

### 开发者文档

| 文档 | 说明 |
|---|---|
| [文档中心](./docs/README.md) | 全量索引 |
| [快速开始](./docs/QUICK_START.md) | 环境、安装、启动 |
| [开发指南](./docs/DEVELOPMENT_GUIDE.md) | 编码规范、目录约定、测试要求 |
| [系统架构](./docs/ARCHITECTURE.md) | 路由、模块、数据流 |
| [API 参考](./docs/API_REFERENCE.md) | 接口、错误码、CSRF/续期 |
| [数据库设计](./docs/DATABASE_DESIGN.md) | 表结构、RLS、限流、会话 |
| [部署指南](./docs/DEPLOYMENT_GUIDE.md) | CI/CD、Pages、生产清单 |
| [FAQ](./docs/FAQ.md) | 常见问题 |
| [品牌徽章规范](./docs/BRAND_BADGES.md) | 徽章矩阵、配色、维护 |
| [可视化交互体系](./docs/VISUALIZATION_INTERACTION.md) | 设计令牌、状态、可视化与动效 |
| [GitHub 元数据](./docs/GITHUB_METADATA.md) | 描述、Topics、关键词、标签 |

### 阶段与安全报告

| 文档 | 说明 |
|---|---|
| [首次审核与整改](./docs/YYC3-Club-Ops-TraeCode-20261031/00-项目现状审核报告.md) | 基线、问题清单、Phase 1 结果 |
| [多店 SaaS 架构决策](./docs/YYC3-Club-Ops-TraeCode-20261031/06-架构决策-多店SaaS.md) | ADR-001：租户/门店隔离 |
| [真实会话与房间 API](./docs/YYC3-Club-Ops-TraeCode-20261031/08-真实会话与房间API.md) | Cookie 会话、房间闭环、计费 |
| [PostgreSQL 适用性](./docs/YYC3-Club-Ops-TraeCode-20261031/10-PostgreSQL适用性分析.md) | RLS、迁移与拓扑 |
| [认证 RLS 与登录限流](./docs/YYC3-Club-Ops-TraeCode-20261031/11-认证RLS与登录限流.md) | 认证安全落地 |
| [CSRF 与会话刷新](./docs/YYC3-Club-Ops-TraeCode-20261031/12-CSRF与会话刷新.md) | 同步令牌、滑动续期、绝对上限 |
| [艺人管理域评估](./docs/YYC3-Club-Ops-TraeCode-20261031/09-艺人管理域对接评估.md) | 28 模块与分期 |
| [测试验证方案](./docs/YYC3-Club-Ops-TraeCode-20261031/04-测试验证方案与执行结果.md) | 用例、门禁与证据 |

## 社区

- [贡献指南](./CONTRIBUTING.md) · [行为准则](./CODE_OF_CONDUCT.md) · [安全政策](./SECURITY.md) · [MIT 许可证](./LICENSE)

## 许可

本项目采用 [MIT License](./LICENSE) 开源许可。

Copyright © 2026 **YanYuCloudCube Team** · [admin@0379.email](mailto:admin@0379.email)

> ***YanYuCloudCube***
> *言启象限 | 语枢未来*
> ***Words Initiate Quadrants, Language Serves as Core for Future***
> *万象归元于云枢 | 深栈智启新纪元*
