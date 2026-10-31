import type { Room, RoomStatus, Store, Tenant } from "../lib/types"
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

export interface CheckoutRoomResult {
  room: Room
  orderId: string
  totalCents: number
  billableHours: number
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
  ): Promise<CheckoutRoomResult>
  cleanRoom(ctx: StoreContext, roomId: string): Promise<Room>
  updateRoomStatus(ctx: StoreContext, roomId: string, status: RoomStatus): Promise<Room>

  close(): Promise<void>
}
