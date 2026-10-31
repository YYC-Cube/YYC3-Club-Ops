import { calculateBillableHours, calculateRoomChargeCents } from "../../lib/pricing"
import { canTransitionRoom } from "../../lib/domain/room-state"
import { PREVIEW_STORES, PREVIEW_TENANT, createPreviewRooms } from "../../lib/mocks/preview-session"
import {
  RoomStatus,
  UserRole,
  type OrderBillItem,
  type PaymentMethod,
  type PosProduct,
  type Room,
  type RoomBill,
  type Store,
  type Tenant,
} from "../../lib/types"
import {
  ApiException,
  type ServerUser,
  type SessionRecord,
  roomNotFound,
  stateConflict,
} from "../domain"
import type {
  AppRepository,
  AddOrderItemInput,
  AuthAuditEntry,
  AuthAuditEvent,
  AuthAuditInput,
  CheckoutRoomResult,
  StartRoomResult,
  StoreContext,
} from "../ports"

interface RoomOrderItem {
  id: string
  productId?: string
  name: string
  unitPriceCents: number
  quantity: number
  totalCents: number
  isGift: boolean
  createdAt: string
}

interface RoomOrder {
  id: string
  orderNo: string
  storeId: string
  roomId: string
  startedAt: string
  endedAt?: string
  hourlyRateCents: number
  billableHours?: number
  roomCents?: number
  itemsCents?: number
  totalCents?: number
  paymentMethod?: PaymentMethod
  status: "active" | "paid"
  idempotencyKey?: string
}

interface ServerState {
  roomsByStore: Record<string, Room[]>
  orders: RoomOrder[]
  orderItems: Record<string, RoomOrderItem[]>
  productsByStore: Record<string, PosProduct[]>
  sessions: Record<string, SessionRecord>
  idempotency: Record<string, string>
  authAudit: AuthAuditEntry[]
  auditSeq: number
  itemSeq: number
}

/** 内存模式的价目表种子（与数据库 seed 保持同名同价，便于对照） */
export function createSeedProducts(storeId: string): PosProduct[] {
  const base = [
    { name: "矿泉水", category: "酒水", unit: "瓶", priceCents: 800, stock: 100 },
    { name: "百威啤酒", category: "酒水", unit: "瓶", priceCents: 1800, stock: 80 },
    { name: "洋酒套餐", category: "酒水", unit: "套", priceCents: 39800, stock: 10 },
    { name: "果盘", category: "小食", unit: "份", priceCents: 6800, stock: 30 },
    { name: "瓜子拼盘", category: "小食", unit: "份", priceCents: 2800, stock: 40 },
    { name: "招牌小吃拼盘", category: "小食", unit: "份", priceCents: 4800, stock: 20 },
  ]
  return base.map((item, index) => ({
    id: `${storeId}-prod-${index + 1}`,
    storeId,
    name: item.name,
    category: item.category,
    unit: item.unit,
    priceCents: item.priceCents,
    stock: item.stock,
    status: "active" as const,
  }))
}

