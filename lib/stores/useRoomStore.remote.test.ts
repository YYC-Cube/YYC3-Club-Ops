import { beforeEach, describe, expect, it, vi } from "vitest"
import { STORE_FLAGSHIP_ID } from "@/lib/mocks/preview-session"
import { RoomStatus } from "@/lib/types"
import { useRoomStore } from "@/lib/stores/useRoomStore"

vi.mock("@/lib/config/runtime", () => ({
  runtimeConfig: { useMock: false, apiBaseUrl: "http://localhost:3031/api" },
}))

vi.mock("@/lib/services/rooms", async () => {
  const { createPreviewRooms } = await import("@/lib/mocks/preview-session")
  const find = (storeId: string, roomId: string) => {
    const room = createPreviewRooms(storeId).find((item) => item.id === roomId)
    if (!room) throw new Error(`missing room: ${roomId}`)
    return room
  }

  return {
    listRooms: vi.fn(async (storeId: string) => createPreviewRooms(storeId)),
    startRoomForStore: vi.fn(async (storeId: string, roomId: string) => ({
      room: { ...find(storeId, roomId), status: "occupied" },
      orderId: "order-start",
    })),
    checkoutRoomForStore: vi.fn(async (storeId: string, roomId: string) => ({
      room: { ...find(storeId, roomId), status: "cleaning" },
      orderId: "order-checkout",
      totalCents: 58000,
      billableHours: 1,
    })),
    cleanRoomForStore: vi.fn(async (storeId: string, roomId: string) => ({
      ...find(storeId, roomId),
      status: "available",
    })),
    updateRoomStatusForStore: vi.fn(async (storeId: string, roomId: string, status: string) => ({
      ...find(storeId, roomId),
      status,
    })),
  }
})

beforeEach(() => {
  useRoomStore.getState().reset()
})

describe("useRoomStore/真实 API 模式", () => {
  it("通过服务层加载并替换服务端返回的房间", async () => {
    await useRoomStore.getState().fetchRooms(STORE_FLAGSHIP_ID)
    expect(useRoomStore.getState().rooms).toHaveLength(4)

    await useRoomStore.getState().startRoom("room-fs-vip-01")
    expect(useRoomStore.getState().rooms.find((room) => room.id === "room-fs-vip-01")?.status).toBe(
      RoomStatus.OCCUPIED,
    )
  })

  it("结账使用服务端返回的待清洁状态", async () => {
    await useRoomStore.getState().fetchRooms(STORE_FLAGSHIP_ID)
    await useRoomStore.getState().checkoutRoom("room-fs-vip-02")
    expect(useRoomStore.getState().rooms.find((room) => room.id === "room-fs-vip-02")?.status).toBe(
      RoomStatus.CLEANING,
    )
  })

  it("维修/恢复通过状态接口更新", async () => {
    await useRoomStore.getState().fetchRooms(STORE_FLAGSHIP_ID)
    await useRoomStore.getState().setMaintenance("room-fs-std-01")
    expect(useRoomStore.getState().rooms.find((room) => room.id === "room-fs-std-01")?.status).toBe(
      RoomStatus.MAINTENANCE,
    )

    await useRoomStore.getState().resumeRoom("room-fs-std-01")
    expect(useRoomStore.getState().rooms.find((room) => room.id === "room-fs-std-01")?.status).toBe(
      RoomStatus.AVAILABLE,
    )
  })
})
