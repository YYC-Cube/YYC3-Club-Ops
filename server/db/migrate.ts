import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { Pool } from "pg"
import { isTestMode, loadLocalEnv, resolveDatabaseUrl } from "../env"

async function main(): Promise<void> {
  loadLocalEnv()
  const test = isTestMode()
  const connectionString = resolveDatabaseUrl("owner", test)
  const migrationsDir = path.resolve(process.cwd(), "db/migrations")
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort()

  const pool = new Pool({ connectionString, max: 1 })
  const client = await pool.connect()
  try {
    for (const file of files) {
      const sql = await readFile(path.join(migrationsDir, file), "utf8")
      await client.query(sql)
      console.log(`[db] applied ${file}`)
    }
    const result = await client.query(
      "select count(*)::int as tables from information_schema.tables where table_schema='app' and table_type='BASE TABLE'",
    )
    console.log(`[db] target=${test ? "test" : "main"} app_tables=${result.rows[0]?.tables ?? 0}`)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error("[db] migrate failed:", error)
  process.exitCode = 1
})
