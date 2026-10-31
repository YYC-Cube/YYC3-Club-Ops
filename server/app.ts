import { randomUUID } from "node:crypto"
import { getConnInfo } from "@hono/node-server/conninfo"
import { Hono } from "hono"
import type { Context } from "hono"
import { cors } from "hono/cors"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import type { StatusCode } from "hono/utils/http-status"
import { RoomStatus, UserRole, type Session } from "../lib/types"
import {
  ApiException,
  assertSessionStore,
  buildSession,
  type ServerUser,
  type SessionRecord,
} from "./domain"
import type { AppRepository, AuthAuditEvent, AuthAuditInput, StoreContext } from "./ports"
import {
  DEFAULT_LOGIN_RATE_LIMIT,
  normalizeLoginKey,
  type LoginRateLimitPolicy,
  type LoginRateLimiter,
} from "./rate-limit"
import {
  SESSION_COOKIE,
  createCsrfToken,
  signSessionToken,
  verifyCsrfToken,
  verifyPassword,
  verifySessionToken,
  type SessionTokenPayload,
} from "./security"

interface AppEnv {
  Variables: {
    session: Session
    user: ServerUser
    sessionRecord: SessionRecord
    sessionPayload: SessionTokenPayload
  }
}

export interface CreateAppOptions {
  repository: AppRepository
  /** 登录限流：生产用 PostgresLoginRateLimiter，单测用 MemoryLoginRateLimiter */
  loginLimiter: LoginRateLimiter
  sessionSecret: string
  appOrigin: string
  cookieSecure: boolean
  sessionTtlSeconds: number
  /** 会话绝对上限（秒），超过后刷新不再续期，必须重新登录 */
  sessionMaxLifetimeSeconds?: number
  loginRateLimit?: LoginRateLimitPolicy
  /** 仅在受信反向代理后启用；否则忽略 X-Forwarded-For，防止伪造来源绕过限流 */
  trustProxy?: boolean
  now?: () => Date
}

interface LoginBody {
  username?: unknown
  password?: unknown
}

interface StatusBody {
  status?: unknown
}

const ROOM_STATUSES = new Set<string>(Object.values(RoomStatus))

function jsonError(c: Context<AppEnv>, error: ApiException) {
  c.status(error.status as StatusCode)
  return c.json({ success: false, error: error.message, code: error.code })
}

async function readJson<T>(c: Context<AppEnv>): Promise<T> {
  try {
    return (await c.req.json()) as T
  } catch {
    throw new ApiException("请求体不是合法 JSON", 400, "validation_error")
  }
}

function requireParam(c: Context<AppEnv>, name: string): string {
  const value = c.req.param(name)
  if (!value) {
    throw new ApiException(`缺少路径参数：${name}`, 400, "validation_error")
  }
  return value
}

function storeContext(session: Session, storeId: string): StoreContext {
  return { tenantId: session.tenant.id, storeId, userId: session.user.id }
}

function clientIp(c: Context<AppEnv>, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
    if (forwarded) return forwarded
  }
  try {
    const info = getConnInfo(c as unknown as Context)
    return info.remote.address ?? "unknown"
  } catch {
    return "unknown"
  }
}

function rateLimited(c: Context<AppEnv>, retryAfterSeconds: number): ApiException {
  c.header("Retry-After", String(Math.max(1, retryAfterSeconds)))
  return new ApiException("登录尝试过于频繁，请稍后再试", 429, "rate_limited")
}

function userAgentOf(c: Context<AppEnv>): string {
  return c.req.header("user-agent")?.trim().slice(0, 256) || "unknown"
}

/**
 * 审计写入兜底：审计失败仅记录日志，不阻断主流程（登录可用性优先）。
 */
async function safeAudit(
  repository: AppRepository,
  event: AuthAuditEvent,
  entry: AuthAuditInput,
): Promise<void> {
  try {
    await repository.recordAuthAudit(event, entry)
  } catch (error) {
    console.error("[api] auth audit write failed:", event, error)
  }
}

const ADMIN_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.MANAGER]

function requireAdminRole(user: ServerUser): void {
  if (!ADMIN_ROLES.includes(user.role)) {
    throw new ApiException("需要店长及以上权限", 403, "forbidden_role")
  }
}

/** 管理端审计查询上限，防止一次性拉取过大结果集 */
const AUDIT_MAX_LIMIT = 200

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

/**
 * CSRF 同步令牌校验：仅对改变状态的方法生效。
 * 令牌与会话记录绑定，跨会话不可复用。
 */
