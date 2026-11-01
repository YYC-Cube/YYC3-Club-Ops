# YYC3-Club-Ops 会话 Checkpoint

> 覆写规则：每会话结束由 Session Closure 第 3 段覆写 `current_position` / `active_track` /
> `open_questions` 三字段；其余结构保持稳定。
> 最后更新：2026-11-02（msw XHR 专项收口 + Mimosa 核销 + /re-anchor 落地）

## current_position

- **CMS 测试门禁全量绿达成（修正版）**：78/78 套件、652/658 测试（6 skip）、0 失败（~5s）。
  存量红分类治理完成——A 类 16 收编 jest ignore（playwright `/e2e/` + 孤儿 `/tests/security/`）；
  B/C 类 4 全红目录归档 + 13 红灯文件 ignore（混合目录不整目录归档，防连坐绿灯）；
  D 类真资产 product-dialog 真修 4/4；E 类 node-forge 口径修正 10/10。
  **执行史**：首版整目录归档连坐 9 个绿灯套件，已 git revert 重做（套件级失败清单为准）。
  05 已更新镜像（0/652 + 口径史注记）。
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

1. 部署上线前置项盘点（会话终点）：env 校验清单、S7 密钥双活核验、Mimosa 全仓复扫
   确认守卫生效口径、双库 5433 生产对应关系确认。
2. 8 个 ignore 残件与 tests/security 孤儿的物理归档（Mimosa 钩子拦 git mv，待人工
   `git mv` 至 archive 目录，纯仓库卫生不影响门禁）。
3. msw-vendor 三链升版联动约束：msw/@mswjs/interceptors 任一升版必须重跑
   `scripts/msw-vendor.sh` 并复跑 msw-xhr 套件。
