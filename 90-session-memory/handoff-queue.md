# Handoff Queue

> 规则：每会话结束由 Session Closure 第 2 段把「下一会话首要动作 / 需预先准备的信息 /
> 风险提示」写入本文件；load order 第 3 步读取本文件点名的唯一 stage 文件。
> 最后更新：2026-11-02（XHR 专项收口后刷新）

## next_action

- **动作**：**部署上线冲刺**——用户补三项输入（env 来源 / 部署形态 / 疑似残留 env 取舍，
  清单见 `90-session-memory/env-inventory.md` 第四节）→ 导出同步七件 env → CMS dev 起 →
  `bash scripts/acceptance.sh` 全绿留档 → 部署上线。
- **stage 文件**：`90-session-memory/env-inventory.md` + `docs/YYC3-Club-Ops_CMS协同规范/05`（门禁段）+ 07（就绪门禁）
- **需预先准备（需用户）**：① env 七件+基础项来源；② 部署形态三选一；③ CMS ⚠️ 类 env 取舍。
- **风险提示**：sync:e2e 会真实写入双库（投影/审计/墓碑联动）——跑前确认目标库为可写的
  联调库而非生产库；DEMO_ADMIN_PASSWORD 生产禁用；疑似残留 env 引用裁剪前先 grep 调用链。

## queue（后续排队，按序）

1. （已清空）物理归档、存量红治理、XHR 专项均已完成入档。
2. msw-vendor 三链升版联动：msw/@mswjs/interceptors 任一升版必须重跑 `scripts/msw-vendor.sh`
   并复跑 msw-xhr 套件。
3. node-forge 断言口径的长期复核点：expo 升级若移除间接依赖，可恢复「零存在」严格口径。
