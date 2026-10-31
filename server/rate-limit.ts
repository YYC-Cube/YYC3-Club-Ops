/**
 * 登录限流端口与内存实现。
 *
 * 规则按 scope 区分：
 * - ip：防止单来源批量爆破（跨账号）；
 * - phone：防止针对单账号的密码猜测。
 *
 * 生产使用 PostgresLoginRateLimiter（多实例一致 + 重启保留）；
 * 单测/无库环境使用 MemoryLoginRateLimiter。
 */

export type LoginRateLimitScope = "ip" | "phone"

export interface LoginRateLimitRule {
  /** 窗口内允许的尝试次数上限 */
  limit: number
  /** 统计窗口（秒） */
  windowSeconds: number
  /** 超限后的封禁时长（秒） */
  blockSeconds: number
}

export interface LoginRateLimitPolicy {
  ip: LoginRateLimitRule
  phone: LoginRateLimitRule
}

export interface LoginRateLimitDecision {
  allowed: boolean
  /** 被拒绝时需要等待的秒数；允许时为 0 */
  retryAfterSeconds: number
}

export interface LoginRateLimiter {
  consume(
    scope: LoginRateLimitScope,
    key: string,
    rule: LoginRateLimitRule,
  ): Promise<LoginRateLimitDecision>
  reset(scope: LoginRateLimitScope, key: string): Promise<void>
}

export const DEFAULT_LOGIN_RATE_LIMIT: LoginRateLimitPolicy = {
  // 门店换班时同一公网 IP 可能集中登录，阈值放宽；封禁较短。
  ip: { limit: 60, windowSeconds: 300, blockSeconds: 300 },
  // 单账号 15 分钟内 5 次失败即封禁 15 分钟。
  phone: { limit: 5, windowSeconds: 900, blockSeconds: 900 },
}

const MAX_KEY_LENGTH = 128

/** 限流键规范化：去空白、统一小写，避免大小写/空格绕过；超长直接截断。 */
export function normalizeLoginKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "").slice(0, MAX_KEY_LENGTH)
}

interface Bucket {
  windowStartedAt: number
  attempts: number
  blockedUntil: number
}

export class MemoryLoginRateLimiter implements LoginRateLimiter {
  private readonly buckets = new Map<string, Bucket>()

  constructor(private readonly clock: () => number = () => Date.now()) {}

  async consume(
    scope: LoginRateLimitScope,
    key: string,
    rule: LoginRateLimitRule,
  ): Promise<LoginRateLimitDecision> {
    const nowMs = this.clock()
    const bucketKey = `${scope}:${key}`
    const bucket = this.buckets.get(bucketKey)

    if (bucket && bucket.blockedUntil > nowMs) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.blockedUntil - nowMs) / 1000)),
      }
    }

    const windowMs = rule.windowSeconds * 1000
    if (bucket && bucket.blockedUntil > 0) {
      // 封禁已到期：重新开窗
      this.buckets.set(bucketKey, { windowStartedAt: nowMs, attempts: 1, blockedUntil: 0 })
      return { allowed: true, retryAfterSeconds: 0 }
    }

    if (!bucket || nowMs - bucket.windowStartedAt >= windowMs) {
      this.buckets.set(bucketKey, { windowStartedAt: nowMs, attempts: 1, blockedUntil: 0 })
      return { allowed: true, retryAfterSeconds: 0 }
    }

    bucket.attempts += 1
    if (bucket.attempts > rule.limit) {
      bucket.blockedUntil = nowMs + rule.blockSeconds * 1000
      return { allowed: false, retryAfterSeconds: rule.blockSeconds }
    }

    return { allowed: true, retryAfterSeconds: 0 }
  }

  async reset(scope: LoginRateLimitScope, key: string): Promise<void> {
    this.buckets.delete(`${scope}:${key}`)
  }

  /** 仅测试使用：读取当前计数，便于断言。 */
  peek(scope: LoginRateLimitScope, key: string): Readonly<Bucket> | undefined {
    return this.buckets.get(`${scope}:${key}`)
  }
}
