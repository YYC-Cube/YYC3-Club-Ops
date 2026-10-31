import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto"

export const SESSION_COOKIE = "yyc3_session"

export interface SessionTokenPayload {
  sid: string
  sub: string
  tenantId: string
  currentStoreId: string
  exp: number
}

export interface PasswordDigest {
  salt: string
  hash: string
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url")
}

export function createPasswordDigest(password: string): PasswordDigest {
  const salt = randomBytes(16).toString("hex")
  const hash = scryptSync(password, salt, 64).toString("hex")
  return { salt, hash }
}

export function verifyPassword(password: string, digest: PasswordDigest): boolean {
  const candidate = scryptSync(password, digest.salt, 64)
  const expected = Buffer.from(digest.hash, "hex")
  if (candidate.length !== expected.length) return false
  return timingSafeEqual(candidate, expected)
}

/** 生成会话绑定的 CSRF 同步令牌（32 字节随机，hex 编码）。 */
export function createCsrfToken(): string {
  return randomBytes(32).toString("hex")
}

/** 恒定时间比较 CSRF 令牌；缺失或长度不一致直接拒绝。 */
export function verifyCsrfToken(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false
  const candidate = Buffer.from(provided, "utf8")
  const reference = Buffer.from(expected, "utf8")
  if (candidate.length !== reference.length) return false
  return timingSafeEqual(candidate, reference)
}

export function signSessionToken(payload: SessionTokenPayload, secret: string): string {
  const body = base64Url(JSON.stringify(payload))
  const signature = createHmac("sha256", secret).update(body).digest("base64url")
  return `${body}.${signature}`
}

export function verifySessionToken(
  token: string,
  secret: string,
  /** 校验时钟；缺省用真实墙钟。应用层应注入与 now() 一致的时钟以便确定性测试。 */
  nowMs: number = Date.now(),
): SessionTokenPayload | null {
  const [body, signature] = token.split(".")
  if (!body || !signature) return null

  const expected = createHmac("sha256", secret).update(body).digest()
  const received = Buffer.from(signature, "base64url")
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return null
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionTokenPayload
    if (
      typeof payload.sid !== "string" ||
      typeof payload.sub !== "string" ||
      typeof payload.tenantId !== "string" ||
      typeof payload.currentStoreId !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return null
    }
    if (payload.exp <= nowMs) return null
    return payload
  } catch {
    return null
  }
}
