import type {
  CheckoutReceipt,
  PaymentMethod,
  PosProduct,
  Room,
  RoomBill,
  RoomStatus,
  Store,
  Tenant,
} from "../lib/types"
import type { ServerUser, SessionRecord } from "./domain"

export interface StoreContext {
  tenantId: string
  storeId: string
  userId: string
}

export interface StartRoomResult {
  room: Room
  orderId: string
}

/** 结账结果即小票结构（房费 + 商品明细 + 支付方式） */
export type CheckoutRoomResult = CheckoutReceipt

/** 点单入参：数量 1-99，商品必须属于当前门店且为 active */
export interface AddOrderItemInput {
  productId: string
  quantity: number
}

/** 商品新增入参（App 是门店商品第一写入方，写入即发 master.product.created） */
export interface CreateProductInput {
  name: string
  category: string
  unit: string
  priceCents: number
  memberPriceCents?: number
  costCents?: number
  stock: number
}

/** 商品更新入参：仅提交变更字段；写入后发 master.product.updated（含 changedFields） */
export interface UpdateProductInput {
  name?: string
  category?: string
  unit?: string
  priceCents?: number
  memberPriceCents?: number | null
  costCents?: number | null
  stock?: number
  status?: "active" | "inactive"
}

/** 登录/会话安全审计事件类型 */
export type AuthAuditEvent =
  | "login_success"
  | "login_failure"
  | "logout"
  | "session_refresh"
  | "force_logout"

export interface AuthAuditEntry {
  id: string
  /** 登录失败且手机号不存在时为 null */
  tenantId: string | null
  userId: string | null
  /** force_logout 的操作者；其余事件与 userId 一致 */
  actorId: string | null
  phone: string | null
  event: AuthAuditEvent
  ip: string | null
  userAgent: string | null
  createdAt: string
}

export interface AuthAuditInput {
  tenantId?: string | null
  userId?: string | null
  actorId?: string | null
  phone?: string | null
  ip?: string | null
  userAgent?: string | null
}

/**
 * 存储端口：API 只依赖该接口，Memory/Postgres 各自实现。
 * 所有门店业务方法必须接收 StoreContext，并在实现内强制 tenant/store 作用域。
 */
export interface AppRepository {
  findUserByPhone(phone: string): Promise<ServerUser | null>
  findUserById(id: string, tenantId: string): Promise<ServerUser | null>
  getTenant(tenantId: string): Promise<Tenant | null>
  listAuthorizedStores(userId: string, tenantId: string): Promise<Store[]>

  createSession(sid: string, record: SessionRecord): Promise<void>
  getSession(sid: string, tenantId: string, userId: string): Promise<SessionRecord | null>
  /** 滑动续期；超过绝对上限（maxLifetimeSeconds）时返回 null。 */
  refreshSession(
    sid: string,
    tenantId: string,
    userId: string,
    expiresAtMs: number,
    maxLifetimeSeconds: number,
  ): Promise<SessionRecord | null>
  revokeSession(sid: string, tenantId: string, userId: string): Promise<void>
  cleanupExpiredSessions(nowMs: number): Promise<void>

  /** 追加一条认证审计记录；审计写入失败不应中断主流程（调用方自行兜底）。 */
  recordAuthAudit(event: AuthAuditEvent, entry: AuthAuditInput): Promise<void>
  /** 按租户查询审计记录（倒序，limit 1-200）。 */
  listAuthAudit(tenantId: string, limit: number): Promise<AuthAuditEntry[]>
  /** 撤销目标用户在租户内的全部有效会话；操作者必须为 manager/admin，返回撤销数量。 */
  revokeUserSessions(tenantId: string, userId: string, actorId: string): Promise<number>

  listRooms(ctx: StoreContext): Promise<Room[]>
  getRoom(ctx: StoreContext, roomId: string): Promise<Room | null>
  startRoom(ctx: StoreContext, roomId: string, startedAt: Date): Promise<StartRoomResult>
  checkoutRoom(
    ctx: StoreContext,
    roomId: string,
    idempotencyKey: string | undefined,
    endedAt: Date,
    paymentMethod: PaymentMethod,
  ): Promise<CheckoutRoomResult>
  cleanRoom(ctx: StoreContext, roomId: string): Promise<Room>
  updateRoomStatus(ctx: StoreContext, roomId: string, status: RoomStatus): Promise<Room>

  /** 门店价目表（仅 active 商品） */
  listProducts(ctx: StoreContext): Promise<PosProduct[]>
  /** 新增门店商品（第一写入方）；与 master.product.created 事件同事务落库 */
  createProduct(ctx: StoreContext, input: CreateProductInput): Promise<PosProduct>
  /** 更新门店商品（字段级变更）；与 master.product.updated 事件同事务落库 */
  updateProduct(
    ctx: StoreContext,
    productId: string,
    patch: UpdateProductInput,
    eventExtra?: Record<string, unknown>,
  ): Promise<PosProduct>
  /** 封存商品（record.archive 命令；status 置 inactive）；同事务发 master.product.deleted */
  archiveProduct(ctx: StoreContext, productId: string, operatorId: string): Promise<{ version: number }>
  /** 应用门店设置（App 写；settings.update 命令与本地编辑共用）；同事务发 master.settings.updated */
  applySettings(
    ctx: StoreContext,
    config: Record<string, unknown>,
    operatorId: string,
  ): Promise<{ version: number }>
  /** 应用设备登记/变更（device.update 命令）；同事务发 master.device.updated */
  applyDevice(
    ctx: StoreContext,
    input: { deviceId: string; deviceType: "cashier" | "printer"; name: string; config: Record<string, unknown>; status: "active" | "inactive" | "offline" },
    operatorId: string,
  ): Promise<{ version: number }>
  /** 进行中房间账单（房费按 asOf 实时估算，商品按明细累计）；无进行中订单返回 null */
  getRoomBill(ctx: StoreContext, roomId: string, asOf: Date): Promise<RoomBill | null>
  /** 点单：校验商品/库存，快照单价，扣减库存；返回最新账单 */
  addOrderItem(
    ctx: StoreContext,
    roomId: string,
    input: AddOrderItemInput,
    at: Date,
  ): Promise<RoomBill>
  /** 退单：删除明细并回补库存；返回最新账单 */
  removeOrderItem(ctx: StoreContext, roomId: string, itemId: string, at: Date): Promise<RoomBill>

  close(): Promise<void>
}
