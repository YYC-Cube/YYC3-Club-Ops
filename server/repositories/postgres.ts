import { randomUUID } from "node:crypto"
import { Pool, type PoolClient, type QueryResultRow } from "pg"
import { canTransitionRoom } from "../../lib/domain/room-state"
import { calculateBillableHours, calculateRoomChargeCents } from "../../lib/pricing"
import {
  RoomStatus,
  RoomType,
  type Permission,
  type Room,
  type Store,
  type Tenant,
  type UserRole,
} from "../../lib/types"
import { createDatabasePool } from "../db/pool"
import {
  ApiException,
  type ServerUser,
  type SessionRecord,
  roomNotFound,
  stateConflict,
} from "../domain"
import type {
  AppRepository,
  AuthAuditEntry,
  AuthAuditEvent,
  AuthAuditInput,
  CheckoutRoomResult,
  StartRoomResult,
  StoreContext,
} from "../ports"

interface UserRow extends QueryResultRow {
  id: string
  tenant_id: string
  name: string
  phone: string
  role: string
  password_salt: string
  password_hash: string
  permissions: string[]
  store_ids: string[]
  created_at: Date | string
  updated_at: Date | string
}

interface StoreRow extends QueryResultRow {
  id: string
  tenant_id: string
  code: string
  name: string
  timezone: string
  currency: string
  status: string
  created_at: Date | string
  updated_at: Date | string
}

interface TenantRow extends QueryResultRow {
  id: string
  name: string
  status: string
  created_at: Date | string
  updated_at: Date | string
}

interface RoomRow extends QueryResultRow {
  id: string
  store_id: string
  name: string
  type: string
  status: string
  price_cents: number
  floor: number | null
  capacity: number | null
}

interface SessionRow extends QueryResultRow {
  user_id: string
  tenant_id: string
  current_store_id: string
  expires_at: Date | string
  csrf_token: string
}

interface AuthAuditRow extends QueryResultRow {
  id: string | number
  tenant_id: string | null
  user_id: string | null
  actor_id: string | null
  phone: string | null
  event: string
  ip: string | null
  user_agent: string | null
  created_at: Date | string
}

interface OrderRow extends QueryResultRow {
  id: string
  room_id: string
  store_id: string
  total_cents: number | null
  billable_hours: number | null
  hourly_rate_cents: number
  started_at: Date | string
  status: string
  idempotency_key: string | null
}

function iso(value: Date | string): string {
  return new Date(value).toISOString()
}

function mapUser(row: UserRow): ServerUser {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    phone: row.phone,
    role: row.role as UserRole,
    storeIds: row.store_ids ?? [],
    permissions: (row.permissions ?? []) as Permission[],
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    passwordSalt: row.password_salt,
    passwordHash: row.password_hash,
  }
}

