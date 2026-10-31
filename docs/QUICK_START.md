# 快速开始

## 环境要求

- Node.js ≥ 22.22.2
- pnpm ≥ 9
- PostgreSQL 15（真实 API 模式）

## 安装

```bash
git clone git@github.com:YYC-Cube/YYC3-Club-Ops.git
cd YYC3-Club-Ops
pnpm install

# 环境变量：复制样例并按需填写（.env.local 不提交）
cp .env.example .env.local

# .env.development 已显式开启 Mock；真实联调时改为 false 并配置网关
pnpm dev
```

## 开发

```bash
pnpm dev
# 访问 http://localhost:3030
```

## 真实 API（本地）

```bash
# 首次：迁移 + 种子（.env.local 需 DATABASE_OWNER_URL）
pnpm db:migrate
pnpm db:seed

# 终端 1
pnpm api:dev          # http://127.0.0.1:3032

# 终端 2：前端连接真实 API
NEXT_PUBLIC_USE_MOCK=false \
NEXT_PUBLIC_API_BASE_URL=http://localhost:3032/api \
pnpm dev
```

演示账号：`13800138000 / yyc3-demo-2026`（店长，双门店）；`13900139000 / yyc3-demo-2026`（收银员，仅旗舰店）。

真实模式要点：

- 登录后 Cookie 为 `HttpOnly`，前端不保存 Token；
- 写操作自动携带 `X-CSRF-Token`（缺失返回 403）；
- 会话在到期前自动滑动续期，超过绝对上限需重新登录；
- 连续登录失败会触发 429 与 `Retry-After`。

## 质量检查

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm audit --prod --audit-level=high
```

## 构建

```bash
pnpm build
# 静态导出到 out/ 目录
```

## 项目结构

```
YYC3-Club-Ops/
├── app/
│   ├── (pos)/          # 前台收银模块
│   │   ├── rooms/      # 包厢管理
│   │   └── pos/        # POS 收银
│   ├── (admin)/        # 运维管理模块
│   │   ├── dashboard/  # 经营看板
│   │   ├── reports/    # 报表分析
│   │   ├── members/    # 会员管理
│   │   ├── inventory/  # 库存管理
│   │   ├── staff/      # 员工管理
│   │   └── settings/   # 系统设置
│   ├── layout.tsx      # 根布局
│   └── page.tsx        # 重定向到 /rooms
├── components/         # UI 组件
│   ├── ui/             # shadcn/ui 基础组件
│   ├── layout/         # 布局组件
│   ├── pos/            # POS 组件
│   ├── room/           # 包厢组件
│   ├── reports/        # 报表组件
│   └── ...             # 业务组件
├── lib/                # 工具库
│   ├── api/            # API 客户端 + 路径契约
│   ├── services/       # 会话/门店作用域/房间服务
│   ├── mocks/          # 显式预览数据
│   ├── stores/         # Zustand 状态管理
│   ├── money.ts        # 分单位金额工具
│   ├── types.ts        # 类型定义
│   └── utils.ts        # 工具函数
├── contracts/          # OpenAPI 契约
├── server/             # 真实 API（Hono + PostgreSQL，3032）
├── db/migrations/      # 001 schema / 002 认证 RLS+限流 / 003 会话 CSRF
├── e2e/                # Playwright E2E
├── styles/globals.css  # Tailwind v4 全局样式
└── public/             # 静态资源 + CNAME
```

## 技术栈

| 技术 | 版本 | 说明 |
|---|---|---|
| Next.js | 15.5.28 | App Router + 静态导出 |
| React | 19 | Client Components |
| TypeScript | 5 | 严格模式 |
| Tailwind CSS | 4 | oklch 色彩空间 |
| shadcn/ui | new-york | Radix UI 基础 |
| Zustand | 5 | 状态管理 |
| Hono | 4.13 | 本地真实 API（3032） |
| PostgreSQL | 15.15 | 事务 + RLS + 物理备库 |
| Vitest | 5 | 单元/集成测试 |
| Playwright | 1.64 | E2E 测试 |
