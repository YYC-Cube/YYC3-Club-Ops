# env 裁剪清单（P1 专项产出，2026-11-02）

> 方法：CMS 仓 19 个 ⚠️ 类 env → 逐项定位引用文件 → 反向导入扫描（app/components/pages 活代码）
> → 二级核查（payment 全仓导入方、5g 页面级引用、API 路由占比）。
> 处置原则：孤儿模块立即裁；活引用但疑似生成业务域的**业务拍板后裁**；真实业务域保留。

## A 类 — 立即可裁（孤儿模块，全仓零导入，12 env）

| env | 引用模块 | 证据 |
|---|---|---|
| ALIPAY_PRIVATE_KEY / ALIPAY_PUBLIC_KEY / NEXT_PUBLIC_ALIPAY_APP_ID / NEXT_PUBLIC_WECHAT_APP_ID | `lib/services/payment.ts` | **全仓零导入方**（app/components/lib/services 四处 grep 均无）——支付假面模块 |
| BLOCKCHAIN_PRIVATE_KEY / BLOCKCHAIN_PROVIDER_URL / FINANCIAL_AUDIT_CONTRACT_ADDRESS / LOYALTY_CONTRACT_ADDRESS | `lib/blockchain/loyalty-system.ts`、`financial-audit-chain.ts` | 零导入——区块链忠诚度/审计链为生成残留 |
| NEXT_PUBLIC_VAPID_PUBLIC_KEY | `lib/pwa/notifications.ts` | 零导入 |
| LOG_SERVICE_URL / METRICS_SERVICE_URL / MONITORING_ENABLED | `lib/monitoring/logger.ts`、`metrics.ts`、`index.ts` | 零导入（app/api 亦无引用） |
| OPENAI_API_KEY | `config/env.validator.ts`（校验清单项） | 唯一引用是校验器自身 |

处置：删模块文件 + env.validator 校验项同步移除；删除前 git tag 快照可恢复。

## B 类 — 业务拍板后裁（有活引用，疑似生成业务域，5 env）

| env | 引用链 | 待确认问题 |
|---|---|---|
| NEXT_PUBLIC_TURN_SERVER_URL / TURN_USERNAME / TURN_CREDENTIAL | `lib/5g/realtime-video-system.ts` ← `components/5g/*` ← `app/dashboard/5g/{vr,video,ar}/page.tsx` 三页面 | KTV 业务是否真要 5G VR/AR 视频房间？（essential-coverage 曾拿「5G模块」当测试对象，生成痕迹重） |
| MQTT_BROKER_URL | `lib/iot/*` ← `app/api/iot/*`（energy/inventory 等真实路由） | 智能客控/能耗 IoT 是否真部署？（对照 08 PC 功能基线查证） |
| GATEWAY_PORT | `services/api-gateway/index.ts`（独立进程） | api-gateway 是否属于目标部署拓扑（取决于部署形态） |

## C 类 — 保留（真实业务域）

- `ARTIST_REPORT_DATA_SOURCE`：`lib/services/artist-report-data.ts` ← `app/api/reports/artist/*` 4 条真实路由——艺人报告为协同规范业务域。

## 附：背景数字

- app/api 共 98 条路由，iot+reports 占 11。
- A+B 类裁剪完成后，CMS 生产 env 面从 19 个 ⚠️ 缩至 ≤7 个（B 类全保的最坏情况）。
