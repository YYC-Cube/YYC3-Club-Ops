# FAQ

## 开发环境

### Q: 启动报错 `Cannot find module '@radix-ui/xxx'`

```bash
pnpm install
```

### Q: 样式不生效

确保 `styles/globals.css` 存在且 `app/layout.tsx` 中正确导入：
```typescript
import "../styles/globals.css"
```

### Q: 如何切换 Mock/真实 API

通过环境变量显式控制（`.env.development` 默认开启，生产必须关闭）：

```bash
# 本地无后端演示
NEXT_PUBLIC_USE_MOCK=true pnpm dev

# 接入真实网关
NEXT_PUBLIC_USE_MOCK=false \
NEXT_PUBLIC_API_BASE_URL=http://your-api-server/api pnpm dev
```

接口失败会抛出 `ApiError` 并由页面提示，不会自动回退到 Mock。

### Q: 写操作返回 403 `csrf_invalid`

说明请求未携带或携带了错误的 `X-CSRF-Token`。

1. 确认已通过 `/auth/session` 或登录获取会话；
2. 前端应使用 `apiClient`（会自动注入）；
3. 服务端自定义调用时需带 `X-CSRF-Token` 头；
4. 令牌只存内存，不要写入 localStorage。

### Q: 登录返回 429 `rate_limited`

触发了 IP 或账号维度限流。响应头 `Retry-After` 为建议等待秒数。

- 账号：默认 5 次失败 / 15 分钟，封禁 15 分钟；
- IP：默认 60 次 / 5 分钟；
- 可通过 `LOGIN_*` 环境变量调整；
- 测试环境可清理 `app.login_throttle` 对应记录。

### Q: 会话突然失效（401 `session_expired`）

- 单次有效期（`SESSION_TTL_SECONDS`，默认 8 小时）已过；
- 或达到绝对上限（`SESSION_MAX_LIFETIME_SECONDS`，默认 7 天）；
- 前端会在到期前自动续期；若续期失败请重新登录。

### Q: 为什么登录前不能直接查 `app.app_user`

认证表启用 RLS，且登录前没有租户上下文；服务端通过 `app.auth_lookup(phone)`（SECURITY DEFINER）精确读取 1 行。直接查询返回 0 行是预期行为。

## 构建

### Q: 静态导出报错 `Error: Dynamic server usage`

静态导出不支持 `redirect()`、`cookies()`、`headers()` 等动态 API。页面中使用客户端路由替代：
```tsx
"use client"
import { useRouter } from "next/navigation"
```

### Q: GitHub Pages 部署后 404

检查：
1. 仓库 Settings → Pages → Source 是否选择了 **GitHub Actions**
2. `public/CNAME` 文件是否包含 `club.yyc3.top`
3. DNS CNAME 是否指向 `yyc-cube.github.io`

### Q: GitHub Actions 构建失败

常见原因：
- `pnpm-lock.yaml` 未提交或与 `package.json` 不同步 → 运行 `pnpm install` 后重新提交
- TypeScript 类型错误 → 本地先 `pnpm build` 验证

## 路由

### Q: Route Group `(pos)` / `(admin)` 会出现在 URL 中吗？

不会。Next.js Route Group `(xxx)` 仅做代码组织，不影响 URL 路径。

### Q: 如何添加新路由页面

见 [开发指南](./DEVELOPMENT_GUIDE.md#添加新页面)
