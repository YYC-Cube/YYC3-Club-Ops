import type { Pool } from "pg"
import type {
  LoginRateLimitDecision,
  LoginRateLimitRule,
  LoginRateLimitScope,
  LoginRateLimiter,
} from "./rate-limit"

interface ThrottleRow {
  allowed: boolean
  retry_after_seconds: number
}

/**
 * PostgreSQL 登录限流：计数落库，多实例共享、重启不丢失。
 * 只通过 SECURITY DEFINER 函数访问，应用角色无 login_throttle 直连权限。
 */
export class PostgresLoginRateLimiter implements LoginRateLimiter {
  constructor(private readonly pool: Pool) {}

  async consume(
    scope: LoginRateLimitScope,
    key: string,
    rule: LoginRateLimitRule,
  ): Promise<LoginRateLimitDecision> {
    const result = await this.pool.query<ThrottleRow>(
      "SELECT allowed, retry_after_seconds FROM app.hit_login_throttle($1, $2, $3, $4, $5)",
      [scope, key, rule.limit, rule.windowSeconds, rule.blockSeconds],
    )
    const row = result.rows[0]
    if (!row) {
      // 函数应始终返回一行；缺失说明数据库/函数异常，按失败关闭处理。
      throw new Error("登录限流函数未返回结果")
    }
    return {
      allowed: Boolean(row.allowed),
      retryAfterSeconds: Number(row.retry_after_seconds),
    }
  }

  async reset(scope: LoginRateLimitScope, key: string): Promise<void> {
    await this.pool.query("SELECT app.reset_login_throttle($1, $2)", [scope, key])
  }

  /** 清理长期未更新的限流行；建议启动时与日常运维任务调用。 */
  async prune(olderThanSeconds = 86_400): Promise<number> {
    const result = await this.pool.query<{ pruned: number }>(
      "SELECT app.prune_login_throttle($1) AS pruned",
      [olderThanSeconds],
    )
    return Number(result.rows[0]?.pruned ?? 0)
  }
}
