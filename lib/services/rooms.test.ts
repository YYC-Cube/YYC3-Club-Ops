import { beforeEach, describe, expect, it, vi } from "vitest"
import { createPreviewRooms, STORE_FLAGSHIP_ID, STORE_RIVER_ID } from "@/lib/mocks/preview-session"

const mocks = vi.hoisted(() => ({
  getRooms: vi.fn(),
  startRoom: vi.fn(),
  checkoutRoom: vi.fn(),
  cleanRoom: vi.fn(),
  updateRoomStatus: vi.fn(),
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
    apiClient: {
      getRooms: mocks.getRooms,
      startRoom: mocks.startRoom,
      checkoutRoom: mocks.checkoutRoom,
      cleanRoom: mocks.cleanRoom,
      updateRoomStatus: mocks.updateRoomStatus,
    },
    ApiError,
  }
})

import { ApiError } from "@/lib/api/client"
import {
  checkoutRoomForStore,
  cleanRoomForStore,
  listRooms,
  startRoomForStore,
  updateRoomStatusForStore,
} from "@/lib/services/rooms"
import { RoomStatus } from "@/lib/types"

beforeEach(() => {
  mocks.getRooms.mockReset()
  mocks.startRoom.mockReset()
  mocks.checkoutRoom.mockReset()
  mocks.cleanRoom.mockReset()
  mocks.updateRoomStatus.mockReset()
})

describe("rooms-service/listRooms", () => {
  it("返回当前门店包厢", async () => {
    mocks.getRooms.mockResolvedValue({ success: true, data: createPreviewRooms(STORE_FLAGSHIP_ID) })
    const rooms = await listRooms(STORE_FLAGSHIP_ID)
    expect(rooms).toHaveLength(4)
    expect(rooms.every((room) => room.storeId === STORE_FLAGSHIP_ID)).toBe(true)
  })

  it("拒绝跨门店数据", async () => {
    mocks.getRooms.mockResolvedValue({ success: true, data: createPreviewRooms(STORE_RIVER_ID) })
    await expect(listRooms(STORE_FLAGSHIP_ID)).rejects.toThrow("跨门店")
  })

  it("响应不是数组时抛出 ApiError", async () => {
    mocks.getRooms.mockResolvedValue({ success: true, data: null })
    await expect(listRooms(STORE_FLAGSHIP_ID)).rejects.toThrow("响应格式不正确")
    await expect(listRooms(STORE_FLAGSHIP_ID)).rejects.toBeInstanceOf(ApiError)
  })

  it("缺少门店上下文时直接拒绝", async () => {
    await expect(listRooms("  ")).rejects.toThrow("缺少门店上下文")
    expect(mocks.getRooms).not.toHaveBeenCalled()
  })
})

describe("rooms-service/开房与结账", () => {
  it("开房返回服务端包厢并校验门店归属", async () => {
    const room = { ...createPreviewRooms(STORE_FLAGSHIP_ID)[0], status: RoomStatus.OCCUPIED }
    mocks.startRoom.mockResolvedValue({ success: true, data: { room, orderId: "order-1" } })

    const result = await startRoomForStore(STORE_FLAGSHIP_ID, room.id)
    expect(result.room.status).toBe(RoomStatus.OCCUPIED)
    expect(result.orderId).toBe("order-1")
  })

  it("开房返回跨店包厢时拒绝", async () => {
    const foreign = { ...createPreviewRooms(STORE_RIVER_ID)[0], status: RoomStatus.OCCUPIED }
    mocks.startRoom.mockResolvedValue({ success: true, data: { room: foreign, orderId: "order-x" } })
    await expect(startRoomForStore(STORE_FLAGSHIP_ID, foreign.id)).rejects.toThrow("跨门店")
  })

  it("结账返回计费结果并透传幂等键", async () => {
    const room = { ...createPreviewRooms(STORE_FLAGSHIP_ID)[1], status: RoomStatus.CLEANING }
    mocks.checkoutRoom.mockResolvedValue({
      success: true,
      data: { room, orderId: "order-2", totalCents: 116000, billableHours: 2 },
    })

    const result = await checkoutRoomForStore(STORE_FLAGSHIP_ID, room.id, "key-1")
    expect(result.totalCents).toBe(116000)
    expect(result.billableHours).toBe(2)
    expect(mocks.checkoutRoom).toHaveBeenCalledWith(STORE_FLAGSHIP_ID, room.id, "key-1")
  })

  it("清台与状态更新返回包厢", async () => {
    const room = { ...createPreviewRooms(STORE_FLAGSHIP_ID)[0] }
    mocks.cleanRoom.mockResolvedValue({ success: true, data: room })
    mocks.updateRoomStatus.mockResolvedValue({
      success: true,
      data: { ...room, status: RoomStatus.MAINTENANCE },
    })

    expect((await cleanRoomForStore(STORE_FLAGSHIP_ID, room.id)).storeId).toBe(STORE_FLAGSHIP_ID)
    expect(
      (await updateRoomStatusForStore(STORE_FLAGSHIP_ID, room.id, RoomStatus.MAINTENANCE)).status,
    ).toBe(RoomStatus.MAINTENANCE)
  })

  it("接口未返回包厢时抛出 ApiError", async () => {
    mocks.startRoom.mockResolvedValue({ success: true, data: null })
    await expect(startRoomForStore(STORE_FLAGSHIP_ID, "room-x")).rejects.toThrow("未返回包厢")
    await expect(startRoomForStore(STORE_FLAGSHIP_ID, "room-x")).rejects.toBeInstanceOf(ApiError)
  })
})
