import { apiClient, ApiError } from "@/lib/api/client"
import { StoreScopeError, assertEntityStore } from "@/lib/services/store-scope"
import type { CheckoutReceipt, PaymentMethod, PosProduct, RoomBill } from "@/lib/types"

/**
 * POS 服务层：门店作用域 + 跨店防御。
 * 契约：所有路径显式携带 storeId；返回实体若带 storeId 必须与入参一致。
 */

function assertBillStore(storeId: string, bill: RoomBill | undefined): RoomBill {
  if (!bill) {
    throw new ApiError("接口未返回账单数据", 0, "invalid_response")
  }
  return bill
}

export async function listPosProducts(storeId: string): Promise<PosProduct[]> {
  if (!storeId.trim()) {
    throw new StoreScopeError("缺少门店上下文", "no_store")
  }
  const response = await apiClient.getProductsForStore(storeId)
  if (!Array.isArray(response.data)) {
    throw new ApiError("价目表响应格式不正确", 0, "invalid_response")
  }
  for (const product of response.data) {
    assertEntityStore(storeId, product.storeId)
  }
  return response.data
}

export async function getRoomBill(storeId: string, roomId: string): Promise<RoomBill> {
  const response = await apiClient.getRoomBill(storeId, roomId)
  const bill = assertBillStore(storeId, response.data)
  if (bill.roomId !== roomId) {
    throw new ApiError("账单与当前包厢不匹配", 0, "invalid_response")
  }
  return bill
}

export async function addItem(
  storeId: string,
  roomId: string,
  productId: string,
  quantity = 1,
): Promise<RoomBill> {
  const response = await apiClient.addRoomItem(storeId, roomId, productId, quantity)
  return assertBillStore(storeId, response.data)
}

export async function removeItem(
  storeId: string,
  roomId: string,
  itemId: string,
): Promise<RoomBill> {
  const response = await apiClient.removeRoomItem(storeId, roomId, itemId)
  return assertBillStore(storeId, response.data)
}

/** 结账：默认生成幂等键，重复点击不会产生双重计费。 */
export async function checkout(
  storeId: string,
  roomId: string,
  paymentMethod: PaymentMethod,
  idempotencyKey?: string,
): Promise<CheckoutReceipt> {
  const key = idempotencyKey ?? `${storeId}:${roomId}:${crypto.randomUUID()}`
  const response = await apiClient.checkoutRoom(storeId, roomId, key, paymentMethod)
  if (!response.data) {
    throw new ApiError("接口未返回结账小票", 0, "invalid_response")
  }
  assertEntityStore(storeId, response.data.room.storeId)
  return response.data
}
