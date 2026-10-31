import { apiClient, ApiError } from "@/lib/api/client"
import type { CheckoutReceipt, PaymentMethod, Room, RoomStatus } from "@/lib/types"
import { StoreScopeError, assertEntityStore } from "@/lib/services/store-scope"

function assertRoomResult(storeId: string, room: Room | undefined): Room {
  if (!room) {
    throw new ApiError("接口未返回包厢数据", 0, "invalid_response")
  }
  assertEntityStore(storeId, room.storeId)
  return room
}

/**
 * 门店包厢查询。
 * 契约要求：服务端按 storeId 返回数据；前端再做一次跨店防御校验。
 */
export async function listRooms(storeId: string): Promise<Room[]> {
  if (!storeId.trim()) {
    throw new StoreScopeError("缺少门店上下文", "no_store")
  }

  const response = await apiClient.getRooms(storeId)
  if (!Array.isArray(response.data)) {
    throw new ApiError("包厢列表响应格式不正确", 0, "invalid_response")
  }

  for (const room of response.data) {
    assertEntityStore(storeId, room.storeId)
  }

  return response.data
}

export async function startRoomForStore(
  storeId: string,
  roomId: string,
): Promise<{ room: Room; orderId: string }> {
  const response = await apiClient.startRoom(storeId, roomId)
  const room = assertRoomResult(storeId, response.data?.room)
  return { room, orderId: response.data?.orderId ?? "" }
}

export async function checkoutRoomForStore(
  storeId: string,
  roomId: string,
  idempotencyKey?: string,
  paymentMethod: PaymentMethod = "cash",
): Promise<CheckoutReceipt> {
  const key = idempotencyKey ?? `${storeId}:${roomId}:${crypto.randomUUID()}`
  const response = await apiClient.checkoutRoom(storeId, roomId, key, paymentMethod)
  const room = assertRoomResult(storeId, response.data?.room)
  const receipt = response.data
  if (!receipt) {
    throw new ApiError("接口未返回结账小票", 0, "invalid_response")
  }
  return { ...receipt, room }
}

export async function cleanRoomForStore(storeId: string, roomId: string): Promise<Room> {
  const response = await apiClient.cleanRoom(storeId, roomId)
  return assertRoomResult(storeId, response.data)
}

export async function updateRoomStatusForStore(
  storeId: string,
  roomId: string,
  status: RoomStatus,
): Promise<Room> {
  const response = await apiClient.updateRoomStatus(storeId, roomId, status)
  return assertRoomResult(storeId, response.data)
}
