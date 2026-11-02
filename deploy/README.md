# deploy/ — Docker Compose 单机拓扑（2026-11-02 落地）

## 服务

| 服务 | 镜像源 | 端口 | 职责 |
|---|---|---|---|
| `db` | postgres:16-alpine | 5433 | 双库：yyc3_club_ops（POSTGRES_DB 初始化）+ yyc3_yy（pg-init 创建） |
| `api` | `deploy/api.Dockerfile` | 4000 | Club-Ops Hono API（server/index.ts） |
| `cms` | CMS 仓 `deploy/cms.Dockerfile` | 3030 | CMS standalone（next build 产物 server.js） |
| `relay` | 复用 api 镜像 | — | 60s 轮询 Outbox→CMS 事件投递 |

## 用法

```bash
cd deploy
cp env.production.example .env   # 填值（凭据只进 .env，勿入 git）
docker compose up -d --build
```

## 前提与注记

- Club-Ops 静态站（`pnpm build` 产物 `out/`）由本机 nginx 或对象存储托管，**不进本 compose**
  （B 端 App 静态导出与 api 分离部署）。
- 首启前跑一次迁移：`pnpm db:migrate`（api 容器内或本机，owner 连接串）。
- 拓扑内验收：acceptance.sh 的 env 指向 compose 网络地址后照常可跑。
- 快照回滚：`git tag pre-env-cut-20261102`（CMS 裁剪前全量状态）。
