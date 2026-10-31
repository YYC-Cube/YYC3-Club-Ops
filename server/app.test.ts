import { beforeEach, describe, expect, it } from "vitest"
import { createApp } from "./app"
import { MemoryRepository } from "./repositories/memory"
import { createSeedUsers } from "./domain"
import { MemoryLoginRateLimiter, type LoginRateLimitPolicy } from "./rate-limit"
import { STORE_FLAGSHIP_ID, STORE_RIVER_ID } from "../lib/mocks/preview-session"

const PASSWORD = "test-password-123"
const SECRET = "test-session-secret-1234567890"

/** 主用例不受限流干扰；限流行为在专门用例中收紧。 */
const GENEROUS_POLICY: LoginRateLimitPolicy = {
  ip: { limit: 10_000, windowSeconds: 60, blockSeconds: 60 },
  phone: { limit: 10_000, windowSeconds: 60, blockSeconds: 60 },
}

let repository: MemoryRepository
let app: ReturnType<typeof createApp>
let currentTime: Date
let lastCsrfToken = ""

const createTestApp = (policy: LoginRateLimitPolicy = GENEROUS_POLICY) => {
  repository = new MemoryRepository(createSeedUsers(PASSWORD))
  currentTime = new Date("2026-10-31T02:00:00.000Z")
  lastCsrfToken = ""
  const loginLimiter = new MemoryLoginRateLimiter(() => currentTime.getTime())
  app = createApp({
    repository,
    loginLimiter,
    sessionSecret: SECRET,
    appOrigin: "http://localhost:3030",
    cookieSecure: false,
    sessionTtlSeconds: 28_800,
    loginRateLimit: policy,
    trustProxy: false,
    now: () => currentTime,
  })
}

beforeEach(() => {
  createTestApp()
})

async function login(phone = "13800138000", password = PASSWORD) {
  const response = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: phone, password }),
  })
  const body = (await response.json()) as {
    success: boolean
    data?: {
      session?: { currentStoreId: string; stores: { id: string }[]; csrfToken?: string; expiresAt: string }
    }
    code?: string
  }
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? ""
  const csrfToken = body.data?.session?.csrfToken ?? ""
  if (csrfToken) lastCsrfToken = csrfToken
  return { response, body, cookie, csrfToken }
}

function authHeaders(cookie: string, csrfToken = lastCsrfToken) {
  return { cookie, "Content-Type": "application/json", "X-CSRF-Token": csrfToken }
}

describe("api/health", () => {
  it("返回健康状态", async () => {
    const response = await app.request("/api/health")
    expect(response.status).toBe(200)
    const body = (await response.json()) as { status: string }
    expect(body.status).toBe("ok")
  })
})

describe("api/auth", () => {
  it("未登录访问会话返回 401", async () => {
    const response = await app.request("/api/auth/session")
    expect(response.status).toBe(401)
    const body = (await response.json()) as { code: string }
    expect(body.code).toBe("unauthorized")
  })

  it("错误密码返回 401", async () => {
    const { response } = await login("13800138000", "wrong-password")
    expect(response.status).toBe(401)
  })

  it("登录成功下发 HttpOnly 会话并返回门店列表", async () => {
    const { response, body, cookie } = await login()
    expect(response.status).toBe(200)
    expect(cookie).toContain("yyc3_session=")
    expect(response.headers.get("set-cookie")).toContain("HttpOnly")
    expect(body.data?.session?.stores).toHaveLength(2)

    const sessionResponse = await app.request("/api/auth/session", { headers: authHeaders(cookie) })
    expect(sessionResponse.status).toBe(200)
    const sessionBody = (await sessionResponse.json()) as {
      data: { currentStoreId: string; user: { phone: string } }
    }
    expect(sessionBody.data.currentStoreId).toBe(STORE_FLAGSHIP_ID)
    expect(sessionBody.data.user.phone).toBe("13800138000")
  })

  it("登出后旧 Cookie 失效", async () => {
    const { cookie } = await login()
    const logout = await app.request("/api/auth/logout", {
      method: "POST",
      headers: authHeaders(cookie),
    })
    expect(logout.status).toBe(200)

    const session = await app.request("/api/auth/session", { headers: authHeaders(cookie) })
    expect(session.status).toBe(401)
  })
})

