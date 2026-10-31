import { Pool } from "pg"

export interface DatabasePoolOptions {
  max?: number
  ssl?: boolean
}

/** 共享连接池：API 仓储与登录限流复用同一池，避免连接数翻倍。 */
export function createDatabasePool(
  connectionString: string,
  options: DatabasePoolOptions = {},
): Pool {
  const pool = new Pool({
    connectionString,
    max: options.max ?? 10,
    ssl: options.ssl ? { rejectUnauthorized: false } : undefined,
  })
  pool.on("error", (error) => {
    console.error("[db] idle client error:", error)
  })
  return pool
}
