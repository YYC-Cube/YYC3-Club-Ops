# 部署指南

## 自动部署（GitHub Actions）

项目已配置 CI/CD 自动部署到 GitHub Pages。

### 流程

```
push to main → GitHub Actions → pnpm build → 静态导出 → Deploy to Pages
```

### 工作流文件

`.github/workflows/deploy.yml`

**verify（push / PR 均执行）**
1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm test`
5. `pnpm audit --prod --audit-level=high`
6. `pnpm build`（`output: "export"`）
7. 写入 CNAME 并上传 Pages artifact

**e2e（verify 通过后执行）**
1. 安装 Playwright Chromium
2. `pnpm test:e2e`

**deploy（仅 push main / 手动触发）**
1. 依赖 verify + e2e 通过
2. 部署到 GitHub Pages

> 注意：GitHub Pages 为纯静态托管，不支持鉴权、事务、支付回调等能力。多店 SaaS 生产环境需迁移到支持服务端的运行环境。

### GitHub Pages 配置

仓库 Settings → Pages：
- **Source**: GitHub Actions
- **Custom domain**: `club.yyc3.top`
- **Enforce HTTPS**: ✅

### DNS 配置

在域名管理商添加 CNAME 记录：

```
CNAME  club  →  yyc-cube.github.io
```

## 手动部署

```bash
pnpm build
# out/ 目录包含所有静态文件
# 上传 out/ 内容到任意静态托管即可
```

## 构建配置

`next.config.mjs`:
```javascript
const nextConfig = {
  output: "export",  // 静态导出
  images: {
    unoptimized: true,  // 静态部署不支持图片优化
  },
}
```

## 本地真实 API + PostgreSQL

```bash
# 首次：迁移 + 种子（.env.local 需 DATABASE_OWNER_URL）
pnpm db:migrate
pnpm db:seed

# 终端 1：真实 API（3032）
pnpm api:dev

# 终端 2：前端连接真实 API
NEXT_PUBLIC_USE_MOCK=false \
NEXT_PUBLIC_API_BASE_URL=http://localhost:3032/api \
pnpm dev
```

- 应用连接使用 `DATABASE_URL`（`yyc3_club_ops_app`，非 superuser）
- 迁移/种子使用 `DATABASE_OWNER_URL`（仅本地，不提交）
- 测试库使用 `TEST_DATABASE_OWNER_URL` / `TEST_DATABASE_URL`
- 数据库：Mac 主库 `192.168.3.22:5433`；NAS 备库只读；KB `192.168.3.45:5434` 独立
- GitHub Pages 仅承载静态 Mock 预览，不部署 API

## 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | 多店 SaaS 网关地址 | 空（未接入） |
| `NEXT_PUBLIC_USE_MOCK` | 是否显式使用 Mock 数据 | 开发 `true`（`.env.development`）/ 生产 `false` |
| `DATABASE_URL` | 应用连接（app 角色） | `.env.local`，不提交 |
| `DATABASE_OWNER_URL` | 迁移/种子（owner 角色） | `.env.local`，不提交 |
| `TEST_DATABASE_URL` / `TEST_DATABASE_OWNER_URL` | 测试库连接 | `.env.local`，不提交 |
| `SESSION_SECRET` | 会话 HMAC 密钥（≥16 位，生产建议 ≥32 字节） | 开发示例值 |
| `DEMO_ADMIN_PASSWORD` | 演示账号密码 | 开发示例值 |
| `COOKIE_SECURE` | Cookie Secure 标记 | 生产必须 `true` |
| `SESSION_TTL_SECONDS` | 单次会话有效期 | `28800` |
| `SESSION_MAX_LIFETIME_SECONDS` | 会话绝对上限 | `604800` |
| `TRUST_PROXY` | 是否采信 `X-Forwarded-For` | `false` |
| `LOGIN_IP_LIMIT` / `LOGIN_IP_WINDOW_SECONDS` / `LOGIN_IP_BLOCK_SECONDS` | IP 限流 | `60` / `300` / `300` |
| `LOGIN_PHONE_LIMIT` / `LOGIN_PHONE_WINDOW_SECONDS` / `LOGIN_PHONE_BLOCK_SECONDS` | 账号限流 | `5` / `900` / `900` |

静态导出不支持服务端环境变量，所有配置通过 `NEXT_PUBLIC_` 前缀在构建时注入。GitHub Pages 预览构建显式设为 `true`；生产禁止开启 Mock。

## 生产上线检查清单

- [ ] Node API 与 PostgreSQL 均启用 TLS
- [ ] `SESSION_SECRET` / `DEMO_ADMIN_PASSWORD` 已替换，演示账号移除
- [ ] `COOKIE_SECURE=true`，`TRUST_PROXY` 仅在受信代理后开启
- [ ] 应用使用最小权限角色，`pg_hba` 收紧为 `scram-sha-256`
- [ ] 备份/PITR 演练通过，监控与告警接入
- [ ] 登录审计、会话强制下线、异常告警就绪
- [ ] `pnpm audit` 0 high/critical
- [ ] 健康检查与回滚流程演练
