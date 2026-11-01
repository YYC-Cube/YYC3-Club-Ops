/**
 * 命令拉取 CLI：拉取 CMS 纠正命令 → 应用 → ACK（协同规范 02 §6）。
 * 环境变量：
 *   SYNC_CMS_COMMANDS_URL — 命令端点（默认 SYNC_CMS_EVENTS_URL 的 /events 换 /commands）
 *   SYNC_HMAC_ACCESS_KEY / SYNC_HMAC_SECRET / SYNC_TENANT_ID / SYNC_STORE_ID
 */
import { loadLocalEnv, resolveDatabaseUrl } from "../env"
import { PostgresRepository } from "../repositories/postgres"
import { pollCommands } from "./commands"

async function main(): Promise<void> {
  loadLocalEnv()
  const baseUrl = (process.env.SYNC_CMS_EVENTS_URL ?? process.env.SYNC_CMS_COMMANDS_URL ?? "").trim()
  if (!baseUrl) {
    console.log("[sync] 未配置 SYNC_CMS_EVENTS_URL，跳过命令拉取")
    return
  }
  const endpoint = (process.env.SYNC_CMS_COMMANDS_URL?.trim() || baseUrl.replace(/\/events$/, "/commands"))
  const accessKey = process.env.SYNC_HMAC_ACCESS_KEY?.trim()
  const secret = process.env.SYNC_HMAC_SECRET?.trim()
  const tenantId = process.env.SYNC_TENANT_ID?.trim() ?? ""
  const storeId = process.env.SYNC_STORE_ID?.trim() ?? ""
  if (!accessKey || !secret || !tenantId || !storeId) {
    console.error("[sync] 缺少 SYNC_HMAC_ACCESS_KEY/SECRET 或 SYNC_TENANT_ID/STORE_ID")
    process.exitCode = 1
    return
  }

  const { createDatabasePool } = await import("../db/pool")
  const pool = createDatabasePool(resolveDatabaseUrl("app"), { max: 2 })
  const repository = new PostgresRepository(pool)
  try {
    // userId 在 pollCommands 内逐命令替换为 CMS 操作员 ID（03 §1：actor 保留来源原文）
    const result = await pollCommands(repository, { tenantId, storeId, userId: "cms-command" }, {
      endpoint,
      tenantId,
      storeId,
      credentials: { accessKey, secret },
    })
    console.log(
      `[sync] fetched=${result.fetched} applied=${result.applied} rejected=${result.rejected}` +
        (result.details.length > 0 ? ` ${JSON.stringify(result.details)}` : ""),
    )
    if (result.rejected > 0) process.exitCode = 1
  } finally {
    await repository.close()
  }
}

main().catch((error) => {
  console.error("[sync] command poll failed:", error)
  process.exitCode = 1
})
