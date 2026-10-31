import { PREVIEW_USER, STORE_FLAGSHIP_ID } from "../lib/mocks/preview-session"
import {
  Permission,
  UserRole,
  type Session,
  type Store,
  type Tenant,
  type User,
} from "../lib/types"
import { createPasswordDigest } from "./security"

export interface ServerUser extends User {
  passwordSalt: string
  passwordHash: string
}

export interface SessionRecord {
  userId: string
  tenantId: string
  currentStoreId: string
  expiresAt: number
  /** 会话绑定的 CSRF 同步令牌 */
  csrfToken: string
}

export class ApiException extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message)
    this.name = "ApiException"
  }
}

export function createSeedUsers(password: string): ServerUser[] {
  const managerDigest = createPasswordDigest(password)
  const cashierDigest = createPasswordDigest(password)

  const manager: ServerUser = {
    ...PREVIEW_USER,
    passwordSalt: managerDigest.salt,
    passwordHash: managerDigest.hash,
  }

  const cashier: ServerUser = {
    ...PREVIEW_USER,
    id: "user-demo-cashier",
    name: "演示收银员",
    phone: "13900139000",
    role: UserRole.CASHIER,
    storeIds: [STORE_FLAGSHIP_ID],
    permissions: [
      Permission.VIEW_ORDERS,
      Permission.CREATE_ORDERS,
      Permission.EDIT_ORDERS,
      Permission.VIEW_PRODUCTS,
      Permission.VIEW_MEMBERS,
    ],
    passwordSalt: cashierDigest.salt,
    passwordHash: cashierDigest.hash,
  }

  return [manager, cashier]
}

export function sanitizeUser(user: ServerUser): User {
  const { passwordSalt: _salt, passwordHash: _hash, ...safe } = user
  return safe
}

export function buildSession(
  user: ServerUser,
  tenant: Tenant,
  stores: Store[],
  currentStoreId: string,
  expiresAtMs: number,
  csrfToken: string,
): Session {
  if (stores.length === 0) {
    throw new ApiException("当前账号未绑定任何门店", 403, "no_store")
  }

  const current = stores.find((store) => store.id === currentStoreId)
  if (!current) {
    throw new ApiException(`无权访问门店：${currentStoreId}`, 403, "forbidden_store")
  }

  return {
    user: sanitizeUser(user),
    tenant,
    stores,
    currentStoreId: current.id,
    expiresAt: new Date(expiresAtMs).toISOString(),
    csrfToken,
  }
}

export function assertSessionStore(session: Session, storeId: string): void {
  if (!session.stores.some((store) => store.id === storeId)) {
    throw new ApiException(`无权访问门店：${storeId}`, 403, "forbidden_store")
  }
}

export function roomNotFound(roomId: string): ApiException {
  return new ApiException(`包厢不存在：${roomId}`, 404, "not_found")
}

export function stateConflict(message: string): ApiException {
  return new ApiException(message, 409, "room_state_conflict")
}
