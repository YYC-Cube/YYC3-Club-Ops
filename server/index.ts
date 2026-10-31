import { serve } from "@hono/node-server"
import { createApp } from "./app"
import { loadServerConfig } from "./config"
import { createDatabasePool } from "./db/pool"
import { loadLocalEnv, resolveDatabaseUrl } from "./env"
import { PostgresLoginRateLimiter } from "./login-throttle"
import { PostgresRepository } from "./repositories/postgres"

async function main(): Promise<void> {
  loadLocalEnv()
  const config = loadServerConfig()

  const pool = createDatabasePool(resolveDatabaseUrl("app"), {
    ssl: process.env.DATABASE_SSL === "true",
  })
  const repository = new PostgresRepository(pool)
  const loginLimiter = new PostgresLoginRateLimiter(pool)

  const app = createApp({
    repository,
    loginLimiter,
    sessionSecret: config.sessionSecret,
    appOrigin: config.appOrigin,
    cookieSecure: config.cookieSecure,
    sessionTtlSeconds: config.sessionTtlSeconds,
    sessionMaxLifetimeSeconds: config.sessionMaxLifetimeSeconds,
    loginRateLimit: config.loginRateLimit,
    trustProxy: config.trustProxy,
  })

  const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
    console.log(`[api] listening on http://${config.host}:${info.port}`)
    console.log(`[api] cors origin: ${config.appOrigin}`)
    console.log("[api] storage: PostgreSQL")
    console.log(
      `[api] login throttle: db (ip ${config.loginRateLimit.ip.limit}/${config.loginRateLimit.ip.windowSeconds}s, phone ${config.loginRateLimit.phone.limit}/${config.loginRateLimit.phone.windowSeconds}s)`,
    )
  })

  // 启动时清理一天前的限流计数；失败不影响服务启动。
  void loginLimiter
    .prune()
    .then((count) => {
      if (count > 0) console.log(`[api] pruned login throttle rows: ${count}`)
    })
    .catch((error) => {
      console.warn("[api] prune login throttle failed:", error)
    })

  const shutdown = async () => {
    server.close()
    await repository.close()
    process.exit(0)
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}

main().catch((error) => {
  console.error("[api] failed to start:", error)
  process.exitCode = 1
})
