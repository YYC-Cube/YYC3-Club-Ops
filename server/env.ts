import { existsSync } from "node:fs"

/**
 * 本地脚本/服务端环境加载：
 * - .env.development 提供演示账号与会话密钥；
 * - .env.local 提供真实数据库连接（gitignored）。
 */
export function loadLocalEnv(): void {
  const environment = process.env.NODE_ENV ?? "development"
  if (environment === "production") return

  const loadEnvFile = (
    process as NodeJS.Process & { loadEnvFile?: (file: string) => void }
  ).loadEnvFile
  if (!loadEnvFile) return

  for (const file of [".env.development", ".env.local"]) {
    if (!existsSync(file)) continue
    try {
      loadEnvFile.call(process, file)
    } catch {
      // 文件不可读时忽略，由后续配置校验报错
    }
  }
}

export function isTestMode(): boolean {
  return process.argv.includes("--test") || process.env.APP_ENV === "test"
}

export function resolveDatabaseUrl(kind: "owner" | "app", test = isTestMode()): string {
  const candidates = test
    ? kind === "owner"
      ? ["TEST_DATABASE_OWNER_URL", "TEST_DATABASE_URL"]
      : ["TEST_DATABASE_URL", "TEST_DATABASE_OWNER_URL"]
    : kind === "owner"
      ? ["DATABASE_OWNER_URL", "DATABASE_URL"]
      : ["DATABASE_URL"]

  for (const name of candidates) {
    const value = process.env[name]?.trim()
    if (value) return value
  }

  throw new Error(`缺少数据库连接配置：${candidates.join(" 或 ")}`)
}
