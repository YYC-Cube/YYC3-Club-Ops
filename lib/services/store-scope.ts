import type { Session, Store } from "../types"

export type StoreScopeErrorCode = "no_store" | "forbidden_store" | "invalid_session"

export class StoreScopeError extends Error {
  constructor(
    message: string,
    public readonly code: StoreScopeErrorCode = "forbidden_store",
  ) {
    super(message)
    this.name = "StoreScopeError"
  }
}

/** 会话中允许访问的门店列表是唯一授权来源。 */
export function isStoreAllowed(session: Session, storeId: string): boolean {
  return session.stores.some((store) => store.id === storeId && store.tenantId === session.tenant.id)
}

/**
 * 解析当前门店：
 * - 未指定时优先会话 currentStoreId，其次第一个授权门店；
 * - 指定但无权访问时拒绝，不做“静默回退”。
 */
export function resolveCurrentStore(session: Session, requestedStoreId?: string): Store {
  if (session.stores.length === 0) {
    throw new StoreScopeError("当前账号未绑定任何门店", "no_store")
  }

  const targetId = requestedStoreId ?? session.currentStoreId
  const store = session.stores.find(
    (item) => item.id === targetId && item.tenantId === session.tenant.id,
  )

  if (!store) {
    throw new StoreScopeError(`无权访问门店：${targetId}`, "forbidden_store")
  }

  return store
}

export function assertStoreAccess(session: Session, storeId: string): void {
  if (!isStoreAllowed(session, storeId)) {
    throw new StoreScopeError(`无权访问门店：${storeId}`, "forbidden_store")
  }
}

/** 防御性校验：实体返回的门店必须与请求作用域一致。 */
export function assertEntityStore(storeId: string, entityStoreId: string): void {
  if (storeId !== entityStoreId) {
    throw new StoreScopeError("检测到跨门店数据，已拒绝使用", "forbidden_store")
  }
}
