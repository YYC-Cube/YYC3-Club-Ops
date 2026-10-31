import { describe, expect, it } from "vitest"
import {
  createCsrfToken,
  createPasswordDigest,
  signSessionToken,
  verifyCsrfToken,
  verifyPassword,
  verifySessionToken,
} from "./security"

describe("security/password", () => {
  it("正确密码通过，错误密码拒绝", () => {
    const digest = createPasswordDigest("test-password-123")
    expect(verifyPassword("test-password-123", digest)).toBe(true)
    expect(verifyPassword("wrong-password", digest)).toBe(false)
  })

  it("同一密码每次盐值不同", () => {
    const first = createPasswordDigest("test-password-123")
    const second = createPasswordDigest("test-password-123")
    expect(first.salt).not.toBe(second.salt)
    expect(first.hash).not.toBe(second.hash)
  })
})

describe("security/csrf token", () => {
  it("生成的令牌为 64 位十六进制且每次不同", () => {
    const first = createCsrfToken()
    const second = createCsrfToken()
    expect(first).toHaveLength(64)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(first).not.toBe(second)
  })

  it("仅接受完全匹配的令牌", () => {
    const token = createCsrfToken()
    expect(verifyCsrfToken(token, token)).toBe(true)
    expect(verifyCsrfToken(`${token}a`, token)).toBe(false)
    expect(verifyCsrfToken(token.slice(0, -1), token)).toBe(false)
    expect(verifyCsrfToken("forged", token)).toBe(false)
  })

  it("缺失任一侧令牌时拒绝", () => {
    expect(verifyCsrfToken(undefined, createCsrfToken())).toBe(false)
    expect(verifyCsrfToken(createCsrfToken(), undefined)).toBe(false)
    expect(verifyCsrfToken("", "")).toBe(false)
  })
})

describe("security/session token", () => {
  const secret = "test-session-secret-1234567890"
  const payload = {
    sid: "sid-1",
    sub: "user-1",
    tenantId: "tenant-1",
    currentStoreId: "store-1",
    exp: Date.now() + 60_000,
  }

  it("签发与校验往返一致", () => {
    const token = signSessionToken(payload, secret)
    expect(verifySessionToken(token, secret)).toEqual(payload)
  })

  it("拒绝被篡改或错误密钥的 Token", () => {
    const token = signSessionToken(payload, secret)
    expect(verifySessionToken(`${token}tampered`, secret)).toBeNull()
    expect(verifySessionToken(token, "another-secret-1234567890")).toBeNull()
    expect(verifySessionToken("not-a-token", secret)).toBeNull()
  })

  it("拒绝过期 Token", () => {
    const token = signSessionToken({ ...payload, exp: Date.now() - 1 }, secret)
    expect(verifySessionToken(token, secret)).toBeNull()
  })
})
