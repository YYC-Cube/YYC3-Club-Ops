import { beforeEach, describe, expect, it, vi } from "vitest"
import { createSeedProducts } from "@/server/repositories/memory"
import { STORE_FLAGSHIP_ID, STORE_RIVER_ID } from "@/lib/mocks/preview-session"
import type { RoomBill } from "@/lib/types"

const mocks = vi.hoisted(() => ({
  getProductsForStore: vi.fn(),
  getRoomBill: vi.fn(),
  addRoomItem: vi.fn(),
  removeRoomItem: vi.fn(),
  checkoutRoom: vi.fn(),
}))

vi.mock("@/lib/api/client", () => {
  class ApiError extends Error {
    constructor(
      message: string,
      public readonly status = 0,
      public readonly code = "api_error",
    ) {
      super(message)
      this.name = "ApiError"
    }
  }
  return {
    apiClient: mocks,
    ApiError,
  }
})

import { ApiError } from "@/lib/api/client"
import { addItem, checkout, getRoomBill, listPosProducts, removeItem } from "@/lib/services/pos"

const bill = (overrides: Partial<RoomBill> = {}): RoomBill => ({
  roomId: "room-fs-vip-01",
  orderId: "order-1",
  orderNo: "RO1750000000000",
  startedAt: "2026-10-31T02:00:00.000Z",
  billableHours: 1,
  roomCents: 58000,
  itemsCents: 1800,
  totalCents: 59800,
  items: [],
  ...overrides,
})

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
})

describe("pos-service/价目表", () => {
  it("返回门店商品并校验门店归属", async () => {
    mocks.getProductsForStore.mockResolvedValue({
      success: true,
      data: createSeedProducts(STORE_FLAGSHIP_ID),
    })
    const products = await listPosProducts(STORE_FLAGSHIP_ID)
    expect(products).toHaveLength(6)
    expect(products.every((item) => item.storeId === STORE_FLAGSHIP_ID)).toBe(true)
  })

  it("拒绝跨门店商品数据", async () => {
    mocks.getProductsForStore.mockResolvedValue({
      success: true,
      data: createSeedProducts(STORE_RIVER_ID),
    })
    await expect(listPosProducts(STORE_FLAGSHIP_ID)).rejects.toThrow("跨门店")
  })

  it("缺少门店上下文与非法响应分别被拒绝", async () => {
    await expect(listPosProducts(" ")).rejects.toThrow("缺少门店上下文")
    mocks.getProductsForStore.mockResolvedValue({ success: true, data: null })
    await expect(listPosProducts(STORE_FLAGSHIP_ID)).rejects.toBeInstanceOf(ApiError)
  })
})

describe("pos-service/账单与点单", () => {
  it("账单与包厢不匹配时拒绝", async () => {
    mocks.getRoomBill.mockResolvedValue({ success: true, data: bill({ roomId: "room-other" }) })
    await expect(getRoomBill(STORE_FLAGSHIP_ID, "room-fs-vip-01")).rejects.toThrow("不匹配")
  })

  it("点单与退单返回最新账单", async () => {
    mocks.addRoomItem.mockResolvedValue({ success: true, data: bill({ itemsCents: 3600 }) })
    mocks.removeRoomItem.mockResolvedValue({ success: true, data: bill({ itemsCents: 0 }) })

    const afterAdd = await addItem(STORE_FLAGSHIP_ID, "room-fs-vip-01", "prod-1", 2)
    expect(afterAdd.itemsCents).toBe(3600)
    expect(mocks.addRoomItem).toHaveBeenCalledWith(STORE_FLAGSHIP_ID, "room-fs-vip-01", "prod-1", 2)

    const afterRemove = await removeItem(STORE_FLAGSHIP_ID, "room-fs-vip-01", "item-1")
    expect(afterRemove.itemsCents).toBe(0)
  })

  it("接口未返回账单时抛出 ApiError", async () => {
    mocks.addRoomItem.mockResolvedValue({ success: true, data: null })
    await expect(addItem(STORE_FLAGSHIP_ID, "room-fs-vip-01", "prod-1", 1)).rejects.toBeInstanceOf(
      ApiError,
    )
  })
})

describe("pos-service/结账", () => {
  it("自动生成幂等键并校验门店归属", async () => {
    mocks.checkoutRoom.mockResolvedValue({
      success: true,
      data: {
        ...bill({ itemsCents: 3600, totalCents: 61600 }),
        room: {
          id: "room-fs-vip-01",
          name: "VIP-01",
          type: "vip",
          status: "cleaning",
          storeId: STORE_FLAGSHIP_ID,
          priceCents: 58000,
        },
        paymentMethod: "wechat",
        paidAt: "2026-10-31T03:16:00.000Z",
      },
    })

    const receipt = await checkout(STORE_FLAGSHIP_ID, "room-fs-vip-01", "wechat")
    expect(receipt.paymentMethod).toBe("wechat")
    expect(receipt.totalCents).toBe(61600)
    expect(mocks.checkoutRoom).toHaveBeenCalledTimes(1)
    const [storeArg, roomArg, keyArg, methodArg] = mocks.checkoutRoom.mock.calls[0]
    expect(storeArg).toBe(STORE_FLAGSHIP_ID)
    expect(roomArg).toBe("room-fs-vip-01")
    expect(keyArg).toContain(`${STORE_FLAGSHIP_ID}:room-fs-vip-01`)
    expect(methodArg).toBe("wechat")
  })

  it("跨店小票被拒绝", async () => {
    mocks.checkoutRoom.mockResolvedValue({
      success: true,
      data: {
        ...bill(),
        room: {
          id: "room-rv-01",
          name: "滨江-01",
          type: "medium",
          status: "cleaning",
          storeId: STORE_RIVER_ID,
          priceCents: 38000,
        },
        paymentMethod: "cash",
        paidAt: "2026-10-31T03:16:00.000Z",
      },
    })
    await expect(checkout(STORE_FLAGSHIP_ID, "room-fs-vip-01", "cash", "key-1")).rejects.toThrow(
      "跨门店",
    )
  })
})