describe("api/auth CSRF 与会话刷新", () => {
  it("缺少或伪造 X-CSRF-Token 的写操作返回 403", async () => {
    const { cookie, csrfToken } = await login()
    const roomPath = `/api/stores/${STORE_FLAGSHIP_ID}/rooms/room-fs-vip-01`

    const missing = await app.request(`${roomPath}/start`, {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
    })
    expect(missing.status).toBe(403)
    const missingBody = (await missing.json()) as { code: string }
    expect(missingBody.code).toBe("csrf_invalid")

    const forged = await app.request(`${roomPath}/start`, {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json", "X-CSRF-Token": "forged-token" },
    })
    expect(forged.status).toBe(403)

    const allowed = await app.request(`${roomPath}/start`, {
      method: "POST",
      headers: authHeaders(cookie, csrfToken),
    })
    expect(allowed.status).toBe(200)
  })

  it("GET 会话不需要 CSRF 头", async () => {
    const { cookie } = await login()
    const response = await app.request("/api/auth/session", { headers: { cookie } })
    expect(response.status).toBe(200)
  })

  it("登出需要 CSRF 头，成功后旧 Cookie 失效", async () => {
    const { cookie, csrfToken } = await login()

    const blocked = await app.request("/api/auth/logout", {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
    })
    expect(blocked.status).toBe(403)

    const logout = await app.request("/api/auth/logout", {
      method: "POST",
      headers: authHeaders(cookie, csrfToken),
    })
    expect(logout.status).toBe(200)

    const session = await app.request("/api/auth/session", { headers: { cookie } })
    expect(session.status).toBe(401)
  })

  it("刷新会话延长有效期并下发新 Cookie", async () => {
    const { cookie, csrfToken, body } = await login()
    const previousExpiry = new Date(body.data!.session!.expiresAt).getTime()

    currentTime = new Date(currentTime.getTime() + 60 * 60 * 1000)

    const refresh = await app.request("/api/auth/refresh", {
      method: "POST",
      headers: authHeaders(cookie, csrfToken),
    })
    expect(refresh.status).toBe(200)
    expect(refresh.headers.get("set-cookie")).toContain("yyc3_session=")

    const refreshBody = (await refresh.json()) as {
      data: { session: { expiresAt: string; csrfToken: string } }
    }
    const newExpiry = new Date(refreshBody.data.session.expiresAt).getTime()
    expect(newExpiry).toBeGreaterThan(previousExpiry)
    expect(refreshBody.data.session.csrfToken).toBe(csrfToken)

    const newCookie = refresh.headers.get("set-cookie")?.split(";")[0] ?? ""
    const session = await app.request("/api/auth/session", { headers: { cookie: newCookie } })
    expect(session.status).toBe(200)
  })

  it("刷新缺少 CSRF 头返回 403", async () => {
    const { cookie } = await login()
    const refresh = await app.request("/api/auth/refresh", {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
    })
    expect(refresh.status).toBe(403)
  })
})

describe("api/auth 登录限流", () => {
  it("同一账号连续失败超过阈值后返回 429，并带 Retry-After；封禁到期后恢复", async () => {
    createTestApp({
      ip: { limit: 1_000, windowSeconds: 600, blockSeconds: 600 },
      phone: { limit: 2, windowSeconds: 600, blockSeconds: 300 },
    })
    const phone = "13800138000"

    const first = await login(phone, "wrong-1")
    expect(first.response.status).toBe(401)
    const second = await login(phone, "wrong-2")
    expect(second.response.status).toBe(401)

    const blocked = await login(phone, "wrong-3")
    expect(blocked.response.status).toBe(429)
    expect(blocked.response.headers.get("retry-after")).toBe("300")
    expect(blocked.body.code).toBe("rate_limited")

    // 封禁到期后重新开窗，可再次尝试（仍然密码错误 → 401）
    currentTime = new Date(currentTime.getTime() + 301_000)
    const recovered = await login(phone, "wrong-4")
    expect(recovered.response.status).toBe(401)
  })

  it("登录成功会重置该账号的失败计数", async () => {
    createTestApp({
      ip: { limit: 1_000, windowSeconds: 600, blockSeconds: 600 },
      phone: { limit: 2, windowSeconds: 600, blockSeconds: 300 },
    })
    const phone = "13800138000"

    // 第 1 次失败（计数 1）→ 第 2 次成功（计数 2，随即清零）
    expect((await login(phone, "wrong-1")).response.status).toBe(401)
    const success = await login(phone, PASSWORD)
    expect(success.response.status).toBe(200)

    // 若未清零，这两次失败会把计数推到 4 而触发封禁
    expect((await login(phone, "wrong-2")).response.status).toBe(401)
    expect((await login(phone, "wrong-3")).response.status).toBe(401)
  })

  it("来源 IP 超限时在解析请求体之前即拒绝", async () => {
    createTestApp({
      ip: { limit: 2, windowSeconds: 600, blockSeconds: 300 },
      phone: { limit: 1_000, windowSeconds: 600, blockSeconds: 600 },
    })

    expect((await login("13800138000", "wrong-1")).response.status).toBe(401)
    expect((await login("13800138000", "wrong-2")).response.status).toBe(401)

    const blocked = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    })
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get("retry-after")).toBe("300")
  })
})

