import { DEFAULT_LOGIN_RATE_LIMIT, type LoginRateLimitPolicy } from "./rate-limit"

export interface ServerConfig {
  port: number
  host: string
  appOrigin: string
  sessionSecret: string
  demoPassword: string
  cookieSecure: boolean
  sessionTtlSeconds: number
  sessionMaxLifetimeSeconds: number
  loginRateLimit: LoginRateLimitPolicy
  trustProxy: boolean
}

function readInt(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
  min: number,
): number {
  const raw = env[name]?.trim()
  if (!raw) return fallback
  const value = Number.parseInt(raw, 10)
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} 不合法（应 >= ${min} 的整数）`)
  }
  return value
}

export function loadServerConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const sessionSecret = env.SESSION_SECRET?.trim()
  if (!sessionSecret || sessionSecret.length < 16) {
    throw new Error("SESSION_SECRET 未配置或长度不足 16 位")
  }

  const demoPassword = env.DEMO_ADMIN_PASSWORD?.trim()
  if (!demoPassword || demoPassword.length < 8) {
    throw new Error("DEMO_ADMIN_PASSWORD 未配置或长度不足 8 位")
  }

  const port = readInt(env, "API_PORT", 3032, 1)
  if (port > 65535) {
    throw new Error("API_PORT 不合法")
  }

  const sessionTtlSeconds = readInt(env, "SESSION_TTL_SECONDS", 28_800, 1)
  const configuredMaxLifetime = readInt(env, "SESSION_MAX_LIFETIME_SECONDS", 604_800, 1)
  // 绝对上限不允许小于单次有效期，否则刷新会立即失效。
  const sessionMaxLifetimeSeconds = Math.max(configuredMaxLifetime, sessionTtlSeconds)

  const loginRateLimit: LoginRateLimitPolicy = {
    ip: {
      limit: readInt(env, "LOGIN_IP_LIMIT", DEFAULT_LOGIN_RATE_LIMIT.ip.limit, 1),
      windowSeconds: readInt(
        env,
        "LOGIN_IP_WINDOW_SECONDS",
        DEFAULT_LOGIN_RATE_LIMIT.ip.windowSeconds,
        1,
      ),
      blockSeconds: readInt(
        env,
        "LOGIN_IP_BLOCK_SECONDS",
        DEFAULT_LOGIN_RATE_LIMIT.ip.blockSeconds,
        1,
      ),
    },
    phone: {
      limit: readInt(env, "LOGIN_PHONE_LIMIT", DEFAULT_LOGIN_RATE_LIMIT.phone.limit, 1),
      windowSeconds: readInt(
        env,
        "LOGIN_PHONE_WINDOW_SECONDS",
        DEFAULT_LOGIN_RATE_LIMIT.phone.windowSeconds,
        1,
      ),
      blockSeconds: readInt(
        env,
        "LOGIN_PHONE_BLOCK_SECONDS",
        DEFAULT_LOGIN_RATE_LIMIT.phone.blockSeconds,
        1,
      ),
    },
  }

  return {
    port,
    host: env.API_HOST?.trim() || "127.0.0.1",
    appOrigin: env.APP_ORIGIN?.trim() || "http://localhost:3030",
    sessionSecret,
    demoPassword,
    cookieSecure: env.COOKIE_SECURE === "true" || env.NODE_ENV === "production",
    sessionTtlSeconds,
    sessionMaxLifetimeSeconds,
    loginRateLimit,
    trustProxy: env.TRUST_PROXY === "true",
  }
}
