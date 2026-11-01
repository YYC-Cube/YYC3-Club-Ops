# Handoff Queue

> 规则：每会话结束由 Session Closure 第 2 段把「下一会话首要动作 / 需预先准备的信息 /
> 风险提示」写入本文件；load order 第 3 步读取本文件点名的唯一 stage 文件。
> 最后更新：2026-11-02（XHR 专项收口后刷新）

## next_action

- **动作**：开场先敲 `/re-anchor` 验证 P1 注册表发现性；随后进入 **③类存量红分类治理**——
  把 52 失败套件分为四类（结构性误收 / 生成式模板红 / flaky / 真红），产出分类清单与
  处置方案（testPathIgnorePatterns 收编 / 豁免清单 / 重生成 / 修复），经确认后动手。
- **stage 文件**：`docs/YYC3-Club-Ops_CMS协同规范/05-对账异常与联调验收.md`（门禁双指标基线段）
- **需预先准备**：无外部输入；基线对照法（worktree + 共享 node_modules）已验证可复用。
- **风险提示**：e2e/*.spec.ts 是 playwright 规格、jest 收集属结构性红，勿误判为回归；
  node-forge 为已知 flaky；处置若动 testPathIgnorePatterns 会改变门禁分母口径（05 需同步注记）。

## queue（后续排队，按序）

1. 部署上线准备（会话终点）：env 校验清单固化 + S7 密钥双活核验 + 双库 5433 生产对应关系确认
   + Mimosa 全仓复扫确认两处 medium 核销生效。
2. msw-vendor 三链升版联动：msw/@mswjs/interceptors 任一升版必须重跑 `scripts/msw-vendor.sh`
   并复跑 msw-xhr 套件。