describe("api/admin 审计与强制下线", () => {
  it("登录成功/失败、刷新、登出均产生审计事件", async () => {
    expect((await login("13800138000", "wrong-password")).response.status).toBe(401)
    const { cookie } = await login()
    await app.request("/api/auth/refresh", { method: "POST", headers: authHeaders(cookie) })
    await app.request("/api/auth/logout", { method: "POST", headers: authHeaders(cookie) })

    const events = repository.snapshot().authAudit.map((entry) => entry.event)
    expect(events).toContain("login_failure")
    expect(events).toContain("login_success")
    expect(events).toContain("session_refresh")
    expect(events).toContain("logout")
  })

  it("登录失败记录账号；未知手机号不携带租户", async () => {
    await login("19999999999", "any-password") // 未知手机号
    await login("13800138000", "wrong-password")

    const entries = repository.snapshot().authAudit.filter((e) => e.event === "login_failure")
    expect(entries).toHaveLength(2)
    expect(entries[0].phone).toBe("19999999999")
    expect(entries[0].tenantId).toBeNull()
    expect(entries[1].phone).toBe("13800138000")
    expect(entries[1].tenantId).toBe("tenant-demo-001")
    expect(entries[1].userId).toBe("user-demo-manager")
  })

  it("店长可强制下线收银员，其旧 Cookie 立即失效且审计记录操作者", async () => {
    const cashier = await login("13900139000")
    const manager = await login("13800138000")

    const force = await app.request("/api/admin/users/user-demo-cashier/force-logout", {
      method: "POST",
      headers: authHeaders(manager.cookie, manager.csrfToken),
    })
    expect(force.status).toBe(200)
    const forceBody = (await force.json()) as { data: { userId: string; revokedSessions: number } }
    expect(forceBody.data.userId).toBe("user-demo-cashier")
    expect(forceBody.data.revokedSessions).toBe(1)

    const cashierSession = await app.request("/api/auth/session", {
      headers: { cookie: cashier.cookie },
    })
    expect(cashierSession.status).toBe(401)

    // 店长自身会话不受影响
    const managerSession = await app.request("/api/auth/session", {
      headers: { cookie: manager.cookie },
    })
    expect(managerSession.status).toBe(200)

    // 被下线用户可重新登录恢复
    expect((await login("13900139000")).response.status).toBe(200)

    const forceEvent = repository
      .snapshot()
      .authAudit.find((entry) => entry.event === "force_logout")
    expect(forceEvent?.actorId).toBe("user-demo-manager")
    expect(forceEvent?.userId).toBe("user-demo-cashier")
    expect(forceEvent?.tenantId).toBe("tenant-demo-001")
  })

  it("收银员无权查询审计或强制下线（forbidden_role）", async () => {
    const cashier = await login("13900139000")

    const audit = await app.request("/api/admin/auth-audit", {
      headers: authHeaders(cashier.cookie, cashier.csrfToken),
    })
    expect(audit.status).toBe(403)
    expect(((await audit.json()) as { code: string }).code).toBe("forbidden_role")

    const force = await app.request("/api/admin/users/user-demo-manager/force-logout", {
      method: "POST",
      headers: authHeaders(cashier.cookie, cashier.csrfToken),
    })
    expect(force.status).toBe(403)
    expect(((await force.json()) as { code: string }).code).toBe("forbidden_role")
  })

  it("强制下线缺少 CSRF 头返回 403，目标不存在返回 404", async () => {
    const manager = await login("13800138000")

    const noCsrf = await app.request("/api/admin/users/user-demo-cashier/force-logout", {
      method: "POST",
      headers: { cookie: manager.cookie, "Content-Type": "application/json" },
    })
    expect(noCsrf.status).toBe(403)
    expect(((await noCsrf.json()) as { code: string }).code).toBe("csrf_invalid")

    const missing = await app.request("/api/admin/users/user-missing/force-logout", {
      method: "POST",
      headers: authHeaders(manager.cookie, manager.csrfToken),
    })
    expect(missing.status).toBe(404)
    expect(((await missing.json()) as { code: string }).code).toBe("not_found")
  })

  it("店长查询审计按租户返回；limit 越界返回 400", async () => {
    await login()
    const manager = await login("13800138000")

    const audit = await app.request("/api/admin/auth-audit?limit=10", {
      headers: authHeaders(manager.cookie, manager.csrfToken),
    })
    expect(audit.status).toBe(200)
    const body = (await audit.json()) as { data: { tenantId: string | null; event: string }[] }
    expect(body.data.length).toBeGreaterThan(0)
    expect(body.data.every((entry) => entry.tenantId === "tenant-demo-001")).toBe(true)

    const invalid = await app.request("/api/admin/auth-audit?limit=1000", {
      headers: authHeaders(manager.cookie, manager.csrfToken),
    })
    expect(invalid.status).toBe(400)
    expect(((await invalid.json()) as { code: string }).code).toBe("validation_error")
  })
})

