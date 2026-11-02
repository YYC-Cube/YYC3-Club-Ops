# Handoff Queue

> 规则：每会话结束由 Session Closure 第 2 段把「下一会话首要动作 / 需预先准备的信息 /
> 风险提示」写入本文件；load order 第 3 步读取本文件点名的唯一 stage 文件。
> 最后更新：2026-11-02（XHR 专项收口后刷新）

## next_action

- **动作**：**生产上线操作（纯操作者动作，代码侧全绿就绪）**——`deploy/.env` 填真实凭据
  （模板 env.production.example；凭据走面板/密钥服务）→ `docker compose up -d --build`
  → 容器内 `pnpm db:migrate` → 静态站托管选址 → 线上验收。
- **stage 文件**：`deploy/README.md` + `90-session-memory/env-inventory.md` + `deploy/env.production.example`
- **需预先准备（用户）**：生产凭据值（POSTGRES/JWT/ENCRYPTION/SESSION/HMAC 七件）+ 静态站托管选址。
- **风险提示**：`docker compose` 首次构建 CMS 镜像约数分钟（next build）；迁移在容器网络内跑
  （owner 连接串指向 compose db）；sync relay 已含 60s 轮询 sidecar 无需宿主 cron。

## queue（后续排队，按序）

1. CI 跨仓验收 job（需 GitHub PAT 决策，凭据事项）。
2. msw-vendor 三链升版联动：msw/@mswjs/interceptors 任一升版必跑 `scripts/msw-vendor.sh`。
3. node-forge 口径长期复核：expo 升级移除间接依赖后可恢复「零存在」严格口径。
4. IoT 域恢复预案：未来引入真实硬件时，从 tag `pre-env-cut-20261102` 恢复三层文件。
