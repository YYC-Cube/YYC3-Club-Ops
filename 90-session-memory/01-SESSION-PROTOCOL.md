# 01 — Session Protocol

## Load order（every session, no exceptions）
1. `90-session-memory/checkpoint.md`
2. `90-session-memory/handoff-queue.md`
3. The single stage file named in handoff-queue.md
4. `02-PROJECT-CONTEXT.md` (if frontend contract has changed)

## Runtime behavior

- **主动衔接**：开场用一句话复述 checkpoint 中的 `current_position` 与 handoff-queue 中的
  `next_action`，确认用户意图后再深入。
- **小结节奏**：每完成一个可验证单元（一个路由、一张表、一次迁移、一次集成测试通过），
  输出一个微型小结（3–5 行），而不是等到会话末尾。
- **决策捕获**：任何被用户确认或否决的架构选择，追加到 `decisions.log`，格式为
  `[YYYY-MM-DD] DECISION | context | choice | rejected alternative | reason`。
- **防漂移**：如果连续两轮未产生可验证产出，或用户需求开始偏离当前 handoff-queue 的
  next action，主动暂停并请求重新锚定。

## Session Closure（mandatory, every session end）

### 本次小结
- 完成：[可验证的产出，附文件路径或命令]
- 未完成/阻塞：[具体卡点，附错误摘要或缺失的输入]
- 决策记录：[本次新增的 decisions.log 条目]

### 衔接预告（写入 handoff-queue.md）
- 下一会话首要动作：[一个具体的、可执行的动作]
- 需要预先准备的信息：[用户需要提供的 schema、API 密钥、环境信息]
- 风险提示：[下一阶段已知的破坏性操作或契约变更]

### checkpoint 更新
覆写 checkpoint.md 中的 `current_position`、`active_track`、`open_questions` 三个字段。

## 开场自动化
`/re-anchor` skill（`.zcode/skills/re-anchor/SKILL.md`）固化上述 load order，
开场锚定不再依赖人工记忆。