function mapStore(row: StoreRow): Store {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    code: row.code,
    name: row.name,
    timezone: row.timezone,
    currency: "CNY",
    status: row.status as Store["status"],
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

function mapTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    name: row.name,
    status: row.status as Tenant["status"],
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

function mapRoom(row: RoomRow): Room {
  return {
    id: row.id,
    name: row.name,
    type: row.type as RoomType,
    status: row.status as RoomStatus,
    storeId: row.store_id,
    priceCents: row.price_cents,
    floor: row.floor ?? undefined,
    capacity: row.capacity ?? undefined,
  }
}

function mapAuthAudit(row: AuthAuditRow): AuthAuditEntry {
  return {
    id: String(row.id),
    tenantId: row.tenant_id,
    userId: row.user_id,
    actorId: row.actor_id,
    phone: row.phone,
    event: row.event as AuthAuditEvent,
    ip: row.ip,
    userAgent: row.user_agent,
    createdAt: iso(row.created_at),
  }
}

/**
 * PostgreSQL 实现：所有业务查询/写入都在事务内设置 app.tenant_id / app.store_id（认证链路
 * 另设 app.user_id），由数据库 RLS 强制执行作用域；app 角色无 superuser / bypassrls。
 *
 * 认证相关查询：
 * - 登录前无租户上下文 → 只能走 app.auth_lookup（SECURITY DEFINER，按手机号精确 1 行）；
 * - 会话读写 → tenant_id + user_id 双重作用域，跨用户/跨租户查询直接返回 0 行。
 */
export class PostgresRepository implements AppRepository {
  private readonly pool: Pool

  constructor(source: Pool | string, options: { max?: number; ssl?: boolean } = {}) {
    this.pool = typeof source === "string" ? createDatabasePool(source, options) : source
  }

  /**
   * 认证/租户作用域事务。缺省字段写入空串，策略中的 NULLIF(...,'') 会使其不匹配任何行。
   */
  private async withScope<T>(
    scope: { tenantId: string; storeId?: string; userId?: string },
    handler: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query("BEGIN")
      await client.query(
        `SELECT set_config('app.tenant_id', $1, true),
                set_config('app.store_id', $2, true),
                set_config('app.user_id', $3, true)`,
        [scope.tenantId, scope.storeId ?? "", scope.userId ?? ""],
      )
      const result = await handler(client)
      await client.query("COMMIT")
      return result
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {})
      throw error
    } finally {
      client.release()
    }
  }

  private withStore<T>(
    ctx: StoreContext,
    handler: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.withScope(ctx, handler)
  }

  async findUserByPhone(phone: string): Promise<ServerUser | null> {
    // 登录前无租户上下文：只能通过 SECURITY DEFINER 函数精确查询。
    const result = await this.pool.query<UserRow>(
      `SELECT id, tenant_id, name, phone, role, password_salt, password_hash,
              permissions, store_ids, created_at, updated_at
       FROM app.auth_lookup($1)`,
      [phone],
    )
    return result.rows[0] ? mapUser(result.rows[0]) : null
  }

  async findUserById(id: string, tenantId: string): Promise<ServerUser | null> {
    return this.withScope({ tenantId, userId: id }, async (client) => {
      const result = await client.query<UserRow>(
        `SELECT u.*, COALESCE(
           (SELECT array_agg(us.store_id) FROM app.user_store us WHERE us.user_id = u.id), '{}'
         ) AS store_ids
         FROM app.app_user u
         WHERE u.id = $1 AND u.tenant_id = $2 AND u.status = 'active'
         LIMIT 1`,
        [id, tenantId],
      )
      return result.rows[0] ? mapUser(result.rows[0]) : null
    })
  }

  async listAuthorizedStores(userId: string, tenantId: string): Promise<Store[]> {
    return this.withScope({ tenantId, userId }, async (client) => {
      const result = await client.query<StoreRow>(
        `SELECT s.* FROM app.user_store us
         JOIN app.store s ON s.id = us.store_id
         WHERE us.user_id = $1 AND us.tenant_id = $2 AND s.tenant_id = $2
         ORDER BY s.code`,
        [userId, tenantId],
      )
      return result.rows.map(mapStore)
    })
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    return this.withScope({ tenantId }, async (client) => {
      const result = await client.query<TenantRow>(
        "SELECT id, name, status, created_at, updated_at FROM app.tenant WHERE id = $1 LIMIT 1",
        [tenantId],
      )
      return result.rows[0] ? mapTenant(result.rows[0]) : null
    })
  }

  async createSession(sid: string, record: SessionRecord): Promise<void> {
    await this.withScope(
      { tenantId: record.tenantId, userId: record.userId },
      async (client) => {
        await client.query(
          `INSERT INTO app.session
             (sid, user_id, tenant_id, current_store_id, expires_at, csrf_token)
           VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0), $6)`,
          [
            sid,
            record.userId,
            record.tenantId,
            record.currentStoreId,
            record.expiresAt,
            record.csrfToken,
          ],
        )
      },
    )
  }

  async getSession(
    sid: string,
    tenantId: string,
    userId: string,
  ): Promise<SessionRecord | null> {
    return this.withScope({ tenantId, userId }, async (client) => {
      const result = await client.query<SessionRow>(
        `SELECT user_id, tenant_id, current_store_id, expires_at, csrf_token
         FROM app.session
         WHERE sid = $1 AND revoked_at IS NULL AND expires_at > now()
         LIMIT 1`,
        [sid],
      )
      const row = result.rows[0]
      if (!row) return null
      return {
        userId: row.user_id,
        tenantId: row.tenant_id,
        currentStoreId: row.current_store_id,
        expiresAt: new Date(row.expires_at).getTime(),
        csrfToken: row.csrf_token,
      }
    })
  }

  async refreshSession(
    sid: string,
    tenantId: string,
    userId: string,
    expiresAtMs: number,
    maxLifetimeSeconds: number,
  ): Promise<SessionRecord | null> {
    return this.withScope({ tenantId, userId }, async (client) => {
      // 绝对上限：created_at 早于 maxLifetimeSeconds 的会话不允许续期。
      const result = await client.query<SessionRow>(
        `UPDATE app.session
            SET expires_at = to_timestamp($4 / 1000.0)
          WHERE sid = $1
            AND tenant_id = $2
            AND user_id = $3
            AND revoked_at IS NULL
            AND expires_at > now()
            AND created_at >= now() - make_interval(secs => $5)
          RETURNING user_id, tenant_id, current_store_id, expires_at, csrf_token`,
        [sid, tenantId, userId, expiresAtMs, maxLifetimeSeconds],
      )
      const row = result.rows[0]
      if (!row) return null
      return {
        userId: row.user_id,
        tenantId: row.tenant_id,
        currentStoreId: row.current_store_id,
        expiresAt: new Date(row.expires_at).getTime(),
        csrfToken: row.csrf_token,
      }
    })
  }

  async revokeSession(sid: string, tenantId: string, userId: string): Promise<void> {
    await this.withScope({ tenantId, userId }, async (client) => {
      await client.query(
        "UPDATE app.session SET revoked_at = now() WHERE sid = $1 AND revoked_at IS NULL",
        [sid],
      )
    })
  }

  async cleanupExpiredSessions(nowMs: number): Promise<void> {
    // RLS：session_expired_delete 仅允许删除 expires_at <= now() 的行，无需作用域。
    await this.pool.query("DELETE FROM app.session WHERE expires_at <= to_timestamp($1 / 1000.0)", [
      nowMs,
    ])
  }

  async recordAuthAudit(event: AuthAuditEvent, entry: AuthAuditInput): Promise<void> {
    // tenantId 缺省（登录前未知租户）写入空串 → 策略侧 NULLIF 映射为 NULL，放行空租户行。
    await this.withScope({ tenantId: entry.tenantId ?? "" }, async (client) => {
      await client.query(
        `INSERT INTO app.auth_audit
           (tenant_id, user_id, actor_id, phone, event, ip, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          entry.tenantId ?? null,
          entry.userId ?? null,
          entry.actorId ?? null,
          entry.phone ?? null,
          event,
          entry.ip ?? null,
          entry.userAgent ?? null,
        ],
      )
    })
  }

  async listAuthAudit(tenantId: string, limit: number): Promise<AuthAuditEntry[]> {
    return this.withScope({ tenantId }, async (client) => {
      const result = await client.query<AuthAuditRow>(
        `SELECT id, tenant_id, user_id, actor_id, phone, event, ip, user_agent, created_at
         FROM app.auth_audit
         WHERE tenant_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT $2`,
        [tenantId, limit],
      )
      return result.rows.map(mapAuthAudit)
    })
  }

  async revokeUserSessions(tenantId: string, userId: string, actorId: string): Promise<number> {
    // SECURITY DEFINER 函数在 DB 层校验 actor 角色并按目标用户撤销（纵深防御）。
    const result = await this.pool.query<{ revoked: number }>(
      "SELECT app.revoke_user_sessions($1, $2, $3) AS revoked",
      [actorId, tenantId, userId],
    )
    return result.rows[0]?.revoked ?? 0
  }

  async listRooms(ctx: StoreContext): Promise<Room[]> {
    return this.withStore(ctx, async (client) => {
      const result = await client.query<RoomRow>(
        `SELECT id, store_id, name, type, status, price_cents, floor, capacity
         FROM app.room WHERE store_id = $1 ORDER BY name`,
        [ctx.storeId],
      )
      return result.rows.map(mapRoom)
    })
  }

  async getRoom(ctx: StoreContext, roomId: string): Promise<Room | null> {
    return this.withStore(ctx, async (client) => {
      const result = await client.query<RoomRow>(
        `SELECT id, store_id, name, type, status, price_cents, floor, capacity
         FROM app.room WHERE store_id = $1 AND id = $2`,
        [ctx.storeId, roomId],
      )
      return result.rows[0] ? mapRoom(result.rows[0]) : null
    })
  }

  async startRoom(ctx: StoreContext, roomId: string, startedAt: Date): Promise<StartRoomResult> {
    return this.withStore(ctx, async (client) => {
      const result = await client.query<RoomRow>(
        `SELECT id, store_id, name, type, status, price_cents, floor, capacity
         FROM app.room WHERE store_id = $1 AND id = $2 FOR UPDATE`,
        [ctx.storeId, roomId],
      )
      const row = result.rows[0]
      if (!row) throw roomNotFound(roomId)
      const room = mapRoom(row)
      if (!canTransitionRoom(room.status, RoomStatus.OCCUPIED)) {
        throw stateConflict(`包厢当前状态为 ${room.status}，不能开房`)
      }

      await client.query("UPDATE app.room SET status = $1 WHERE store_id = $2 AND id = $3", [
        RoomStatus.OCCUPIED,
        ctx.storeId,
        roomId,
      ])

      const order = await client.query<{ id: string }>(
        `INSERT INTO app.room_order
           (order_no, tenant_id, store_id, room_id, started_at, hourly_rate_cents, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active')
         RETURNING id`,
        [
          `RO${Date.now()}${randomUUID().slice(0, 4)}`,
          ctx.tenantId,
          ctx.storeId,
          roomId,
          startedAt.toISOString(),
          room.priceCents,
        ],
      )

      await client.query(
        `INSERT INTO app.room_event (tenant_id, store_id, room_id, action, actor_id, before, after)
         VALUES ($1, $2, $3, 'start', $4, $5::jsonb, $6::jsonb)`,
        [
          ctx.tenantId,
          ctx.storeId,
          roomId,
          ctx.userId,
          JSON.stringify({ status: room.status }),
          JSON.stringify({ status: RoomStatus.OCCUPIED }),
        ],
      )

      return {
        room: { ...room, status: RoomStatus.OCCUPIED },
        orderId: order.rows[0].id,
      }
    })
  }

  async checkoutRoom(
    ctx: StoreContext,
    roomId: string,
    idempotencyKey: string | undefined,
    endedAt: Date,
  ): Promise<CheckoutRoomResult> {
    try {
      return await this.withStore(ctx, async (client) => {
        const roomResult = await client.query<RoomRow>(
          `SELECT id, store_id, name, type, status, price_cents, floor, capacity
           FROM app.room WHERE store_id = $1 AND id = $2 FOR UPDATE`,
          [ctx.storeId, roomId],
        )
        const row = roomResult.rows[0]
        if (!row) throw roomNotFound(roomId)
        const room = mapRoom(row)

        if (idempotencyKey) {
          const existing = await client.query<OrderRow>(
            `SELECT * FROM app.room_order WHERE store_id = $1 AND idempotency_key = $2 LIMIT 1`,
            [ctx.storeId, idempotencyKey],
          )
          const order = existing.rows[0]
          if (order) {
            if (order.room_id !== roomId) {
              throw new ApiException("幂等键与房间不匹配", 409, "idempotency_conflict")
            }
            return {
              room,
              orderId: order.id,
              totalCents: order.total_cents ?? 0,
              billableHours: order.billable_hours ?? 0,
            }
          }
        }

        if (room.status !== RoomStatus.OCCUPIED) {
          throw stateConflict(`包厢当前状态为 ${room.status}，不能结账`)
        }

        const activeOrder = await client.query<OrderRow>(
          `SELECT * FROM app.room_order
           WHERE store_id = $1 AND room_id = $2 AND status = 'active'
           ORDER BY started_at DESC LIMIT 1 FOR UPDATE`,
          [ctx.storeId, roomId],
        )
        const order = activeOrder.rows[0]
        if (!order) throw stateConflict("缺少进行中的房间订单，无法结账")

        const billableHours = calculateBillableHours(iso(order.started_at), endedAt.toISOString())
        const totalCents = calculateRoomChargeCents(order.hourly_rate_cents, billableHours)

        await client.query(
          `UPDATE app.room_order
           SET ended_at = $1, billable_hours = $2, total_cents = $3, status = 'paid', idempotency_key = $4
           WHERE id = $5`,
          [endedAt.toISOString(), billableHours, totalCents, idempotencyKey ?? null, order.id],
        )
        await client.query("UPDATE app.room SET status = $1 WHERE store_id = $2 AND id = $3", [
          RoomStatus.CLEANING,
          ctx.storeId,
          roomId,
        ])
        await client.query(
          `INSERT INTO app.room_event (tenant_id, store_id, room_id, action, actor_id, before, after)
           VALUES ($1, $2, $3, 'checkout', $4, $5::jsonb, $6::jsonb)`,
          [
            ctx.tenantId,
            ctx.storeId,
            roomId,
            ctx.userId,
            JSON.stringify({ status: room.status, totalCents: null }),
            JSON.stringify({ status: RoomStatus.CLEANING, totalCents, billableHours }),
          ],
        )

        return {
          room: { ...room, status: RoomStatus.CLEANING },
          orderId: order.id,
          totalCents,
          billableHours,
        }
      })
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new ApiException("重复结账请求", 409, "idempotency_conflict")
      }
      throw error
    }
  }

  async cleanRoom(ctx: StoreContext, roomId: string): Promise<Room> {
    return this.withStore(ctx, async (client) => {
      const result = await client.query<RoomRow>(
        `SELECT id, store_id, name, type, status, price_cents, floor, capacity
         FROM app.room WHERE store_id = $1 AND id = $2 FOR UPDATE`,
        [ctx.storeId, roomId],
      )
      const row = result.rows[0]
      if (!row) throw roomNotFound(roomId)
      const room = mapRoom(row)
      if (!canTransitionRoom(room.status, RoomStatus.AVAILABLE)) {
        throw stateConflict(`包厢当前状态为 ${room.status}，不能清台`)
      }
      await client.query("UPDATE app.room SET status = $1 WHERE store_id = $2 AND id = $3", [
        RoomStatus.AVAILABLE,
        ctx.storeId,
        roomId,
      ])
      await client.query(
        `INSERT INTO app.room_event (tenant_id, store_id, room_id, action, actor_id, before, after)
         VALUES ($1, $2, $3, 'clean', $4, $5::jsonb, $6::jsonb)`,
        [
          ctx.tenantId,
          ctx.storeId,
          roomId,
          ctx.userId,
          JSON.stringify({ status: room.status }),
          JSON.stringify({ status: RoomStatus.AVAILABLE }),
        ],
      )
      return { ...room, status: RoomStatus.AVAILABLE }
    })
  }

  async updateRoomStatus(
    ctx: StoreContext,
    roomId: string,
    status: RoomStatus,
  ): Promise<Room> {
    return this.withStore(ctx, async (client) => {
      const result = await client.query<RoomRow>(
        `SELECT id, store_id, name, type, status, price_cents, floor, capacity
         FROM app.room WHERE store_id = $1 AND id = $2 FOR UPDATE`,
        [ctx.storeId, roomId],
      )
      const row = result.rows[0]
      if (!row) throw roomNotFound(roomId)
      const room = mapRoom(row)
      if (!canTransitionRoom(room.status, status)) {
        throw stateConflict(`包厢状态不允许从 ${room.status} 变更为 ${status}`)
      }
      await client.query("UPDATE app.room SET status = $1 WHERE store_id = $2 AND id = $3", [
        status,
        ctx.storeId,
        roomId,
      ])
      await client.query(
        `INSERT INTO app.room_event (tenant_id, store_id, room_id, action, actor_id, before, after)
         VALUES ($1, $2, $3, 'status', $4, $5::jsonb, $6::jsonb)`,
        [
          ctx.tenantId,
          ctx.storeId,
          roomId,
          ctx.userId,
          JSON.stringify({ status: room.status }),
          JSON.stringify({ status }),
        ],
      )
      return { ...room, status }
    })
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}
