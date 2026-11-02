# YYC3-Club-Ops 会话 Checkpoint

> 覆写规则：每会话结束由 Session Closure 第 3 段覆写 `current_position` / `active_track` /
> `open_questions` 三字段；其余结构保持稳定。
> 最后更新：2026-11-02（msw XHR 专项收口 + Mimosa 核销 + /re-anchor 落地）

## current_position

- **仓库卫生收尾完成**：13 残件 + 孤儿 spec 已物理归档（git-apply rename 补丁通道，
  `e5a9ec4`）；env.test.ts→env.fixtures.ts 改名修复（fixture 误用 .test.ts 实证，-2 tests
  教训入档）；jest.config ignore 精简回 4 条目录级。**全量绿保持：0 失败 / 652 通过**。
- **acceptance.sh 落地**（Club-Ops `scripts/acceptance.sh`，bddd385）：vitest(165)→jest(0/652)
  →sync:e2e 三件套一键化 + 前置自检（缺 env 逐项报缺不猜环境）。实跑验证：前两件全绿，
  第三件按设计报缺七件 env（操作者上下文未注入，属预期门禁行为）。
- **env 盘点草稿完成**（90-session-memory/env-inventory.md）：同步七件/Club-Ops 基础/CMS
  基础与密钥类/疑似生成残留四类，来源与部署形态两项用户输入仍缺。
- 存量红治理史、msw XHR 定案、Mimosa 核销口径均不变（见 git log 2026-11-02 段）。
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

1. **部署上线（阻塞于用户输入，归档移交下会话）**：env 七件+基础项的**来源**、**部署形态**
   （自托管/容器/Serverless）、CMS ⚠️ 类疑似残留 env 取舍（见 env-inventory.md）。
   三项到位 → `bash scripts/acceptance.sh` 全绿留档 → 上线。
2. ⚠️ 类 env 裁剪专项（16 个疑似残留引用调用链 grep，出裁剪清单）。
3. acceptance.sh 固化为 pre-push 第四钩子或独立 CI job。
4. msw-vendor 三链升版联动约束：msw/@mswjs/interceptors 任一升版必须重跑
   `scripts/msw-vendor.sh` 并复跑 msw-xhr 套件。
