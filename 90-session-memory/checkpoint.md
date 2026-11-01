# YYC3-Club-Ops 会话 Checkpoint

> 覆写规则：每会话结束由 Session Closure 第 3 段覆写 `current_position` / `active_track` /
> `open_questions` 三字段；其余结构保持稳定。
> 最后更新：2026-11-02（msw XHR 专项收口 + Mimosa 核销 + /re-anchor 落地）

## current_position

- **msw XHR 拦截专项已收口定案**：@happy-dom/jest-environment（docblock 每文件环境）+
  rettime/until-async/deferred-promise **esbuild 真实转译 vendor**（再生脚本
  `scripts/msw-vendor.sh`）；msw-xhr 套件 2/2 转正全绿（0.6s）。
  真实根因链：CJS stub 缺 `emitAsPromise`（rettime）→ 500 错误注入；MockResponse 缺
  `arrayBuffer`/`body` 流（respondWith 响应交付硬依赖）——两层均已修复。
- **门禁基线更新**：52 失败套件 / 805 通过（worktree 基线对照实证：专项前同日 53/804，
  净减 1=msw-xhr 转绿；其余失败集逐一相同；node-forge 双侧皆红=已知 flaky）。
  05 文档已更新并双仓镜像。
- **Mimosa 两处 medium 已核销**：app.ts:491 确认误报（limit 校验 + $1/$2 参数化双断链）；
  relay-cli.ts:22 补 http/https 协议守卫（Club-Ops vitest 165 全绿实证）。
- **/re-anchor skill 已落地**（.zcode/skills/re-anchor，frontmatter 验证通过）；
  本会话手工实跑过 load order 全流程。注册表发现性留待下会话开场实证。
- 同步通道基线不变：事件/命令双向全通，sync:e2e 13 场景全过。

## active_track

App 侧主干兼两仓协同——YYC3-Club-Ops 为权威版，CMS 按 `docs/YYC3-Club-Ops_CMS协同规范`
镜像（`diff -rq` 必须 0 差异；90-session-memory 同规镜像）。会话终点=部署上线。

## open_questions

1. CMS 门禁 52 失败套件的分类治理：结构性红（e2e/*.spec.ts 被 jest 误收的 playwright
   规格、quick//improved/ 生成式模板）vs 真红——需先出分类清单再定处置方案
   （收编 ignore / 豁免清单 / 重生成 / 修复）。
2. node-forge 套件 flaky（两侧皆红、时长漂移）——纳入③类治理一并定性。
3. 部署上线前置项未盘点：env 校验清单、S7 密钥双活核验步骤待固化。