describe("api/stores", () => {
  it("返回会话授权的门店", async () => {
    const { cookie } = await login()
    const response = await app.request("/api/stores", { headers: authHeaders(cookie) })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { id: string }[] }
    expect(body.data.map((store) => store.id)).toEqual([STORE_FLAGSHIP_ID, STORE_RIVER_ID])
  })

  it("限制门店账号不能访问其他门店", async () => {
    const { cookie } = await login("13900139000")
    const forbidden = await app.request(`/api/stores/${STORE_RIVER_ID}/rooms`, {
      headers: authHeaders(cookie),
    })
    expect(forbidden.status).toBe(403)
    const forbiddenBody = (await forbidden.json()) as { code: string }
    expect(forbiddenBody.code).toBe("forbidden_store")

    const allowed = await app.request(`/api/stores/${STORE_FLAGSHIP_ID}/rooms`, {
      headers: authHeaders(cookie),
    })
    expect(allowed.status).toBe(200)
  })
})

describe("api/rooms 查询", () => {
  it("按门店返回隔离的包厢数据", async () => {
    const { cookie } = await login()
    const flagship = await app.request(`/api/stores/${STORE_FLAGSHIP_ID}/rooms`, {
      headers: authHeaders(cookie),
    })
    const flagshipBody = (await flagship.json()) as { data: { name: string; storeId: string }[] }
    expect(flagshipBody.data).toHaveLength(4)
    expect(flagshipBody.data.every((room) => room.storeId === STORE_FLAGSHIP_ID)).toBe(true)
    expect(flagshipBody.data.some((room) => room.name === "VIP-01")).toBe(true)

    const river = await app.request(`/api/stores/${STORE_RIVER_ID}/rooms`, {
      headers: authHeaders(cookie),
    })
    const riverBody = (await river.json()) as { data: { name: string; storeId: string }[] }
    expect(riverBody.data).toHaveLength(4)
    expect(riverBody.data.every((room) => room.storeId === STORE_RIVER_ID)).toBe(true)
    expect(riverBody.data.some((room) => room.name === "滨江-VIP")).toBe(true)
  })

  it("不存在的包厢返回 404", async () => {
    const { cookie } = await login()
    const response = await app.request(`/api/stores/${STORE_FLAGSHIP_ID}/rooms/room-missing`, {
      headers: authHeaders(cookie),
    })
    expect(response.status).toBe(404)
  })
})

