import { Pool } from "pg"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createPreviewRooms, PREVIEW_TENANT, STORE_FLAGSHIP_ID, STORE_RIVER_ID } from "../../lib/mocks/preview-session"
import { RoomStatus } from "../../lib/types"
import { PostgresRepository } from "./postgres"
import { PostgresLoginRateLimiter } from "../login-throttle"
import { loadLocalEnv, resolveDatabaseUrl } from "../env"

loadLocalEnv()

/** 集成测试复用生产连接串解析器；须显式配置两个角色连接串才启用（保持原 skip 语义）。 */
function resolveIntegrationUrls(): { ownerUrl?: string; appUrl?: string } {
  if (!process.env.TEST_DATABASE_OWNER_URL || !process.env.TEST_DATABASE_URL) return {}
  try {
    return {
      ownerUrl: resolveDatabaseUrl("owner", true),
      appUrl: resolveDatabaseUrl("app", true),
    }
  } catch {
    return {}
  }
}

const { ownerUrl, appUrl } = resolveIntegrationUrls()

const enabled = Boolean(ownerUrl && appUrl)

describe.skipIf(!enabled)("PostgresRepository integration", () => {
  let repo: PostgresRepository
  let adminPool: Pool
  let appPool: Pool

  beforeAll(() => {
    repo = new PostgresRepository(appUrl as string)
    adminPool = new Pool({ connectionString: ownerUrl as string, max: 1 })
    appPool = new Pool({ connectionString: appUrl as string, max: 1 })
  })

  beforeEach(async () => {
    const client = await adminPool.connect()
    try {
      await client.query("BEGIN")
      await client.query(
        "TRUNCATE app.sync_outbox, app.room_event, app.room_order_item, app.room_order, app.product, app.session, app.login_throttle, app.auth_audit RESTART IDENTITY",
      )
      for (const store of [STORE_FLAGSHIP_ID, STORE_RIVER_ID]) {
        await client.query(
          "SELECT set_config('app.tenant_id', $1, true), set_config('app.store_id', $2, true)",
          [PREVIEW_TENANT.id, store],
        )
        for (const room of createPreviewRooms(store)) {
          await client.query("UPDATE app.room SET status = $1 WHERE id = $2", [room.status, room.id])
        }
      }
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {})
      throw error
    } finally {
      client.release()
    }
  })

  afterAll(async () => {
    await adminPool.end()
    await appPool.end()
    await repo.close()
  })

  it("会话与用户/门店查询", async () => {
    const user = await repo.findUserByPhone("13800138000")
    expect(user?.id).toBe("user-demo-manager")
    expect(user?.storeIds).toEqual([STORE_FLAGSHIP_ID, STORE_RIVER_ID])
    expect((await repo.getTenant(PREVIEW_TENANT.id))?.name).toBe(PREVIEW_TENANT.name)
    expect((await repo.listAuthorizedStores(user!.id, user!.tenantId)).map((s) => s.id)).toEqual([
      STORE_FLAGSHIP_ID,
      STORE_RIVER_ID,
    ])

    const sid = "11111111-1111-1111-1111-111111111111"
    const csrfToken = "csrf-token-for-test"
    await repo.createSession(sid, {
      userId: user!.id,
      tenantId: user!.tenantId,
      currentStoreId: STORE_FLAGSHIP_ID,
      expiresAt: Date.now() + 60_000,
      csrfToken,
    })
    const record = await repo.getSession(sid, user!.tenantId, user!.id)
    expect(record).not.toBeNull()
    expect(record?.csrfToken).toBe(csrfToken)

    const refreshed = await repo.refreshSession(
      sid,
      user!.tenantId,
      user!.id,
      Date.now() + 3_600_000,
      604_800,
    )
    expect(refreshed?.expiresAt).toBeGreaterThan(record!.expiresAt)
    expect(refreshed?.csrfToken).toBe(csrfToken)

    // RLS：跨用户 / 跨租户读取同一 sid 均返回 null
    expect(await repo.getSession(sid, user!.tenantId, "user-demo-cashier")).toBeNull()
    expect(await repo.getSession(sid, "tenant-other", user!.id)).toBeNull()

    await repo.revokeSession(sid, user!.tenantId, user!.id)
    expect(await repo.getSession(sid, user!.tenantId, user!.id)).toBeNull()
  })

  it("刷新会话受绝对有效期上限约束", async () => {
    const user = await repo.findUserByPhone("13800138000")
    const sid = "22222222-2222-2222-2222-222222222222"
    await repo.createSession(sid, {
      userId: user!.id,
      tenantId: user!.tenantId,
      currentStoreId: STORE_FLAGSHIP_ID,
      expiresAt: Date.now() + 60_000,
      csrfToken: "csrf-absolute-cap",
    })

    const client = await adminPool.connect()
    try {
      await client.query("BEGIN")
      await client.query(
        "SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)",
        [user!.tenantId, user!.id],
      )
      await client.query(
        "UPDATE app.session SET created_at = now() - interval '8 days' WHERE sid = $1",
        [sid],
      )
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {})
      throw error
    } finally {
      client.release()
    }

    const refreshed = await repo.refreshSession(
      sid,
      user!.tenantId,
      user!.id,
      Date.now() + 3_600_000,
      604_800,
    )
    expect(refreshed).toBeNull()
  })

  it("认证表 RLS：无租户上下文不泄露，租户内可见，会话需用户作用域", async () => {
    const anonUsers = await appPool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM app.app_user",
    )
    expect(anonUsers.rows[0].count).toBe(0)

    const anonSessions = await appPool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM app.session",
    )
    expect(anonSessions.rows[0].count).toBe(0)

    const client = await appPool.connect()
    try {
      await client.query("BEGIN")
      await client.query(
        `SELECT set_config('app.tenant_id', $1, true), set_config('app.store_id', $2, true)`,
        [PREVIEW_TENANT.id, STORE_FLAGSHIP_ID],
      )
      const users = await client.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM app.app_user",
      )
      expect(users.rows[0].count).toBe(2)

      const stores = await client.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM app.store",
      )
      expect(stores.rows[0].count).toBe(2)

      // tenant 已设置但 user 未设置：会话仍不可见（本人作用域）
      const sessions = await client.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM app.session",
      )
      expect(sessions.rows[0].count).toBe(0)
    } finally {
      await client.query("ROLLBACK").catch(() => {})
      client.release()
    }
  })

  it("门店房间隔离与开房/结账/清台", async () => {
    const ctx = {
      tenantId: PREVIEW_TENANT.id,
      storeId: STORE_FLAGSHIP_ID,
      userId: "user-demo-manager",
    }
    const rooms = await repo.listRooms(ctx)
    expect(rooms).toHaveLength(4)
    expect(rooms.every((room) => room.storeId === STORE_FLAGSHIP_ID)).toBe(true)

    const otherRooms = await repo.listRooms({ ...ctx, storeId: STORE_RIVER_ID })
    expect(otherRooms).toHaveLength(4)
    expect(otherRooms.every((room) => room.storeId === STORE_RIVER_ID)).toBe(true)

    const startedAt = new Date("2026-10-31T02:00:00.000Z")
    const start = await repo.startRoom(ctx, "room-fs-vip-01", startedAt)
    expect(start.room.status).toBe(RoomStatus.OCCUPIED)

    const endedAt = new Date("2026-10-31T03:16:00.000Z")
    const checkout = await repo.checkoutRoom(ctx, "room-fs-vip-01", "pg-key-1", endedAt, "cash")
    expect(checkout.room.status).toBe(RoomStatus.CLEANING)
    expect(checkout.billableHours).toBe(2)
    expect(checkout.roomCents).toBe(58000 * 2)
    expect(checkout.itemsCents).toBe(0)
    expect(checkout.totalCents).toBe(58000 * 2)
    expect(checkout.paymentMethod).toBe("cash")
    expect(checkout.orderNo).toMatch(/^RO/)

    const repeated = await repo.checkoutRoom(ctx, "room-fs-vip-01", "pg-key-1", endedAt, "wechat")
    expect(repeated.orderId).toBe(checkout.orderId)
    expect(repeated.totalCents).toBe(checkout.totalCents)
    // 幂等重放沿用首次支付方式，不被二次请求覆盖
    expect(repeated.paymentMethod).toBe("cash")

    const cleaned = await repo.cleanRoom(ctx, "room-fs-vip-01")
    expect(cleaned.status).toBe(RoomStatus.AVAILABLE)
  })

  it("PostgreSQL 登录限流：计数/封禁/重置，且应用角色不能直连限流表", async () => {
    const limiter = new PostgresLoginRateLimiter(appPool)
    const rule = { limit: 2, windowSeconds: 600, blockSeconds: 300 }
    const key = `test-phone-${Date.now()}`

    expect((await limiter.consume("phone", key, rule)).allowed).toBe(true)
    expect((await limiter.consume("phone", key, rule)).allowed).toBe(true)

    const blocked = await limiter.consume("phone", key, rule)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(rule.blockSeconds)

    await limiter.reset("phone", key)
    expect((await limiter.consume("phone", key, rule)).allowed).toBe(true)
    await limiter.reset("phone", key)

    await expect(appPool.query("SELECT count(*) FROM app.login_throttle")).rejects.toThrow()
  })

  it("跨店写操作被 RLS/状态机拒绝", async () => {
    const ctx = {
      tenantId: PREVIEW_TENANT.id,
      storeId: STORE_FLAGSHIP_ID,
      userId: "user-demo-manager",
    }
    await expect(repo.startRoom(ctx, "room-rv-02", new Date())).rejects.toThrow("不存在")
  })

  it("认证审计：写入可见、空租户行隔离、跨租户写入被 RLS 拒绝", async () => {
    const user = await repo.findUserByPhone("13800138000")
    await repo.recordAuthAudit("login_success", {
      tenantId: user!.tenantId,
      userId: user!.id,
      actorId: user!.id,
      phone: user!.phone,
      ip: "127.0.0.1",
      userAgent: "vitest",
    })
    // 登录前未知手机号：tenant_id 为空的行对租户查询不可见
    await repo.recordAuthAudit("login_failure", { phone: "19999999999", ip: "127.0.0.1" })

    const entries = await repo.listAuthAudit(PREVIEW_TENANT.id, 50)
    expect(entries).toHaveLength(1)
    expect(entries[0].event).toBe("login_success")
    expect(entries[0].userId).toBe("user-demo-manager")
    expect(entries[0].ip).toBe("127.0.0.1")

    // 无租户作用域：应用角色看不到任何审计行
    const anon = await appPool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM app.auth_audit",
    )
    expect(anon.rows[0].count).toBe(0)

    // 跨租户写入被插入策略拒绝（tenant_id 与作用域不一致）
    const client = await appPool.connect()
    try {
      await client.query("BEGIN")
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [PREVIEW_TENANT.id])
      await expect(
        client.query(
          "INSERT INTO app.auth_audit (tenant_id, event) VALUES ($1, 'login_success')",
          ["tenant-other"],
        ),
      ).rejects.toThrow()
    } finally {
      await client.query("ROLLBACK").catch(() => {})
      client.release()
    }
  })

  it("强制下线：manager 撤销 cashier 全部会话；非 manager 角色在 DB 层被拒", async () => {
    const tenant = PREVIEW_TENANT.id
    const cashier = await repo.findUserByPhone("13900139000")
    const sidA = "33333333-3333-3333-3333-333333333333"
    const sidB = "44444444-4444-4444-4444-444444444444"
    for (const [index, sid] of [sidA, sidB].entries()) {
      await repo.createSession(sid, {
        userId: cashier!.id,
        tenantId: tenant,
        currentStoreId: STORE_FLAGSHIP_ID,
        expiresAt: Date.now() + 60_000,
        csrfToken: `csrf-force-${index}`,
      })
    }

    // cashier 自己或未知操作者：DB 函数拒绝（纵深防御）
    await expect(
      repo.revokeUserSessions(tenant, cashier!.id, "user-demo-cashier"),
    ).rejects.toThrow(/manager or admin/)
    await expect(
      repo.revokeUserSessions(tenant, cashier!.id, "user-not-exist"),
    ).rejects.toThrow(/manager or admin/)

    const revoked = await repo.revokeUserSessions(tenant, cashier!.id, "user-demo-manager")
    expect(revoked).toBe(2)
    expect(await repo.getSession(sidA, tenant, cashier!.id)).toBeNull()
    expect(await repo.getSession(sidB, tenant, cashier!.id)).toBeNull()

    // 幂等：再次撤销返回 0
    expect(await repo.revokeUserSessions(tenant, cashier!.id, "user-demo-manager")).toBe(0)
  })

  it("POS 闭环：点单扣库存 → 退单回补 → 结账合并房费与商品", async () => {
    const ctx = {
      tenantId: PREVIEW_TENANT.id,
      storeId: STORE_FLAGSHIP_ID,
      userId: "user-demo-manager",
    }

    const admin = await adminPool.connect()
    try {
      await admin.query("BEGIN")
      await admin.query(
        "SELECT set_config('app.tenant_id', $1, true), set_config('app.store_id', $2, true)",
        [PREVIEW_TENANT.id, STORE_FLAGSHIP_ID],
      )
      await admin.query(
        `INSERT INTO app.product (id, tenant_id, store_id, name, category, unit, price_cents, stock, status)
         VALUES ('prod-pos-1', $1, $2, '百威啤酒', '酒水', '瓶', 1800, 50, 'active')`,
        [PREVIEW_TENANT.id, STORE_FLAGSHIP_ID],
      )
      await admin.query("COMMIT")
    } catch (error) {
      await admin.query("ROLLBACK").catch(() => {})
      throw error
    } finally {
      admin.release()
    }

    const products = await repo.listProducts(ctx)
    expect(products.map((item) => item.id)).toContain("prod-pos-1")

    const startedAt = new Date("2026-10-31T02:00:00.000Z")
    await repo.startRoom(ctx, "room-fs-vip-01", startedAt)
    const initialBill = await repo.getRoomBill(ctx, "room-fs-vip-01", startedAt)
    expect(initialBill?.itemsCents).toBe(0)
    expect(initialBill?.items).toHaveLength(0)

    // 点单 2 瓶：账单 36.00，库存 50 → 48
    const bill = await repo.addOrderItem(ctx, "room-fs-vip-01", { productId: "prod-pos-1", quantity: 2 }, startedAt)
    expect(bill.itemsCents).toBe(3600)
    expect(bill.items).toHaveLength(1)
    expect(bill.totalCents).toBe(bill.roomCents + 3600)
    expect((await repo.listProducts(ctx)).find((p) => p.id === "prod-pos-1")?.stock).toBe(48)

    // 超量点单被拒（库存不足）
    await expect(
      repo.addOrderItem(ctx, "room-fs-vip-01", { productId: "prod-pos-1", quantity: 60 }, startedAt),
    ).rejects.toThrow(/库存不足/)

    // 退单：明细清空，库存回补
    const afterRemove = await repo.removeOrderItem(
      ctx,
      "room-fs-vip-01",
      bill.items[0].id,
      startedAt,
    )
    expect(afterRemove.itemsCents).toBe(0)
    expect((await repo.listProducts(ctx)).find((p) => p.id === "prod-pos-1")?.stock).toBe(50)

    // 再点 1 瓶后结账（76 分钟 → 2 小时）：房费 116,000 + 商品 1,800
    await repo.addOrderItem(ctx, "room-fs-vip-01", { productId: "prod-pos-1", quantity: 1 }, startedAt)
    const endedAt = new Date("2026-10-31T03:16:00.000Z")
    const receipt = await repo.checkoutRoom(ctx, "room-fs-vip-01", "pos-key-1", endedAt, "wechat")
    expect(receipt.roomCents).toBe(58000 * 2)
    expect(receipt.itemsCents).toBe(1800)
    expect(receipt.totalCents).toBe(58000 * 2 + 1800)
    expect(receipt.paymentMethod).toBe("wechat")
    expect(receipt.items).toHaveLength(1)

    // 结账后不再有进行中账单
    expect(await repo.getRoomBill(ctx, "room-fs-vip-01", endedAt)).toBeNull()
  })

  it("点单 RLS：跨门店商品不可见、跨店加单被拒", async () => {
    const ctx = {
      tenantId: PREVIEW_TENANT.id,
      storeId: STORE_FLAGSHIP_ID,
      userId: "user-demo-manager",
    }
    const admin = await adminPool.connect()
    try {
      await admin.query("BEGIN")
      await admin.query(
        "SELECT set_config('app.tenant_id', $1, true), set_config('app.store_id', $2, true)",
        [PREVIEW_TENANT.id, STORE_RIVER_ID],
      )
      await admin.query(
        `INSERT INTO app.product (id, tenant_id, store_id, name, category, unit, price_cents, stock, status)
         VALUES ('prod-river-1', $1, $2, '滨江专供果盘', '小食', '份', 6800, 20, 'active')`,
        [PREVIEW_TENANT.id, STORE_RIVER_ID],
      )
      await admin.query("COMMIT")
    } catch (error) {
      await admin.query("ROLLBACK").catch(() => {})
      throw error
    } finally {
      admin.release()
    }

    // 旗舰店看不到滨江店商品
    const flagshipProducts = await repo.listProducts(ctx)
    expect(flagshipProducts.some((item) => item.id === "prod-river-1")).toBe(false)

    // 旗舰店开房后，用其他门店商品下单 → 404
    await repo.startRoom(ctx, "room-fs-vip-01", new Date("2026-10-31T02:00:00.000Z"))
    await expect(
      repo.addOrderItem(ctx, "room-fs-vip-01", { productId: "prod-river-1", quantity: 1 }, new Date()),
    ).rejects.toThrow(/不存在或已下架/)
  })

  it("同步 Outbox：交易与 master.* 事件同事务落库、聚合内递增、幂等重放不重复、中继可投递", async () => {
    const ctx = {
      tenantId: PREVIEW_TENANT.id,
      storeId: STORE_FLAGSHIP_ID,
      userId: "user-demo-manager",
    }
    const outboxCount = async (eventType?: string): Promise<number> => {
      // 断言走 owner 连接：sync_outbox 仅 ENABLE RLS，应用角色无 GUC 上下文时不可见
      if (eventType) {
        const result = await adminPool.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM app.sync_outbox WHERE event_type = $1",
          [eventType],
        )
        return Number(result.rows[0].count)
      }
      const result = await adminPool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM app.sync_outbox",
      )
      return Number(result.rows[0].count)
    }
    const outboxRows = async () => {
      const result = await adminPool.query<{
        event_type: string
        aggregate_type: string
        aggregate_id: string
        sequence: string
        idempotency_key: string
        payload: Record<string, unknown>
        status: string
      }>(
        `SELECT event_type, aggregate_type, aggregate_id, sequence::text, idempotency_key, payload, status
           FROM app.sync_outbox ORDER BY created_at, id`,
      )
      return result.rows
    }

    expect(await outboxCount()).toBe(0)

    // 先建商品（App 第一写入 → master.product.created，sequence=1）
    const product = await repo.createProduct(ctx, {
      name: `云霄特饮-${Date.now()}`,
      category: "饮品",
      unit: "杯",
      priceCents: 2200,
      stock: 40,
    })

    // 开房 → 同事务出现 room.session.started
    await repo.startRoom(ctx, "room-fs-vip-01", new Date("2026-10-31T02:00:00.000Z"))
    expect(await outboxCount("room.session.started")).toBe(1)

    // 点单 → order.item.added（room_order 聚合 sequence=1）
    await repo.addOrderItem(
      ctx,
      "room-fs-vip-01",
      { productId: product.id, quantity: 1 },
      new Date("2026-10-31T02:10:00.000Z"),
    )
    expect(await outboxCount("order.item.added")).toBe(1)

    // 结账 → order.checkout.completed；幂等重放不新增事件
    const checkout = await repo.checkoutRoom(
      ctx,
      "room-fs-vip-01",
      "pg-key-outbox-1",
      new Date("2026-10-31T03:16:00.000Z"),
      "cash",
    )
    expect(await outboxCount("order.checkout.completed")).toBe(1)
    await repo.checkoutRoom(
      ctx,
      "room-fs-vip-01",
      "pg-key-outbox-1",
      new Date("2026-10-31T03:16:00.000Z"),
      "wechat",
    )
    expect(await outboxCount("order.checkout.completed")).toBe(1)

    // 聚合根内 sequence 严格递增；payload 携带事实快照
    const rows = await outboxRows()
    const orderEvents = rows.filter(
      (row) => row.aggregate_type === "room_order" && row.aggregate_id === checkout.orderId,
    )
    expect(orderEvents.map((row) => Number(row.sequence))).toEqual([1, 2])
    const completed = orderEvents.find((row) => row.event_type === "order.checkout.completed")
    expect(completed?.payload.paymentMethod).toBe("cash")
    expect(completed?.status).toBe("pending")

    // master.product.created/updated：recordVersion 单调、changedFields 精确
    const updated = await repo.updateProduct(ctx, product.id, { priceCents: 2600, stock: 36 })
    expect(updated.priceCents).toBe(2600)

    const createdEvent = (await outboxRows()).find(
      (row) => row.event_type === "master.product.created" && row.aggregate_id === product.id,
    )
    const updatedEvent = (await outboxRows()).find(
      (row) => row.event_type === "master.product.updated" && row.aggregate_id === product.id,
    )
    expect(createdEvent?.payload.recordVersion).toBe(1)
    expect(createdEvent?.payload.writer).toBe("app")
    expect(updatedEvent?.payload.recordVersion).toBe(2)
    expect(updatedEvent?.payload.changedFields).toEqual(["priceCents", "stock"])

    // 无变更的更新不产生事件
    const before = await outboxCount("master.product.updated")
    await repo.updateProduct(ctx, product.id, { priceCents: 2600 })
    expect(await outboxCount("master.product.updated")).toBe(before)

    // 中继：认领 pending → 批量投递 → 标记 sent
    let relayBody: { events: Array<{ eventType: string }> } | undefined
    const fetchImpl = (async (_input: unknown, init?: { body?: string }) => {
      relayBody = JSON.parse(init?.body ?? "{}") as { events: Array<{ eventType: string }> }
      return new Response(JSON.stringify({ accepted: relayBody?.events.length ?? 0 }), { status: 200 })
    }) as typeof fetch

    const { relayPendingEvents } = await import("../sync/outbox")
    const result = await relayPendingEvents(adminPool, {
      endpoint: "https://cms.example.test/api/v1/sync/events",
      limit: 500,
      fetchImpl,
    })
    expect(result.picked).toBe(await outboxCount())
    expect(result.sent).toBe(result.picked)
    expect(result.failed).toBe(0)
    expect(relayBody?.events.map((event) => event.eventType)).toContain("master.product.created")
    const statuses = await adminPool.query<{ status: string }>(
      "SELECT DISTINCT status FROM app.sync_outbox",
    )
    expect(statuses.rows.map((row) => row.status)).toEqual(["sent"])
  })
})
