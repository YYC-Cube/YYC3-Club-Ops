import { apiClient, ApiError } from "@/lib/api/client"
import type { Session } from "@/lib/types"
import { StoreScopeError } from "@/lib/services/store-scope"

/**
 * 会话服务：门店上下文唯一入口。
 * 真实模式必须由服务端返回带 storeIds 的 Session；预览模式由显式 Mock 提供。
 */
export async function getSession(): Promise<Session> {
  const response = await apiClient.getSession()
  if (!response.data) {
    throw new ApiError("会话数据为空", 0, "invalid_session")
  }

  return assertValidSession(response.data)
}

/** 滑动续期：服务端更新过期时间并下发新 Cookie/CSRF 上下文。 */
export async function refreshSession(): Promise<Session> {
  const response = await apiClient.refreshSession()
  if (!response.data) {
    throw new ApiError("会话刷新失败", 0, "invalid_session")
  }

  return assertValidSession(response.data)
}

export function assertValidSession(session: Session): Session {
  if (!session.user?.id || !session.tenant?.id) {
    throw new StoreScopeError("会话缺少用户或租户信息", "invalid_session")
  }
  if (!Array.isArray(session.stores) || session.stores.length === 0) {
    throw new StoreScopeError("当前账号未绑定任何门店", "no_store")
  }
  if (!session.stores.some((store) => store.id === session.currentStoreId)) {
    throw new StoreScopeError("会话当前门店不在授权列表中", "forbidden_store")
  }
  if (session.stores.some((store) => store.tenantId !== session.tenant.id)) {
    throw new StoreScopeError("会话包含跨租户门店", "invalid_session")
  }
  return session
}