export function createSeedState(): ServerState {
  const roomsByStore: Record<string, Room[]> = {}
  const productsByStore: Record<string, PosProduct[]> = {}
  for (const store of PREVIEW_STORES) {
    roomsByStore[store.id] = createPreviewRooms(store.id).map((room) => ({ ...room }))
    productsByStore[store.id] = createSeedProducts(store.id)
  }
  return {
    roomsByStore,
    orders: [],
    orderItems: {},
    productsByStore,
    sessions: {},
    idempotency: {},
    authAudit: [],
    auditSeq: 0,
    itemSeq: 0,
  }
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
      state.orderItems[order.id] = []
      return { room: { ...room }, orderId: order.id }
    })
  }

  private buildBill(
    state: ServerState,
    room: Room,
    order: RoomOrder,
    asOf: Date,
  ): RoomBill {
    const items = (state.orderItems[order.id] ?? []).map<OrderBillItem>((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.name,
      unitPriceCents: item.unitPriceCents,
      quantity: item.quantity,
      totalCents: item.totalCents,
      isGift: item.isGift,
      createdAt: item.createdAt,
    }))
    const itemsCents = items.reduce((sum, item) => sum + item.totalCents, 0)
    const billableHours = calculateBillableHours(order.startedAt, asOf.toISOString())
    const roomCents = calculateRoomChargeCents(order.hourlyRateCents, billableHours)
    return {
      roomId: room.id,
      orderId: order.id,
      orderNo: order.orderNo,
      startedAt: order.startedAt,
      billableHours,
      roomCents,
      itemsCents,
      totalCents: roomCents + itemsCents,
      items,
    }
  }

  private activeOrderOf(state: ServerState, storeId: string, roomId: string): RoomOrder | undefined {
    return state.orders
      .filter((item) => item.storeId === storeId && item.roomId === roomId && item.status === "active")
      .at(-1)
  }

  async listProducts(ctx: StoreContext): Promise<PosProduct[]> {
    return this.read((state) =>
      (state.productsByStore[ctx.storeId] ?? []).filter((product) => product.status === "active"),
    )
  }

  async getRoomBill(ctx: StoreContext, roomId: string, asOf: Date): Promise<RoomBill | null> {
    return this.read((state) => {
      const room = state.roomsByStore[ctx.storeId]?.find((item) => item.id === roomId)
      if (!room) throw roomNotFound(roomId)
      const order = this.activeOrderOf(state, ctx.storeId, roomId)
      if (!order) return null
      return this.buildBill(state, room, order, asOf)
    })
  }

  async addOrderItem(
    ctx: StoreContext,
    roomId: string,
    input: AddOrderItemInput,
    at: Date,
  ): Promise<RoomBill> {
    return this.mutate((state) => {
      const room = this.findRoom(state, ctx.storeId, roomId)
      const order = this.activeOrderOf(state, ctx.storeId, roomId)
      if (!order) throw stateConflict("包厢没有进行中的订单，请先开房")

      const product = (state.productsByStore[ctx.storeId] ?? []).find(
        (item) => item.id === input.productId,
      )
      if (!product || product.status !== "active") {
        throw new ApiException(`商品不存在或已下架：${input.productId}`, 404, "not_found")
      }
      if (product.stock < input.quantity) {
        throw new ApiException(
          `库存不足：${product.name} 剩余 ${product.stock}`,
          409,
          "insufficient_stock",
        )
      }

      state.itemSeq += 1
      const item: RoomOrderItem = {
        id: `item-${state.itemSeq}`,
        productId: product.id,
        name: product.name,
        unitPriceCents: product.priceCents,
        quantity: input.quantity,
        totalCents: product.priceCents * input.quantity,
        isGift: false,
        createdAt: at.toISOString(),
      }
      state.orderItems[order.id] = [...(state.orderItems[order.id] ?? []), item]
      product.stock -= input.quantity

      return this.buildBill(state, room, order, at)
    })
  }

  async removeOrderItem(
    ctx: StoreContext,
    roomId: string,
    itemId: string,
    at: Date,
  ): Promise<RoomBill> {
    return this.mutate((state) => {
      const room = this.findRoom(state, ctx.storeId, roomId)
      const order = this.activeOrderOf(state, ctx.storeId, roomId)
      if (!order) throw stateConflict("包厢没有进行中的订单，无法退单")

      const items = state.orderItems[order.id] ?? []
      const target = items.find((item) => item.id === itemId)
      if (!target) throw new ApiException(`消费明细不存在：${itemId}`, 404, "not_found")

      state.orderItems[order.id] = items.filter((item) => item.id !== itemId)
      if (target.productId) {
        const product = (state.productsByStore[ctx.storeId] ?? []).find(
          (item) => item.id === target.productId,
        )
        if (product) product.stock += target.quantity
      }

      return this.buildBill(state, room, order, at)
    })
  }

  async checkoutRoom(
    ctx: StoreContext,
    roomId: string,
    idempotencyKey: string | undefined,
    endedAt: Date,
    paymentMethod: PaymentMethod,
  ): Promise<CheckoutRoomResult> {
    return this.mutate((state) => {
      const room = this.findRoom(state, ctx.storeId, roomId)

      if (idempotencyKey && state.idempotency[idempotencyKey]) {
        const existing = state.orders.find((order) => order.id === state.idempotency[idempotencyKey])
        if (!existing || existing.roomId !== roomId || existing.storeId !== ctx.storeId) {
          throw new ApiException("幂等键与房间不匹配", 409, "idempotency_conflict")
        }
        const paidAt = existing.endedAt ?? endedAt.toISOString()
        return {
          ...this.buildBill(state, room, existing, new Date(paidAt)),
          room: { ...room },
          paymentMethod: existing.paymentMethod ?? paymentMethod,
          paidAt,
        }
      }

      if (room.status !== RoomStatus.OCCUPIED) {
        throw stateConflict(`包厢当前状态为 ${room.status}，不能结账`)
      }

      const order = this.activeOrderOf(state, ctx.storeId, roomId)
      if (!order) throw stateConflict("缺少进行中的房间订单，无法结账")

      const bill = this.buildBill(state, room, order, endedAt)
      order.endedAt = endedAt.toISOString()
      order.billableHours = bill.billableHours
      order.roomCents = bill.roomCents
      order.itemsCents = bill.itemsCents
      order.totalCents = bill.totalCents
      order.paymentMethod = paymentMethod
      order.status = "paid"
      order.idempotencyKey = idempotencyKey
      room.status = RoomStatus.CLEANING
      if (idempotencyKey) state.idempotency[idempotencyKey] = order.id

      return {
        ...bill,
        room: { ...room },
        paymentMethod,
        paidAt: endedAt.toISOString(),
      }
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
