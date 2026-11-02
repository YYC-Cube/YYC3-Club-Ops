# Handoff Queue

> 规则：每会话结束由 Session Closure 第 2 段把「下一会话首要动作 / 需预先准备的信息 /
> 风险提示」写入本文件；load order 第 3 步读取本文件点名的唯一 stage 文件。
> 最后更新：2026-11-02（XHR 专项收口后刷新）

## next_action

- **动作**：**生产上线操作（你补值 → 起栈）**——`deploy/.env`（37 键全量清单 + 逐项说明，
  已生成、gitignored 不入库）把 `__FILL__` 占位符补成真实凭据 → `cd deploy && docker compose up -d --build`
  → 容器内 `pnpm db:migrate` → 静态站托管（out/，nginx 或对象存储）→ 线上验收。
- **stage 文件**：`deploy/.env`（唯一填充源）+ `deploy/README.md`
- **需预先准备（你）**：仅需补 `deploy/.env` 里的 `__FILL__` 项（7 组强随机密钥 + 2 个真实
  主数据标识 + 若干策略值）；主数据标识可先沿用 `tenant-demo-001` / `store-demo-001`（种子存在）。
- **风险提示**：`docker compose` 首次构建 CMS 镜像约数分钟（next build）；迁移走 compose 网络
  owner 串；HMAC 三件（ACCESS_KEY/SECRET/TENANT）两侧必须同值。

## queue（后续排队，按序）

1. CI 跨仓验收 job（需 GitHub PAT 决策，凭据事项）。
2. msw-vendor 三链升版联动：msw/@mswjs/interceptors 任一升版必跑 `scripts/msw-vendor.sh`。
3. node-forge 口径长期复核：expo 升级移除间接依赖后可恢复「零存在」严格口径。
4. IoT 域恢复预案：未来引入真实硬件时，从 tag `pre-env-cut-20261102` 恢复三层文件。