function assertCsrf(c: Context<AppEnv>, record: SessionRecord): void {
  if (!UNSAFE_METHODS.has(c.req.method.toUpperCase())) return
  const provided = c.req.header("X-CSRF-Token")?.trim()
  if (!verifyCsrfToken(provided, record.csrfToken)) {
    throw new ApiException("CSRF 校验失败，请刷新页面后重试", 403, "csrf_invalid")
  }
}

function sessionCookieOptions(cookieSecure: boolean, maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "Lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
    secure: cookieSecure,
  }
}

export function createApp(options: CreateAppOptions) {
  const {
    repository,
    loginLimiter,
    sessionSecret,
    appOrigin,
    cookieSecure,
    sessionTtlSeconds,
  } = options
  const sessionMaxLifetimeSeconds = Math.max(
    options.sessionMaxLifetimeSeconds ?? 604_800,
    sessionTtlSeconds,
  )
  const loginRateLimit = options.loginRateLimit ?? DEFAULT_LOGIN_RATE_LIMIT
  const trustProxy = options.trustProxy ?? false
  const now = options.now ?? (() => new Date())
  const app = new Hono<AppEnv>()

  app.use(
    "*",
    cors({
      origin: appOrigin,
      allowMethods: ["GET", "POST", "PUT", "OPTIONS"],
      allowHeaders: ["Content-Type", "Idempotency-Key", "X-CSRF-Token"],
      credentials: true,
    }),
  )

  app.use("*", async (c, next) => {
    await next()
    c.header("Cache-Control", "no-store")
    c.header("X-Content-Type-Options", "nosniff")
  })

  const requireAuth = async (c: Context<AppEnv>, next: () => Promise<void>) => {
    const token = getCookie(c, SESSION_COOKIE)
    if (!token) throw new ApiException("未登录或会话已失效", 401, "unauthorized")

    const payload = verifySessionToken(token, sessionSecret, now().getTime())
    if (!payload) throw new ApiException("未登录或会话已失效", 401, "unauthorized")

    const record = await repository.getSession(payload.sid, payload.tenantId, payload.sub)
    if (
      !record ||
      record.userId !== payload.sub ||
      record.tenantId !== payload.tenantId ||
      record.expiresAt <= now().getTime()
    ) {
      throw new ApiException("未登录或会话已失效", 401, "unauthorized")
    }

    const user = await repository.findUserById(payload.sub, payload.tenantId)
    if (!user) throw new ApiException("账号不存在或已停用", 401, "unauthorized")

    const tenant = await repository.getTenant(payload.tenantId)
    if (!tenant) throw new ApiException("租户不存在", 401, "unauthorized")

    const stores = await repository.listAuthorizedStores(user.id, user.tenantId)
    assertCsrf(c, record)
    const session = buildSession(
      user,
      tenant,
      stores,
      payload.currentStoreId,
      record.expiresAt,
      record.csrfToken,
    )
    c.set("session", session)
    c.set("user", user)
    c.set("sessionRecord", record)
    c.set("sessionPayload", payload)
    await next()
  }

  app.get("/api/health", (c) => c.json({ status: "ok", version: "0.4.0" }))

  app.post("/api/auth/login", async (c) => {
    // 1) 先按来源 IP 限流，避免恶意请求绕过（解析请求体之前）。
    const ipKey = normalizeLoginKey(clientIp(c, trustProxy))
    const ipDecision = await loginLimiter.consume("ip", ipKey, loginRateLimit.ip)
    if (!ipDecision.allowed) throw rateLimited(c, ipDecision.retryAfterSeconds)

    const body = await readJson<LoginBody>(c)
    const username = typeof body.username === "string" ? body.username.trim() : ""
    const password = typeof body.password === "string" ? body.password : ""

    if (!username || !password) {
      throw new ApiException("请输入账号和密码", 400, "validation_error")
    }
    if (username.length > 64 || password.length > 128) {
      throw new ApiException("账号或密码不合法", 400, "validation_error")
    }

    // 2) 再按账号限流，限制针对单账号的密码猜测。
    const phoneKey = normalizeLoginKey(username)
    const phoneDecision = await loginLimiter.consume("phone", phoneKey, loginRateLimit.phone)
    if (!phoneDecision.allowed) throw rateLimited(c, phoneDecision.retryAfterSeconds)

    const ip = clientIp(c, trustProxy)
    const userAgent = userAgentOf(c)

    const user = await repository.findUserByPhone(username)
    if (!user || !verifyPassword(password, { salt: user.passwordSalt, hash: user.passwordHash })) {
      await safeAudit(repository, "login_failure", {
        phone: username,
        tenantId: user?.tenantId ?? null,
        userId: user?.id ?? null,
        ip,
        userAgent,
      })
      throw new ApiException("账号或密码错误", 401, "unauthorized")
    }

    // 3) 登录成功：清除该账号的失败计数（不清 IP，防止绕过来源限流）。
    await loginLimiter.reset("phone", phoneKey)

    const tenant = await repository.getTenant(user.tenantId)
    const stores = await repository.listAuthorizedStores(user.id, user.tenantId)
    if (!tenant || stores.length === 0) {
      throw new ApiException("当前账号未绑定任何门店", 403, "no_store")
    }

    const currentStoreId = stores[0].id
    const expiresAt = now().getTime() + sessionTtlSeconds * 1000
    const sid = randomUUID()
    const csrfToken = createCsrfToken()

    await repository.cleanupExpiredSessions(now().getTime())
    await repository.createSession(sid, {
      userId: user.id,
      tenantId: user.tenantId,
      currentStoreId,
      expiresAt,
      csrfToken,
    })

    await safeAudit(repository, "login_success", {
      tenantId: user.tenantId,
      userId: user.id,
      actorId: user.id,
      phone: user.phone,
      ip,
      userAgent,
    })

    const token = signSessionToken(
      { sid, sub: user.id, tenantId: user.tenantId, currentStoreId, exp: expiresAt },
      sessionSecret,
    )

    setCookie(c, SESSION_COOKIE, token, sessionCookieOptions(cookieSecure, sessionTtlSeconds))

    return c.json({
      success: true,
      data: { session: buildSession(user, tenant, stores, currentStoreId, expiresAt, csrfToken) },
    })
  })

  app.get("/api/auth/session", requireAuth, (c) => {
    return c.json({ success: true, data: c.get("session") })
  })

  /**
   * 会话刷新：滑动续期，受 SESSION_MAX_LIFETIME_SECONDS 绝对上限约束。
   * 需要 CSRF 头；返回新 Cookie 与新过期时间，CSRF token 保持不变。
   */
  app.post("/api/auth/refresh", requireAuth, async (c) => {
    const record = c.get("sessionRecord")
    const payload = c.get("sessionPayload")
    const current = c.get("session")
    const user = c.get("user")

    const expiresAt = now().getTime() + sessionTtlSeconds * 1000
    const refreshed = await repository.refreshSession(
      payload.sid,
      payload.tenantId,
      payload.sub,
      expiresAt,
      sessionMaxLifetimeSeconds,
    )
    if (!refreshed) {
      deleteCookie(c, SESSION_COOKIE, { path: "/" })
      throw new ApiException("会话已过期，请重新登录", 401, "session_expired")
    }

    const token = signSessionToken(
      {
        sid: payload.sid,
        sub: payload.sub,
        tenantId: payload.tenantId,
        currentStoreId: refreshed.currentStoreId,
        exp: refreshed.expiresAt,
      },
      sessionSecret,
    )
    setCookie(c, SESSION_COOKIE, token, sessionCookieOptions(cookieSecure, sessionTtlSeconds))

    await safeAudit(repository, "session_refresh", {
      tenantId: payload.tenantId,
      userId: payload.sub,
      actorId: payload.sub,
      ip: clientIp(c, trustProxy),
      userAgent: userAgentOf(c),
    })

    return c.json({
      success: true,
      data: {
        session: buildSession(
          user,
          current.tenant,
          current.stores,
          refreshed.currentStoreId,
          refreshed.expiresAt,
          record.csrfToken,
        ),
      },
    })
  })

  app.post("/api/auth/logout", async (c) => {
    const token = getCookie(c, SESSION_COOKIE)
    const payload = token ? verifySessionToken(token, sessionSecret, now().getTime()) : null
    if (payload) {
      const record = await repository.getSession(payload.sid, payload.tenantId, payload.sub)
      if (record) {
        assertCsrf(c, record)
        await repository.revokeSession(payload.sid, payload.tenantId, payload.sub)
        await safeAudit(repository, "logout", {
          tenantId: payload.tenantId,
          userId: payload.sub,
          actorId: payload.sub,
          ip: clientIp(c, trustProxy),
          userAgent: userAgentOf(c),
        })
      }
    }
    deleteCookie(c, SESSION_COOKIE, { path: "/" })
    return c.json({ success: true, data: { success: true } })
  })

  // ---------------------------------------------------------------------------
  // 管理端：审计查询 + 强制下线（manager/admin，CSRF 由 requireAuth 统一校验）
  // ---------------------------------------------------------------------------

  app.get("/api/admin/auth-audit", requireAuth, async (c) => {
    requireAdminRole(c.get("user"))
    const session = c.get("session")

    const limitRaw = c.req.query("limit")
    let limit = 50
    if (limitRaw !== undefined && limitRaw !== "") {
      const parsed = Number.parseInt(limitRaw, 10)
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > AUDIT_MAX_LIMIT) {
        throw new ApiException(`limit 不合法（1-${AUDIT_MAX_LIMIT}）`, 400, "validation_error")
      }
      limit = parsed
    }

    const entries = await repository.listAuthAudit(session.tenant.id, limit)
    return c.json({ success: true, data: entries })
  })

  app.post("/api/admin/users/:userId/force-logout", requireAuth, async (c) => {
    const actor = c.get("user")
    requireAdminRole(actor)
    const session = c.get("session")
    const targetId = requireParam(c, "userId")

    const target = await repository.findUserById(targetId, session.tenant.id)
    if (!target) throw new ApiException("目标账号不存在", 404, "not_found")

    // DB 层函数会再次校验操作者角色（纵深防御），并返回实际撤销数量。
    const revokedSessions = await repository.revokeUserSessions(
      session.tenant.id,
      targetId,
      actor.id,
    )

    await safeAudit(repository, "force_logout", {
      tenantId: session.tenant.id,
      userId: targetId,
      actorId: actor.id,
      ip: clientIp(c, trustProxy),
      userAgent: userAgentOf(c),
    })

    return c.json({ success: true, data: { userId: targetId, revokedSessions } })
  })

  app.get("/api/stores", requireAuth, (c) => {
    return c.json({ success: true, data: c.get("session").stores })
  })

  app.get("/api/stores/:storeId/rooms", requireAuth, async (c) => {
    const storeId = requireParam(c, "storeId")
    const session = c.get("session")
    assertSessionStore(session, storeId)
    const rooms = await repository.listRooms(storeContext(session, storeId))
    return c.json({ success: true, data: rooms })
  })

  app.get("/api/stores/:storeId/rooms/:roomId", requireAuth, async (c) => {
    const storeId = requireParam(c, "storeId")
    const roomId = requireParam(c, "roomId")
    const session = c.get("session")
    assertSessionStore(session, storeId)
    const room = await repository.getRoom(storeContext(session, storeId), roomId)
    if (!room) throw new ApiException(`包厢不存在：${roomId}`, 404, "not_found")
    return c.json({ success: true, data: room })
  })

  app.post("/api/stores/:storeId/rooms/:roomId/start", requireAuth, async (c) => {
    const storeId = requireParam(c, "storeId")
    const roomId = requireParam(c, "roomId")
    const session = c.get("session")
    assertSessionStore(session, storeId)
    const result = await repository.startRoom(storeContext(session, storeId), roomId, now())
    return c.json({ success: true, data: result })
  })

  app.post("/api/stores/:storeId/rooms/:roomId/checkout", requireAuth, async (c) => {
    const storeId = requireParam(c, "storeId")
    const roomId = requireParam(c, "roomId")
    const session = c.get("session")
    assertSessionStore(session, storeId)
    const idempotencyKey = c.req.header("Idempotency-Key")?.trim() || undefined
    const result = await repository.checkoutRoom(
      storeContext(session, storeId),
      roomId,
      idempotencyKey,
      now(),
    )
    return c.json({ success: true, data: result })
  })

  app.post("/api/stores/:storeId/rooms/:roomId/clean", requireAuth, async (c) => {
    const storeId = requireParam(c, "storeId")
    const roomId = requireParam(c, "roomId")
    const session = c.get("session")
    assertSessionStore(session, storeId)
    const room = await repository.cleanRoom(storeContext(session, storeId), roomId)
    return c.json({ success: true, data: room })
  })

  app.put("/api/stores/:storeId/rooms/:roomId/status", requireAuth, async (c) => {
    const storeId = requireParam(c, "storeId")
    const roomId = requireParam(c, "roomId")
    const session = c.get("session")
    assertSessionStore(session, storeId)

    const body = await readJson<StatusBody>(c)
    const next = typeof body.status === "string" ? body.status : ""
    if (!ROOM_STATUSES.has(next)) {
      throw new ApiException("包厢状态不合法", 400, "validation_error")
    }
    if (next === RoomStatus.OCCUPIED || next === RoomStatus.CLEANING) {
      throw new ApiException("开房/结账请使用专用接口", 409, "room_state_conflict")
    }

    const room = await repository.updateRoomStatus(
      storeContext(session, storeId),
      roomId,
      next as RoomStatus,
    )
    return c.json({ success: true, data: room })
  })

  app.notFound((c) => c.json({ success: false, error: "接口不存在", code: "not_found" }, 404))

  app.onError((error, c) => {
    if (error instanceof ApiException) return jsonError(c, error)
    console.error("[api] unhandled error:", error)
    return c.json({ success: false, error: "服务内部错误", code: "internal_error" }, 500)
  })

  return app
}
