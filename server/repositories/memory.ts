import { calculateBillableHours, calculateRoomChargeCents } from "../../lib/pricing"
import { canTransitionRoom } from "../../lib/domain/room-state"
import { PREVIEW_STORES, PREVIEW_TENANT, createPreviewRooms } from "../../lib/mocks/preview-session"
import { RoomStatus, UserRole, type Room, type Store, type Tenant } from "../../lib/types"
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

interface RoomOrder {
  id: string
  orderNo: string
  storeId: string
  roomId: string
  startedAt: string
  endedAt?: string
  hourlyRateCents: number
  billableHours?: number
  totalCents?: number
  status: "active" | "paid"
  idempotencyKey?: string
}

interface ServerState {
  roomsByStore: Record<string, Room[]>
  orders: RoomOrder[]
  sessions: Record<string, SessionRecord>
  idempotency: Record<string, string>
  authAudit: AuthAuditEntry[]
  auditSeq: number
}

export function createSeedState(): ServerState {
  const roomsByStore: Record<string, Room[]> = {}
  for (const store of PREVIEW_STORES) {
    roomsByStore[store.id] = createPreviewRooms(store.id).map((room) => ({ ...room }))
  }
  return { roomsByStore, orders: [], sessions: {}, idempotency: {}, authAudit: [], auditSeq: 0 }
}

/**
 * 内存实现：仅用于单测与本地快速验证，不持久化。
 */
export class MemoryRepository implements AppRepository {
  private state: ServerState
  private readonly users: ServerUser[]
  private queue: Promise<unknown> = Promise.resolve()

  constructor(users: ServerUser[], state: ServerState = createSeedState()) {
    this.users = users
    this.state = state
  }

  async read<T>(reader: (state: ServerState) => T): Promise<T> {
    await this.queue
    return reader(this.state)
  }

