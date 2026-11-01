/**
 * Outbox 中继 CLI：拉取 pending 事件投递 CMS。
 * 环境变量：
 *   SYNC_CMS_EVENTS_URL — CMS 接收端点（未配置时 no-op 退出）
 *   SYNC_CMS_TOKEN      — 服务间 Bearer（CMS W3 HMAC 就绪前的过渡）
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
  const { createDatabasePool } = await import("../db/pool")
  const pool = createDatabasePool(resolveDatabaseUrl("owner"), { max: 2 })
  try {
    const result = await relayPendingEvents(pool, {
      endpoint,
      token: process.env.SYNC_CMS_TOKEN?.trim() || undefined,
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
