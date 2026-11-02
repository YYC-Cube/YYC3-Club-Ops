# YYC3-Club-Ops 会话 Checkpoint

> 覆写规则：每会话结束由 Session Closure 第 3 段覆写 `current_position` / `active_track` /
> `open_questions` 三字段；其余结构保持稳定。
> 最后更新：2026-11-02（msw XHR 专项收口 + Mimosa 核销 + /re-anchor 落地）

## current_position

- **联合验收基线全通（2026-11-02 09:37 留档）**：vitest 165 ✓ / CMS jest 0 失败/652 通过 ✓ /
  **sync:e2e 13/13 ✓**（price.override 投影=1234 正确生效）。会话终点达成。
- **env 裁剪执行完毕**：用户三项输入到位（面板 env + 密钥服务 / Docker Compose / A 类授权
  + 5G 下架 + IoT 按证据），五域整链下架 147 文件 −19.5k 行（tag `pre-env-cut-20261102`），
  validator 同步；凭据字面量清扫零命中；**全量绿保持 0/652**。
- **真实 relay 链路投影 bug 根治**（acceptance 实跑发现的三连修复，`d40f63e`/`14af556`）：
  ① UPDATE 读旧合并保旧（部分载荷 unit NOT NULL 回归）；② toSnapshot 双形态兼容
  （**真实 outbox fields.\* 嵌套一直断链，直投扁平测试掩盖**）；③ name 守卫收敛 CREATE。
- **部署拓扑落地**：deploy/（compose db/api/cms/relay + Dockerfile×2 + pg-init 双库 +
  env.production.example 占位符零字面量 + README）；CMS 仓 deploy/cms.Dockerfile 配套。
- msw XHR 定案、存量红治理、/re-anchor、acceptance.sh、pre-push 四步门禁均在前序回合入档。
- msw XHR 拦截专项定案不变：@happy-dom docblock + vendor 转译；product-dialog 借同链真修，
  实证新环境约束：**Radix 弹层交互后 happy-dom 按钮点击→submit 合成失效**，
  等价动作为 `fireEvent.submit(form)`（校验→onSubmit 链路一致）。
- P2 迁移文件已补提交（6ad3115，product-projection 运行时依赖实证）；
  node-forge 定性=确定性真红非 flaky（3/3 同一断言）。
- Mimosa 两处 medium 已核销（app.ts:491 误报仅记录 / relay-cli 协议守卫）；
  Club-Ops vitest 165 全绿；同步通道基线不变（13 场景全过）。
- /re-anchor skill 已落地，frontmatter 验证通过；注册表发现性待下会话开场实证。

## active_track

App 侧主干兼两仓协同——YYC3-Club-Ops 为权威版，CMS 按 `docs/YYC3-Club-Ops_CMS协同规范`
镜像（`diff -rq` 必须 0 差异；90-session-memory 同规镜像）。会话终点=部署上线。

## open_questions

1. **生产上线最后一步（操作者动作）**：`deploy/.env` 填真实凭据（模板
   env.production.example；凭据走面板/密钥服务不进 git）→ `docker compose up -d --build`
   → 容器内跑一次 `pnpm db:migrate` → 静态站托管选址（nginx/对象存储）。
2. CI 跨仓验收 job：需要 GitHub PAT 决策（凭据事项，未擅动 deploy.yml）。
3. msw-vendor 三链升版联动：msw/@mswjs/interceptors 任一升版必须重跑
   `scripts/msw-vendor.sh` 并复跑 msw-xhr 套件。
4. B 类遗留判定记录：IoT 域若未来引入真实硬件，从 tag `pre-env-cut-20261102` 恢复
   lib/iot+components/iot+app/api/iot 三层即可。
