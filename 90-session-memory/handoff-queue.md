# Handoff Queue

> 规则：每会话结束由 Session Closure 第 2 段把「下一会话首要动作 / 需预先准备的信息 /
> 风险提示」写入本文件；load order 第 3 步读取本文件点名的唯一 stage 文件。
> 最后更新：2026-11-02（XHR 专项收口后刷新）

## next_action

- **动作**：**部署上线冲刺（会话归档后首个动作）**——用户补三项输入（① env 来源：
  平台面板/密钥服务/CI 注入；② 部署形态：自托管/容器/Serverless；③ CMS ⚠️ 类 env 取舍，
  清单见 `90-session-memory/env-inventory.md` 第四节）→ shell 导出同步七件 env → CMS dev 起 →
  `bash scripts/acceptance.sh` 全绿留档 → 部署上线。输入到位后预计 5 分钟内完成。
- **stage 文件**：`90-session-memory/env-inventory.md` + `docs/YYC3-Club-Ops_CMS协同规范/05`（门禁段）+ 07（就绪门禁）
- **需预先准备（需用户）**：上述三项输入。
- **风险提示**：sync:e2e 会真实写入双库（投影/审计/墓碑联动）——跑前确认目标库为可写的
  联调库而非生产库；DEMO_ADMIN_PASSWORD 生产禁用；⚠️ 类 env 裁剪前先 grep 调用链。

## queue（后续排队，按序）

1. **⚠️ 类 env 裁剪专项**：对 ALIPAY/BLOCKCHAIN/OPENAI/MQTT/TURN 等 16 个疑似生成残留
   引用做调用链 grep，出裁剪清单（降低生产 env 面与攻击面）。
2. **acceptance.sh 进 pre-push**：三件套作为 pre-push 第四钩子或独立 CI job，
   联合验收从手动动作固化为自动门禁。
3. msw-vendor 三链升版联动：msw/@mswjs/interceptors 任一升版必须重跑 `scripts/msw-vendor.sh`
   并复跑 msw-xhr 套件。
4. node-forge 断言口径长期复核点：expo 升级若移除间接依赖，可恢复「零存在」严格口径。
