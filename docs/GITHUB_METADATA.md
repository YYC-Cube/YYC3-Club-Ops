# GitHub 元数据规范 · Repository Metadata

> 用一份可执行清单管理仓库**描述、Topics、关键词、标签、发布与社交预览**，避免“文档写一套、仓库设一套”。

---

## 一、仓库描述

### 1.1 短描述（About，≤ 350 字符）

```
多店 KTV 运营 SaaS（Next.js 15 + React 19 + PostgreSQL 15）：包厢运营、POS 收银、门店隔离与 RLS 安全基线。当前为开发预览版，非生产收银系统。
```

### 1.2 英文短描述

```
Multi-store KTV operations SaaS built with Next.js 15, React 19 and PostgreSQL 15 — room lifecycle, POS, tenant/store isolation and RLS security. Preview only, not production.
```

### 1.3 一句话定位

> 一套平台服务多个商户/门店：**门店上下文唯一来源、数据隔离下沉数据库、关键操作可验证**。

## 二、Topics（最多 20 个）

按「产品 → 架构 → 技术 → 质量 → 安全」排序：

| # | Topic | 说明 |
|---|---|---|
| 1 | `ktv` | 行业场景 |
| 2 | `pos` | 前台收银 |
| 3 | `saas` | 平台化交付 |
| 4 | `multi-tenant` | 多租户 |
| 5 | `multi-store` | 多门店 |
| 6 | `nextjs` | 前端框架 |
| 7 | `react` | UI 运行时 |
| 8 | `typescript` | 类型安全 |
| 9 | `postgresql` | 主数据库 |
| 10 | `row-level-security` | 数据库隔离 |
| 11 | `shadcn-ui` | 组件体系 |
| 12 | `radix-ui` | 无障碍原语 |
| 13 | `tailwindcss` | 样式方案 |
| 14 | `zustand` | 状态管理 |
| 15 | `hono` | 本地 API |
| 16 | `vitest` | 单元/集成测试 |
| 17 | `playwright` | E2E |
| 18 | `rbac` | 权限模型（规划中） |
| 19 | `club-management` | 运营管理 |
| 20 | `yyc3` | 组织标识 |

> Topics 全部小写、以 `-` 连接；不使用空格、中文或营销词（如 `best`、`production-ready`）。

### 2.1 通过 `gh` 设置

```bash
gh repo edit YYC-Cube/YYC3-Club-Ops \
  --description "多店 KTV 运营 SaaS（Next.js 15 + React 19 + PostgreSQL 15）｜开发预览版" \
  --add-topic ktv,pos,saas,multi-tenant,multi-store,nextjs,react,typescript,postgresql,row-level-security,shadcn-ui,radix-ui,tailwindcss,zustand,hono,vitest,playwright,rbac,club-management,yyc3
```

> 若仓库为私有，Topics 仅对协作者可见；公开前需再次核对描述中“非生产”声明。

## 三、关键词

### 3.1 `package.json`

```json
{
  "keywords": [
    "ktv", "pos", "saas", "multi-tenant", "multi-store", "nextjs", "react",
    "typescript", "postgresql", "row-level-security", "shadcn-ui", "radix-ui",
    "tailwindcss", "zustand", "hono", "vitest", "playwright", "rbac", "yyc3"
  ]
}
```

### 3.2 README 关键词

```text
多店 SaaS · KTV · POS 收银 · 包厢运营 · 多租户 · 门店隔离 · PostgreSQL RLS ·
HttpOnly 会话 · CSRF · 登录限流 · Next.js App Router · React 19 · shadcn/ui ·
Radix UI · Hono · Vitest · Playwright
```

### 3.3 搜索意图覆盖

| 用户搜索 | 应命中的内容 |
|---|---|
| KTV 收银系统 | 产品定位、POS 占位说明 |
| 多门店 SaaS 架构 | ADR-001、门店上下文 |
| PostgreSQL RLS 多租户 | 001/002 迁移、验证证据 |
| Next.js 15 后台 | 技术栈、构建结果 |
| CSRF HttpOnly 会话 | SECURITY、12 号文档 |
| 登录限流 | `server/rate-limit.ts`、11 号文档 |

## 四、Issue / PR 标签

### 4.1 类型

| 标签 | 颜色 | 说明 |
|---|---|---|
| `type:feature` | `#1D76DB` | 新功能 |
| `type:bug` | `#D73A4A` | 缺陷 |
| `type:docs` | `#0075CA` | 文档 |
| `type:security` | `#B60205` | 安全 |
| `type:test` | `#0E8A16` | 测试 |
| `type:chore` | `#C5DEF5` | 杂务 |

### 4.2 优先级

| 标签 | 颜色 | 响应 |
|---|---|---|
| `P0` | `#B60205` | 2 小时内缓解 |
| `P1` | `#D93F0B` | 当日 |
| `P2` | `#FBCA04` | 本周 |
| `P3` | `#0E8A16` | 排期 |

### 4.3 领域

`area:auth`、`area:rooms`、`area:pos`、`area:db`、`area:ui`、`area:docs`、`area:ci`。

### 4.4 状态

`status:blocked`、`status:needs-review`、`status:ready`、`status:wip`。

## 五、社交预览

| 项 | 规格 |
|---|---|
| 推荐尺寸 | 1280 × 640（2:1） |
| 素材 | 由 `public/yyc3-family.png` 裁切/延展 |
| 文案 | 项目名 + “多店 KTV 运营 SaaS” + “开发预览版” |
| 禁忌 | 不使用“生产可用”“已上线”等表述 |
| 设置位置 | Settings → General → Social preview |

## 六、发布与版本

| 项 | 约定 |
|---|---|
| 默认分支 | `main`（受保护） |
| 版本 | 语义化版本；首个生产版本 `v1.0.0` |
| Release Notes | 变更 + 验证证据 + 已知边界 |
| 预览部署 | GitHub Pages（`club.yyc3.top`） |
| 生产部署 | Node API + PostgreSQL（Phase 4） |

## 七、维护节奏

| 频率 | 动作 |
|---|---|
| 每次发布 | 更新描述、测试徽章数字、Release Notes |
| 每月 | 复核 Topics 与关键词搜索命中 |
| 每季度 | 复核社交预览图与“非生产”声明 |
| 安全事件后 | 更新 SECURITY 与 Release 说明 |

## 八、检查清单

- [ ] About 描述包含“开发预览 / 非生产”
- [ ] Topics ≤ 20 且全小写
- [ ] `package.json` keywords 与 Topics 一致
- [ ] README 关键词与 Topics 不冲突
- [ ] Issue 标签六类齐全
- [ ] 社交预览图包含项目名
- [ ] 许可证与仓库设置一致（MIT）

---

> ***YanYuCloudCube*** · *言启象限 | 语枢未来*