  async mutate<T>(mutator: (state: ServerState) => T | Promise<T>): Promise<T> {
    const run = this.queue.then(async () => mutator(this.state))
    this.queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  snapshot(): ServerState {
    return structuredClone(this.state)
  }

  async findUserByPhone(phone: string): Promise<ServerUser | null> {
    await this.queue
    return this.users.find((user) => user.phone === phone) ?? null
  }

  async findUserById(id: string, tenantId: string): Promise<ServerUser | null> {
    await this.queue
    return this.users.find((user) => user.id === id && user.tenantId === tenantId) ?? null
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    await this.queue
    return tenantId === PREVIEW_TENANT.id ? PREVIEW_TENANT : null
  }

  async listAuthorizedStores(userId: string, tenantId: string): Promise<Store[]> {
    await this.queue
    const user = this.users.find((item) => item.id === userId && item.tenantId === tenantId)
    if (!user) return []
    return PREVIEW_STORES.filter(
      (store) => store.tenantId === tenantId && user.storeIds.includes(store.id),
    )
  }

  async createSession(sid: string, record: SessionRecord): Promise<void> {
    await this.mutate((state) => {
      state.sessions[sid] = record
    })
  }

  async getSession(sid: string, _tenantId: string, _userId: string): Promise<SessionRecord | null> {
    return this.read((state) => state.sessions[sid] ?? null)
  }

  async refreshSession(
    sid: string,
    _tenantId: string,
    _userId: string,
    expiresAtMs: number,
  ): Promise<SessionRecord | null> {
    return this.mutate((state) => {
      const record = state.sessions[sid]
      if (!record) return null
      state.sessions[sid] = { ...record, expiresAt: expiresAtMs }
      return state.sessions[sid]
    })
  }

  async revokeSession(sid: string, _tenantId: string, _userId: string): Promise<void> {
    await this.mutate((state) => {
      delete state.sessions[sid]
    })
  }

  async cleanupExpiredSessions(nowMs: number): Promise<void> {
    await this.mutate((state) => {
      for (const [sid, record] of Object.entries(state.sessions)) {
        if (record.expiresAt <= nowMs) delete state.sessions[sid]
      }
    })
  }

  async recordAuthAudit(event: AuthAuditEvent, entry: AuthAuditInput): Promise<void> {
    await this.mutate((state) => {
      state.auditSeq += 1
      state.authAudit.push({
        id: `audit-${state.auditSeq}`,
        tenantId: entry.tenantId ?? null,
        userId: entry.userId ?? null,
        actorId: entry.actorId ?? null,
        phone: entry.phone ?? null,
        event,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
        createdAt: new Date().toISOString(),
      })
    })
  }

  async listAuthAudit(tenantId: string, limit: number): Promise<AuthAuditEntry[]> {
    return this.read((state) =>
      state.authAudit
        .filter((entry) => entry.tenantId === tenantId)
        .sort((a, b) => Number(b.id.slice(6)) - Number(a.id.slice(6)))
        .slice(0, limit),
    )
  }

  async revokeUserSessions(tenantId: string, userId: string, actorId: string): Promise<number> {
    return this.mutate((state) => {
      // 与 Postgres SECURITY DEFINER 函数对齐：DB 层同样校验操作者角色（纵深防御）。
      const actor = this.users.find(
        (user) => user.id === actorId && user.tenantId === tenantId,
      )
      if (!actor || (actor.role !== UserRole.MANAGER && actor.role !== UserRole.ADMIN)) {
        throw new ApiException("需要店长及以上权限", 403, "forbidden_role")
      }
      let revoked = 0
      for (const [sid, record] of Object.entries(state.sessions)) {
        if (record.tenantId === tenantId && record.userId === userId) {
          delete state.sessions[sid]
          revoked += 1
        }
      }
      return revoked
    })
  }

  async listRooms(ctx: StoreContext): Promise<Room[]> {
    return this.read((state) =>
      (state.roomsByStore[ctx.storeId] ?? []).filter((room) => room.storeId === ctx.storeId),
    )
  }

  async getRoom(ctx: StoreContext, roomId: string): Promise<Room | null> {
    return this.read((state) => {
      const room = state.roomsByStore[ctx.storeId]?.find((item) => item.id === roomId)
      return room ?? null
    })
  }

  async startRoom(ctx: StoreContext, roomId: string, startedAt: Date): Promise<StartRoomResult> {
    return this.mutate((state) => {
      const room = this.findRoom(state, ctx.storeId, roomId)
      if (!canTransitionRoom(room.status, RoomStatus.OCCUPIED)) {
        throw stateConflict(`包厢当前状态为 ${room.status}，不能开房`)
      }
      room.status = RoomStatus.OCCUPIED
      const order: RoomOrder = {
        id: `order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        orderNo: `RO${Date.now()}`,
        storeId: ctx.storeId,
        roomId,
        startedAt: startedAt.toISOString(),
        hourlyRateCents: room.priceCents,
        status: "active",
      }
      state.orders.push(order)
      return { room: { ...room }, orderId: order.id }
    })
  }

  async checkoutRoom(
    ctx: StoreContext,
    roomId: string,
    idempotencyKey: string | undefined,
    endedAt: Date,
  ): Promise<CheckoutRoomResult> {
    return this.mutate((state) => {
      const room = this.findRoom(state, ctx.storeId, roomId)

      if (idempotencyKey && state.idempotency[idempotencyKey]) {
        const existing = state.orders.find((order) => order.id === state.idempotency[idempotencyKey])
        if (!existing || existing.roomId !== roomId || existing.storeId !== ctx.storeId) {
          throw new ApiException("幂等键与房间不匹配", 409, "idempotency_conflict")
        }
        return {
          room: { ...room },
          orderId: existing.id,
          totalCents: existing.totalCents ?? 0,
          billableHours: existing.billableHours ?? 0,
        }
      }

      if (room.status !== RoomStatus.OCCUPIED) {
        throw stateConflict(`包厢当前状态为 ${room.status}，不能结账`)
      }

      const order = state.orders
        .filter(
          (item) =>
            item.storeId === ctx.storeId &&
            item.roomId === roomId &&
            item.status === "active",
        )
        .at(-1)
      if (!order) throw stateConflict("缺少进行中的房间订单，无法结账")

      const billableHours = calculateBillableHours(order.startedAt, endedAt.toISOString())
      const totalCents = calculateRoomChargeCents(order.hourlyRateCents, billableHours)
      order.endedAt = endedAt.toISOString()
      order.billableHours = billableHours
      order.totalCents = totalCents
      order.status = "paid"
      order.idempotencyKey = idempotencyKey
      room.status = RoomStatus.CLEANING
      if (idempotencyKey) state.idempotency[idempotencyKey] = order.id

      return { room: { ...room }, orderId: order.id, totalCents, billableHours }
    })
  }

  async cleanRoom(ctx: StoreContext, roomId: string): Promise<Room> {
    return this.mutate((state) => {
      const room = this.findRoom(state, ctx.storeId, roomId)
      if (!canTransitionRoom(room.status, RoomStatus.AVAILABLE)) {
        throw stateConflict(`包厢当前状态为 ${room.status}，不能清台`)
      }
      room.status = RoomStatus.AVAILABLE
      return { ...room }
    })
  }

  async updateRoomStatus(
    ctx: StoreContext,
    roomId: string,
    status: RoomStatus,
  ): Promise<Room> {
    return this.mutate((state) => {
      const room = this.findRoom(state, ctx.storeId, roomId)
      if (!canTransitionRoom(room.status, status)) {
        throw stateConflict(`包厢状态不允许从 ${room.status} 变更为 ${status}`)
      }
      room.status = status
      return { ...room }
    })
  }

  async close(): Promise<void> {
    // 内存实现无需关闭资源
  }

  private findRoom(state: ServerState, storeId: string, roomId: string): Room {
    const room = state.roomsByStore[storeId]?.find((item) => item.id === roomId)
    if (!room) throw roomNotFound(roomId)
    return room
  }
}
