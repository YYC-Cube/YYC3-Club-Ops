---
name: re-anchor
description: YYC3 会话开场锚定（Session Protocol load order）。读取 90-session-memory/checkpoint.md 与 handoff-queue.md，一句话复述 current_position 与 next_action，确认用户意图后再深入。用户说 /re-anchor、"开场锚定"、"重新锚定"、会话衔接时使用。
allowed-tools: Read, Bash
argument-hint: "[可选：覆盖 next_action 的新指令]"
---

# /re-anchor — YYC3 会话开场锚定

按 Session Protocol load order 执行（无例外，文件缺失时报告并提议 bootstrap，不静默跳过）：

1. Read `90-session-memory/checkpoint.md` → 提取 `current_position`
2. Read `90-session-memory/handoff-queue.md` → 提取 `next_action` 及其点名的 stage 文件
3. Read stage 文件（仅当 next_action 上下文不足时）
4. Read `90-session-memory/02-PROJECT-CONTEXT.md`（先用 `git log -1 --pretty=%h` 对比快照基准，
   前端契约有变更才全文重读）

## 开场输出格式

- 一句话复述：`current_position` + `next_action`
- 明确询问：按 next_action 继续，还是改锚（用户参数即新锚）？

## 防漂移守则

- 连续两轮无可验证产出 → 主动暂停请求重新锚定
- 每完成一个可验证单元（路由/表/迁移/集成测试通过）即输出 3–5 行微型小结
- 架构决策即时追加 `90-session-memory/decisions.log`
- 会话结束必附 Session Closure 三段（见 `90-session-memory/01-SESSION-PROTOCOL.md`）
