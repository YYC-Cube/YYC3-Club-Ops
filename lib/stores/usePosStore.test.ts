import { beforeEach, describe, expect, it } from "vitest"
import { usePosStore, type PosDeps } from "@/lib/stores/usePosStore"
import { createSeedProducts } from "@/server/repositories/memory"
import { STORE_FLAGSHIP_ID } from "@/lib/mocks/preview-session"
import type { CheckoutReceipt, RoomBill } from "@/lib/types"
import { RoomStatus, RoomType } from "@/lib/types"

const STORE = STORE_FLAGSHIP_ID
const ROOM = "room-fs-vip-01"

const baseBill = (overrides: Partial<RoomBill> = {}): RoomBill => ({
  roomId: ROOM,
  orderId: "order-1",
  orderNo: "RO1750000000000",
  startedAt: "2026-10-31T02:00:00.000Z",
  billableHours: 1,
  roomCents: 58000,
  itemsCents: 0,
  totalCents: 58000,
  items: [],
  ...overrides,
})

const receipt = (overrides: Partial<CheckoutReceipt> = {}): CheckoutReceipt => ({
  ...baseBill({ itemsCents: 1800, totalCents: 59800 }),
  room: {
    id: ROOM,
    name: "VIP-01",
    type: RoomType.VIP,
    status: RoomStatus.CLEANING,
    storeId: STORE,
    priceCents: 58000,
  },
  paymentMethod: "wechat",
  paidAt: "2026-10-31T03:16:00.000Z",
  ...overrides,
})

function deps(overrides: Partial<PosDeps> = {}): PosDeps {
  return {
    listProducts: async () => createSeedProducts(STORE),
    getBill: async () => baseBill(),
    addItem: async () => baseBill({ itemsCents: 1800, totalCents: 59800 }),
    removeItem: async () => baseBill(),
    checkout: async () => receipt(),
    ...overrides,
  }
}

beforeEach(() => {
  usePosStore.getState().reset()
})

describe("usePosStore", () => {
  it("加载价目表与账单", async () => {
    await usePosStore.getState().load(STORE, ROOM, deps())
    const state = usePosStore.getState()
    expect(state.products).toHaveLength(6)
    expect(state.bill?.totalCents).toBe(58000)
    expect(state.error).toBeNull()
  })

  it("点单与退单更新账单，失败写入 error", async () => {
    await usePosStore.getState().load(STORE, ROOM, deps())
    await usePosStore.getState().addProduct("prod-1", 1, deps())
    expect(usePosStore.getState().bill?.itemsCents).toBe(1800)

    await usePosStore.getState().removeLine("item-1", deps())
    expect(usePosStore.getState().bill?.itemsCents).toBe(0)

    await expect(
      usePosStore.getState().addProduct("prod-1", 1, deps({
        addItem: async () => {
          throw new Error("库存不足：矿泉水 剩余 0")
        },
      })),
    ).rejects.toThrow("库存不足")
    expect(usePosStore.getState().error).toBe("库存不足：矿泉水 剩余 0")
  })

  it("未选择包厢时点单直接拒绝", async () => {
    await usePosStore.getState().addProduct("prod-1", 1, deps())
    expect(usePosStore.getState().error).toBe("未选择包厢，无法点单")
  })

  it("结账写入小票并清空账单", async () => {
    await usePosStore.getState().load(STORE, ROOM, deps())
    const result = await usePosStore.getState().settle("wechat", deps())
    expect(result.paymentMethod).toBe("wechat")
    expect(usePosStore.getState().receipt?.totalCents).toBe(59800)
    expect(usePosStore.getState().bill).toBeNull()

    usePosStore.getState().clearReceipt()
    expect(usePosStore.getState().receipt).toBeNull()
  })

  it("结账失败时保留账单并记录错误", async () => {
    await usePosStore.getState().load(STORE, ROOM, deps())
    await expect(
      usePosStore.getState().settle("cash", deps({
        checkout: async () => {
          throw new Error("包厢当前状态为 cleaning，不能结账")
        },
      })),
    ).rejects.toThrow("不能结账")
    expect(usePosStore.getState().error).toBe("包厢当前状态为 cleaning，不能结账")
    expect(usePosStore.getState().bill).not.toBeNull()
  })
})
