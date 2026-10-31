/**
 * 多店 SaaS API 路径契约。
 * OpenAPI 文件：contracts/openapi.yaml；本文件是前端唯一路径事实源。
 * 门店作用域放在路径中，服务端必须再次校验会话对 storeId 的访问权。
 */

export const API_PATHS = {
  session: "/auth/session",
  login: "/auth/login",
  logout: "/auth/logout",
  refresh: "/auth/refresh",
  adminAuthAudit: "/admin/auth-audit",
  adminUserForceLogout: "/admin/users/{userId}/force-logout",
  stores: "/stores",
  storeRooms: "/stores/{storeId}/rooms",
  storeRoom: "/stores/{storeId}/rooms/{roomId}",
  roomStatus: "/stores/{storeId}/rooms/{roomId}/status",
  startRoom: "/stores/{storeId}/rooms/{roomId}/start",
  checkoutRoom: "/stores/{storeId}/rooms/{roomId}/checkout",
  cleanRoom: "/stores/{storeId}/rooms/{roomId}/clean",
  health: "/health",
} as const

export type ApiPathTemplate = (typeof API_PATHS)[keyof typeof API_PATHS]

function encodeSegment(value: string, name: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${name} 不能为空`)
  }
  return encodeURIComponent(trimmed)
}

export const apiRoutes = {
  session: () => API_PATHS.session,
  login: () => API_PATHS.login,
  logout: () => API_PATHS.logout,
  refresh: () => API_PATHS.refresh,
  stores: () => API_PATHS.stores,
  rooms: (storeId: string) => `/stores/${encodeSegment(storeId, "storeId")}/rooms`,
  room: (storeId: string, roomId: string) =>
    `/stores/${encodeSegment(storeId, "storeId")}/rooms/${encodeSegment(roomId, "roomId")}`,
  roomStatus: (storeId: string, roomId: string) =>
    `/stores/${encodeSegment(storeId, "storeId")}/rooms/${encodeSegment(roomId, "roomId")}/status`,
  startRoom: (storeId: string, roomId: string) =>
    `/stores/${encodeSegment(storeId, "storeId")}/rooms/${encodeSegment(roomId, "roomId")}/start`,
  checkoutRoom: (storeId: string, roomId: string) =>
    `/stores/${encodeSegment(storeId, "storeId")}/rooms/${encodeSegment(roomId, "roomId")}/checkout`,
  cleanRoom: (storeId: string, roomId: string) =>
    `/stores/${encodeSegment(storeId, "storeId")}/rooms/${encodeSegment(roomId, "roomId")}/clean`,
  authAudit: (limit?: number) =>
    limit === undefined ? API_PATHS.adminAuthAudit : `${API_PATHS.adminAuthAudit}?limit=${limit}`,
  forceLogout: (userId: string) =>
    `/admin/users/${encodeSegment(userId, "userId")}/force-logout`,
  health: () => API_PATHS.health,
}
