# 贡献指南 · Contributing

> 感谢关注 YYC³ Club Ops。本指南面向所有贡献者，目标是在**30 分钟内**完成一次可合并的高质量提交。

---

## 一、开始之前

1. 阅读 [README](./README.md)、[行为准则](./CODE_OF_CONDUCT.md) 与 [安全政策](./SECURITY.md)。
2. 阅读团队规范 SSOT：[`docs/YYC3-团队通用-标规文档/`](./docs/YYC3-团队通用-标规文档/)。
3. 确认你要改动的范围：
   - 前端：`app/`、`components/`、`lib/`、`styles/`
   - API：`server/`
   - 数据库：`db/migrations/`
   - 契约：`contracts/openapi.yaml`（路径唯一事实源在 `lib/api/routes.ts`）

## 二、开发环境

要求 Node.js ≥ 22.22.2、pnpm ≥ 9。

```bash
pnpm install
cp .env.example .env.local        # 填入数据库连接（勿提交）
pnpm db:migrate && pnpm db:seed   # 首次
pnpm dev                          # 前端 3030（Mock）
pnpm api:dev                      # API 3032（PostgreSQL）
```

> 端口约定：前端 **3030**，API **3032**。不要占用或改写团队端口。

## 三、分支与提交

### 3.1 分支

| 分支 | 用途 |
|---|---|
| `main` | 稳定线，受保护 |
| `feat/<主题>` | 新功能 |
| `fix/<主题>` | 缺陷 |
| `docs/<主题>` | 文档 |
| `chore/<主题>` | 杂务/依赖 |
| `dependabot/*` | 依赖机器人 |

### 3.2 提交信息（Conventional Commits）

```text
feat(rooms): 开房后自动创建进行中订单
fix(auth): 刷新会话时校验绝对有效期
docs(readme): 补充 CSRF 与会话续期说明
test(api): 覆盖缺少 CSRF 头的写操作
```

- 一次提交只做一件事；
- 标题 ≤ 72 字符，正文说明「为什么」与「影响范围」；
- 不提交密钥、`.env.local`、构建产物。

## 四、质量门禁（提交前必须通过）

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e        # 涉及路由/交互时
pnpm build
pnpm audit --prod --audit-level=high
```

| 检查 | 通过标准 |
|---|---|
| 类型 | 0 error |
| Lint | 0 error（warning 不得新增） |
| 单测 | 全绿；新增逻辑需有测试 |
| 覆盖率 | 不低于全局阈值（lines 80 / branches 70） |
| E2E | 核心链路全绿 |
| 构建 | 14 页成功导出 |
| 审计 | 无 high/critical |

## 五、代码约定

### 5.1 通用

- TypeScript `strict`；禁止 `any` 扩散（新增 `any` 需注释理由）。
- 金额统一以「分」为单位，展示时转元；禁止浮点直接结算。
- 时间统一 `Asia/Shanghai`；服务端以 UTC 存储。
- 错误必须有稳定 `code`（如 `forbidden_store`、`csrf_invalid`、`rate_limited`）。

### 5.2 前端

- 门店作用域唯一来源：`Session.currentStoreId`；**不得信任 URL/表单中的 storeId**。
- 每个异步区域实现 loading / empty / error / ready 四态。
- 组件优先复用 `components/ui`（shadcn/ui + Radix），保持无障碍：
  - 可键盘操作、焦点可见、`aria-label`、对话框焦点闭环。
- 状态放 `lib/stores`，服务调用放 `lib/services`，网络细节放 `lib/api`。

### 5.3 服务端

- 所有写操作必须：
  1. 通过 `requireAuth`；
  2. 校验 `X-CSRF-Token`（`POST/PUT/PATCH/DELETE`）；
  3. 校验门店授权（`assertSessionStore`）；
  4. 在事务内设置 `app.tenant_id / app.store_id / app.user_id`。
- 禁止直接使用 superuser 连接；应用角色为 `yyc3_club_ops_app`。
- 新增响应字段需同步 `contracts/openapi.yaml` 与 `lib/api/routes.ts`。

### 5.4 数据库

- 只允许**新增**迁移文件（`NNN_*.sql`），禁止修改已应用的历史迁移。
- 新表必须显式 `GRANT` 给 app 角色；涉及多店数据必须启用 RLS。
- RLS 表优先 `ENABLE + FORCE`；登录前查询使用 `SECURITY DEFINER` 函数并固定 `search_path`。
- 迁移后执行：`pnpm db:migrate && pnpm db:migrate:test`，再跑测试库种子。
- 涉及金额/权限/唯一约束的变更需 2 人评审。

## 六、Pull Request

### 6.1 模板

```markdown
## 变更说明
<!-- 做了什么、为什么 -->

## 关联 Issue
Closes #

## 验证证据
- [ ] pnpm typecheck
- [ ] pnpm lint
- [ ] pnpm test
- [ ] pnpm test:e2e（如涉及交互）
- [ ] pnpm build
- [ ] 截图 / 请求响应 / SQL 证据

## 风险与回滚
<!-- 影响范围、数据/资金风险、回滚方式 -->

## 检查项
- [ ] 未硬编码密钥
- [ ] 金额/权限/幂等/CSRF 已验证（如适用）
- [ ] 文档与契约已同步
```

### 6.2 评审要求

| 变更类型 | 评审人 |
|---|---|
| 普通改动 | ≥ 1 |
| 认证/权限/RLS/金额 | ≥ 2 |
| 数据库迁移 | ≥ 2（含数据负责人） |
| 发布/部署配置 | ≥ 1 + 运维确认 |

### 6.3 合并策略

- 通过 CI 与评审后 squash merge；
- 合并信息使用 Conventional Commits；
- 合并后更新 CHANGELOG/Release（如适用）。

## 七、文档要求

- 行为变更 → 更新 `README` 或 `docs/`；
- 接口变更 → 更新 `contracts/openapi.yaml` + `docs/API_REFERENCE.md`；
- 数据库变更 → 更新 `docs/DATABASE_DESIGN.md`；
- 安全变更 → 更新 `SECURITY.md` 与对应阶段报告；
- 新增页面/组件 → 在 `docs/VISUALIZATION_INTERACTION.md` 的设计映射中登记。

## 八、安全与许可

- 漏洞请勿公开 Issue，按 [SECURITY.md](./SECURITY.md) 上报；
- 贡献即同意以 [MIT License](./LICENSE) 授权；
- 提交前确认无客户数据、真实密钥或生产凭据。

## 九、需要帮助？

- 发起 Discussion 或在 Issue 中标注 `status:needs-review`；
- 新成员可参照 README「快速开始」逐步跑通，再领取 `good first issue`。

---

> ***YanYuCloudCube***
> *言启象限 | 语枢未来*
> *Words Initiate Quadrants, Language Serves as Core for Future*
