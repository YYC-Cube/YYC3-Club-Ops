# 开发指南

> 团队规范 SSOT：[`YYC3-团队通用-标规文档/`](./YYC3-团队通用-标规文档/)；设计规范：[`VISUALIZATION_INTERACTION.md`](./VISUALIZATION_INTERACTION.md)。
>
> 核心约定：**门店作用域唯一来源、写操作必带 CSRF、金额只用分、失败不静默降级。**

## 编码规范

### 文件命名

- 页面：`app/(group)/feature/page.tsx`
- 组件：`components/category/component-name.tsx`（kebab-case）
- Store：`lib/stores/useFeatureStore.ts`（PascalCase + use 前缀）
- 工具：`lib/utils.ts` / `lib/hooks/use-feature.ts`

### 组件规范

```tsx
"use client"  // 客户端组件必须标注

import { useState } from "react"
import { Button } from "@/components/ui/button"
import type { Room } from "@/lib/types"

interface RoomCardProps {
  room: Room
  onClick: (room: Room) => void
}

export default function RoomCard({ room, onClick }: RoomCardProps) {
  return <Button onClick={() => onClick(room)}>{room.name}</Button>
}
```

### 导入路径

使用 `@/` 别名（映射到项目根目录）：

```typescript
import { Button } from "@/components/ui/button"    // UI 组件
import { useRoomStore } from "@/lib/stores/useRoomStore"  // Store
import type { Room } from "@/lib/types"              // 类型
import { cn } from "@/lib/utils"                     // 工具函数
```

## 添加新页面

1. 在 `app/(pos)/` 或 `app/(admin)/` 下创建目录和 `page.tsx`
2. 在 `components/layout/app-layout.tsx` 的 `navItems` 数组中添加导航项
3. 如果需要状态管理，在 `lib/stores/` 创建 Zustand Store

### 示例：添加"促销管理"页面

```bash
# 1. 创建路由
mkdir -p app/(admin)/promotions
# 2. 创建页面
```

```tsx
// app/(admin)/promotions/page.tsx
"use client"
import PromotionManagement from "@/components/promotion/promotion-management"
export default function PromotionsPage() {
  return <PromotionManagement />
}
```

```tsx
// 在 app-layout.tsx 的 navItems 中添加:
{ id: "promotions", label: "促销管理", icon: Tags, href: "/promotions", group: "admin" }
```

## 添加新组件

1. UI 基础组件：`npx shadcn@latest add [component]`（new-york style）
2. 业务组件：在 `components/` 对应分类目录下创建

## 状态管理（Zustand）

当前约定：

- 不使用 `persist` 持久化业务数据；服务端为唯一事实源（多店 SaaS）。
- Store 只保存 UI 状态与短期缓存；写入失败必须回滚并向上抛出错误。
- 所有请求必须携带会话中的门店上下文，禁止从 URL/表单直接信任 `storeId`。

```typescript
import { create } from "zustand"

interface FeatureState {
  items: Item[]
  loading: boolean
  error: string | null
  fetchItems: () => Promise<void>
}

export const useFeatureStore = create<FeatureState>((set) => ({
  items: [],
  loading: false,
  error: null,
  fetchItems: async () => {
    set({ loading: true, error: null })
    try {
      const response = await apiClient.getItems()
      set({ items: response.data ?? [], loading: false })
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : "加载失败" })
      throw error
    }
  },
}))
```

> 真实 API 已接入；鉴权、CSRF、门店作用域、错误码与续期由服务层统一处理。

## 认证与写操作约定

### 会话

- `Session` 是门店上下文的唯一来源；禁止从 URL/表单直接信任 `storeId`。
- 会话由 HttpOnly Cookie 管理，前端不保存 Token；CSRF 令牌只存内存。
- 会话自动续期由 `AppLayout` 调度；续期失败进入 error 态，引导重新登录。

### CSRF

所有 `POST/PUT/PATCH/DELETE` 必须携带 `X-CSRF-Token`：

```ts
// 已由 apiClient 自动注入，业务代码无需手动设置
fetch(url, { method: "POST", credentials: "include", headers: { "X-CSRF-Token": token } })
```

- 令牌来自登录/会话/续期响应；
- 缺失或伪造返回 `403 csrf_invalid`；
- 不要在 URL、日志或 localStorage 中出现令牌。

### 服务端写操作顺序

```text
requireAuth → CSRF → 门店授权 → 参数校验 → 事务（set_config）→ RLS
```

新增写接口必须复用上述顺序，并提供幂等键（如结账）。

### 错误码

前端按 `code` 分支处理：`forbidden_store`、`csrf_invalid`、`rate_limited`、`room_state_conflict`、`session_expired`。禁止仅依赖 HTTP 状态码文案。

## 测试要求

| 变更 | 必须补的测试 |
|---|---|
| 业务逻辑/金额 | Vitest 单测 |
| API/仓储 | 服务端集成（含 PostgreSQL，未配置时自动跳过） |
| 门店/权限 | 跨店/越权用例 |
| 路由/交互 | Playwright E2E |
| 安全（CSRF/限流/会话） | 正反用例（缺失、伪造、超限、到期） |

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm test:e2e
```

## 文档要求

- API 变更 → `contracts/openapi.yaml` + `docs/API_REFERENCE.md`
- 数据库变更 → `db/migrations/NNN_*.sql` + `docs/DATABASE_DESIGN.md`
- 安全变更 → `SECURITY.md` + 阶段报告
- UI/交互变更 → `docs/VISUALIZATION_INTERACTION.md` 的设计映射

## 样式

### Tailwind v4

全局样式在 `styles/globals.css`：
```css
@import 'tailwindcss';
@import 'tw-animate-css';
@custom-variant dark (&:is(.dark *));
@theme inline { ... }
```

### 暗色主题

项目默认使用深色背景（`bg-slate-950`），通过 Tailwind 类直接控制，无需主题切换。

## 构建验证

```bash
pnpm build    # 构建并静态导出
```

构建成功后 `out/` 目录可直接部署。
