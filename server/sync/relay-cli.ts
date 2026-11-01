/**
 * Outbox 中继 CLI：拉取 pending 事件投递 CMS。
 * 环境变量：
 *   SYNC_CMS_EVENTS_URL   — CMS 接收端点（未配置时 no-op 退出）
 *   SYNC_HMAC_ACCESS_KEY  — 服务间 access key（协同规范 01 §安全）
 *   SYNC_HMAC_SECRET      — 共享密钥（与 CMS SYNC_HMAC_SECRET 一致）
 * 调度：可由 cron/launchd 周期调用；多实例安全（SKIP LOCKED）。
 */
import { loadLocalEnv, resolveDatabaseUrl } from "../env"
import { relayPendingEvents } from "./outbox"

async function main(): Promise<void> {
  loadLocalEnv()
  const endpoint = process.env.SYNC_CMS_EVENTS_URL?.trim()
  if (!endpoint) {
    console.log("[sync] 未配置 SYNC_CMS_EVENTS_URL，跳过投递（事件保留 pending）")
    return
  }
  // 投递目标仅允许 http(s)（env 污点 → fetch 断链点；畸形/非网络协议 fail-fast）
  const parsedEndpoint = new URL(endpoint)
  if (parsedEndpoint.protocol !== "https:" && parsedEndpoint.protocol !== "http:") {
    throw new Error(`[sync] SYNC_CMS_EVENTS_URL 仅支持 http/https，收到 ${parsedEndpoint.protocol}`)
  }
  const { createDatabasePool } = await import("../db/pool")
  const pool = createDatabasePool(resolveDatabaseUrl("owner"), { max: 2 })
  try {
    const result = await relayPendingEvents(pool, {
      endpoint,
      accessKey: process.env.SYNC_HMAC_ACCESS_KEY?.trim() || undefined,
      secret: process.env.SYNC_HMAC_SECRET?.trim() || undefined,
      limit: 200,
    })
    console.log(
      `[sync] picked=${result.picked} sent=${result.sent} failed=${result.failed}` +
        (result.skipped ? " skipped" : ""),
    )
    if (result.failed > 0) process.exitCode = 1
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error("[sync] relay failed:", error)
  process.exitCode = 1
})
