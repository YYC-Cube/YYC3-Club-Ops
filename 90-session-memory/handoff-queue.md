# Handoff Queue

> 规则：每会话结束由 Session Closure 第 2 段把「下一会话首要动作 / 需预先准备的信息 /
> 风险提示」写入本文件；load order 第 3 步读取本文件点名的唯一 stage 文件。
> 最后更新：2026-11-02（XHR 专项收口后刷新）

## next_action

- **动作**：**部署上线准备**（会话终点冲刺）：env 校验清单固化（双库 5433、S7 密钥双活、
  SYNC_HMAC 三件）→ Mimosa 全仓复扫确认守卫口径 → 双库生产对应关系确认 →
  联合验收基线（CMS jest 0/555 + Club-Ops vitest 165 + sync:e2e 13 场景）一次跑通留档。
- **stage 文件**：`docs/YYC3-Club-Ops_CMS协同规范/05-对账异常与联调验收.md`（门禁基线段）+ 07 实施排期与就绪门禁
- **需预先准备**：生产环境变量清单（哪些 env 必填、值从何而来）；目标部署形态
  （自托管/容器/Serverless）——这两项需要用户输入。
- **风险提示**：分母口径已变更（0/555 vs 旧 0/805 口径不可直接对比，05 有注记）；
  msw-vendor 三链升版联动（升版必跑再生脚本）；8 残件物理归档待人工 git mv。

## queue（后续排队，按序）

1. 13 个 ignore 残件 + tests/security 孤儿的人工物理归档（Mimosa 钩子拦 Bash 级文件移动；
   纯仓库卫生，不影响门禁；清单见 jest.config testPathIgnorePatterns 注释）。
2. msw-vendor 三链升版联动：msw/@mswjs/interceptors 任一升版必须重跑 `scripts/msw-vendor.sh`
   并复跑 msw-xhr 套件。
3. node-forge 断言口径的长期复核点：expo 升级若移除间接依赖，可恢复「零存在」严格口径。
