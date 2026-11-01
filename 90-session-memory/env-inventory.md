# env 盘点（部署上线准备草稿）

> 生成方式：双仓代码 `process.env.*` 静态扫描（2026-11-02）；**只列键名与用途，值一律走环境变量/密钥服务**。
> 状态标记：✅=部署必需（同步链路实证） / ⚠️=待定（需用户确认是否部署必需） / 📦=本地开发用（不进生产）。
> **待用户输入**：每项的「来源」（部署平台 env 配置 / 密钥服务 / .env 注入）+ 目标部署形态。

## 一、同步链路七件（sync:e2e 必需，✅）

| 键 | 用途 | 双仓 |
|---|---|---|
| `APP_DATABASE_URL` | App 库连接（pg 5433） | Club-Ops |
| `CMS_DATABASE_URL` | CMS 库连接（pg 5433） | CMS |
| `SYNC_CMS_EVENTS_URL` | CMS 事件接收端点 | 双侧 |
| `SYNC_CMS_COMMANDS_URL` | CMS 命令拉取端点 | Club-Ops |
| `SYNC_HMAC_ACCESS_KEY` | 服务间 access key | 双侧 |
| `SYNC_HMAC_SECRET` | 服务间共享密钥（S7 双活） | 双侧 |
| `SYNC_TENANT_ID` / `SYNC_STORE_ID` | 租户/门店标识 | 双侧 |

## 二、Club-Ops 基础（代码实证）

- ✅ `DATABASE_URL` / `DATABASE_OWNER_URL`（resolveDatabaseUrl 双权分离）
- ✅ `APP_ENV` / `NODE_ENV`、`DATABASE_SSL`
- ⚠️ `DEMO_ADMIN_PASSWORD`（演示账号——生产应禁用或换正式引导流程）
- ⚠️ `NEXT_PUBLIC_API_BASE_URL` / `NEXT_PUBLIC_USE_MOCK`（生产必须 USE_MOCK=false）
- 📦 `TEST_DATABASE_URL` / `TEST_DATABASE_OWNER_URL`（测试专用）

## 三、CMS 基础与密钥类（代码实证）

- ✅ `DATABASE_URL` / `PG_DATABASE`（yyc3_yy）
- ✅ `JWT_SECRET` / `ENCRYPTION_SECRET` / `ENCRYPTION_SALT`
- ⚠️ `GATEWAY_PORT` / `MONITORING_ENABLED` / `LOG_SERVICE_URL` / `METRICS_SERVICE_URL`（基建依赖待确认）
- ⚠️ 疑似生成残留（引用存在但功能未在协同规范出现，逐项确认后裁剪）：
  `ALIPAY_*`、`BLOCKCHAIN_*`、`FINANCIAL_AUDIT_CONTRACT_ADDRESS`、`LOYALTY_CONTRACT_ADDRESS`、
  `MQTT_BROKER_URL`、`OPENAI_API_KEY`、`NEXT_PUBLIC_TURN_*`、`NEXT_PUBLIC_VAPID_PUBLIC_KEY`、
  `NEXT_PUBLIC_WECHAT_APP_ID`、`NEXT_PUBLIC_ALIPAY_APP_ID`、`ARTIST_REPORT_DATA_SOURCE`

## 四、待决（阻塞部署，需用户输入）

1. 每项 env 的**来源**（部署平台面板 / 密钥服务 / CI 注入）。
2. **部署形态**：自托管 / 容器 / Serverless——决定 env 注入方式与 CMS dev 进程管理。
3. CMS dev 依赖（pg 5433、HMAC env）在生产拓扑中的对应物（同机/分机/托管 pg）。
