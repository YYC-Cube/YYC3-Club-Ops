import { describe, expect, it } from "vitest"
import {
  MemoryLoginRateLimiter,
  normalizeLoginKey,
  type LoginRateLimitRule,
} from "./rate-limit"

const RULE: LoginRateLimitRule = { limit: 3, windowSeconds: 60, blockSeconds: 30 }

function createLimiter(startMs = 1_700_000_000_000) {
  let nowMs = startMs
  const limiter = new MemoryLoginRateLimiter(() => nowMs)
  return {
    limiter,
    advance(seconds: number) {
      nowMs += seconds * 1000
    },
  }
}

describe("normalizeLoginKey", () => {
  it("去掉空白、统一小写并限制长度", () => {
    expect(normalizeLoginKey("  138 0013 8000 ")).toBe("13800138000")
    expect(normalizeLoginKey("Admin@Example.COM")).toBe("admin@example.com")
    expect(normalizeLoginKey("x".repeat(300)).length).toBe(128)
  })
})

describe("MemoryLoginRateLimiter", () => {
  it("窗口内允许到上限，超出即封禁", async () => {
    const { limiter } = createLimiter()
    for (let index = 0; index < RULE.limit; index += 1) {
      const decision = await limiter.consume("phone", "13800138000", RULE)
      expect(decision.allowed).toBe(true)
      expect(decision.retryAfterSeconds).toBe(0)
    }

    const blocked = await limiter.consume("phone", "13800138000", RULE)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBe(RULE.blockSeconds)
  })

  it("封禁期内 retryAfter 递减，到期后重新开窗", async () => {
    const { limiter, advance } = createLimiter()
    for (let index = 0; index < RULE.limit; index += 1) {
      await limiter.consume("phone", "13800138000", RULE)
    }
    await limiter.consume("phone", "13800138000", RULE)

    advance(10)
    const stillBlocked = await limiter.consume("phone", "13800138000", RULE)
    expect(stillBlocked.allowed).toBe(false)
    expect(stillBlocked.retryAfterSeconds).toBe(20)

    advance(20)
    const recovered = await limiter.consume("phone", "13800138000", RULE)
    expect(recovered.allowed).toBe(true)
  })

  it("窗口过期后计数重置", async () => {
    const { limiter, advance } = createLimiter()
    await limiter.consume("phone", "13800138000", RULE)
    await limiter.consume("phone", "13800138000", RULE)
    expect((await limiter.consume("phone", "13800138000", RULE)).allowed).toBe(true)

    advance(RULE.windowSeconds + 1)
    expect((await limiter.consume("phone", "13800138000", RULE)).allowed).toBe(true)
  })

  it("reset 清除指定 scope/key，不影响其他键", async () => {
    const { limiter } = createLimiter()
    for (let index = 0; index < RULE.limit; index += 1) {
      await limiter.consume("phone", "13800138000", RULE)
      await limiter.consume("ip", "127.0.0.1", RULE)
    }

    await limiter.reset("phone", "13800138000")
    expect((await limiter.consume("phone", "13800138000", RULE)).allowed).toBe(true)

    const ip = await limiter.consume("ip", "127.0.0.1", RULE)
    expect(ip.allowed).toBe(false)
  })

  it("不同 scope 的同名 key 互不影响", async () => {
    const { limiter } = createLimiter()
    for (let index = 0; index < RULE.limit; index += 1) {
      await limiter.consume("phone", "127.0.0.1", RULE)
    }
    const ip = await limiter.consume("ip", "127.0.0.1", RULE)
    expect(ip.allowed).toBe(true)
  })
})