describe("api/rooms 写入闭环", () => {
  it("开房 → 结账（15 分钟进位）→ 清台 → 可再次开房", async () => {
    const { cookie } = await login()
    const roomPath = `/api/stores/${STORE_FLAGSHIP_ID}/rooms/room-fs-vip-01`

    const start = await app.request(`${roomPath}/start`, {
      method: "POST",
      headers: authHeaders(cookie),
    })
    expect(start.status).toBe(200)
    const startBody = (await start.json()) as { data: { room: { status: string }; orderId: string } }
    expect(startBody.data.room.status).toBe("occupied")
    expect(startBody.data.orderId).toBeTruthy()

    currentTime = new Date("2026-10-31T03:16:00.000Z") // 76 分钟，进位 2 小时
    const checkout = await app.request(`${roomPath}/checkout`, {
      method: "POST",
      headers: { ...authHeaders(cookie), "Idempotency-Key": "checkout-key-1" },
    })
    expect(checkout.status).toBe(200)
    const checkoutBody = (await checkout.json()) as {
      data: { room: { status: string }; billableHours: number; totalCents: number; orderId: string }
    }
    expect(checkoutBody.data.room.status).toBe("cleaning")
    expect(checkoutBody.data.billableHours).toBe(2)
    expect(checkoutBody.data.totalCents).toBe(58000 * 2)

    const repeated = await app.request(`${roomPath}/checkout`, {
      method: "POST",
      headers: { ...authHeaders(cookie), "Idempotency-Key": "checkout-key-1" },
    })
    expect(repeated.status).toBe(200)
    const repeatedBody = (await repeated.json()) as { data: { orderId: string; totalCents: number } }
    expect(repeatedBody.data.orderId).toBe(checkoutBody.data.orderId)
    expect(repeatedBody.data.totalCents).toBe(checkoutBody.data.totalCents)

    const clean = await app.request(`${roomPath}/clean`, {
      method: "POST",
      headers: authHeaders(cookie),
    })
    expect(clean.status).toBe(200)
    const cleanBody = (await clean.json()) as { data: { status: string } }
    expect(cleanBody.data.status).toBe("available")

    const startAgain = await app.request(`${roomPath}/start`, {
      method: "POST",
      headers: authHeaders(cookie),
    })
    expect(startAgain.status).toBe(200)
  })

  it("非法状态迁移返回 409", async () => {
    const { cookie } = await login()
    const occupy = await app.request(
      `/api/stores/${STORE_FLAGSHIP_ID}/rooms/room-fs-vip-02/start`,
      { method: "POST", headers: authHeaders(cookie) },
    )
    expect(occupy.status).toBe(409)

    const clean = await app.request(
      `/api/stores/${STORE_FLAGSHIP_ID}/rooms/room-fs-vip-02/clean`,
      { method: "POST", headers: authHeaders(cookie) },
    )
    expect(clean.status).toBe(409)
  })

  it("维修与恢复通过状态接口执行", async () => {
    const { cookie } = await login()
    const roomPath = `/api/stores/${STORE_FLAGSHIP_ID}/rooms/room-fs-std-01`

    const toMaintenance = await app.request(`${roomPath}/status`, {
      method: "PUT",
      headers: authHeaders(cookie),
      body: JSON.stringify({ status: "maintenance" }),
    })
    expect(toMaintenance.status).toBe(200)
    const maintenanceBody = (await toMaintenance.json()) as { data: { status: string } }
    expect(maintenanceBody.data.status).toBe("maintenance")

    const resume = await app.request(`${roomPath}/status`, {
      method: "PUT",
      headers: authHeaders(cookie),
      body: JSON.stringify({ status: "available" }),
    })
    expect(resume.status).toBe(200)

    const invalid = await app.request(`${roomPath}/status`, {
      method: "PUT",
      headers: authHeaders(cookie),
      body: JSON.stringify({ status: "occupied" }),
    })
    expect(invalid.status).toBe(409)
  })

  it("跨门店写操作被拒绝", async () => {
    const { cookie } = await login("13900139000")
    const response = await app.request(
      `/api/stores/${STORE_RIVER_ID}/rooms/room-rv-02/start`,
      { method: "POST", headers: authHeaders(cookie) },
    )
    expect(response.status).toBe(403)
  })
})

describe("api/repository", () => {
  it("写入后保存订单与幂等键", async () => {
    const { cookie } = await login()
    const roomPath = `/api/stores/${STORE_FLAGSHIP_ID}/rooms/room-fs-vip-01`
    await app.request(`${roomPath}/start`, { method: "POST", headers: authHeaders(cookie) })
    currentTime = new Date("2026-10-31T02:30:00.000Z")
    await app.request(`${roomPath}/checkout`, {
      method: "POST",
      headers: { ...authHeaders(cookie), "Idempotency-Key": "key-persist" },
    })

    const state = repository.snapshot()
    expect(state.orders.length).toBeGreaterThan(0)
    expect(state.idempotency["key-persist"]).toBeTruthy()
    expect(state.roomsByStore[STORE_FLAGSHIP_ID].find((room) => room.id === "room-fs-vip-01")?.status).toBe(
      "cleaning",
    )
  })
})
