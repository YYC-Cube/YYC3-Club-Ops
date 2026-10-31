import { beforeEach, describe, expect, it, vi } from "vitest"
import { RoomStatus } from "@/lib/types"
import { createPreviewRooms, STORE_FLAGSHIP_ID, STORE_RIVER_ID } from "@/lib/mocks/preview-session"
import { canTransitionRoom, useRoomStore } from "@/lib/stores/useRoomStore"

vi.mock("@/lib/services/rooms", async () => {
  const { createPreviewRooms } = await import("@/lib/mocks/preview-session")
  return {
    listRooms: vi.fn(async (storeId: string) => createPreviewRooms(storeId)),
    startRoomForStore: vi.fn(),
    checkoutRoomForStore: vi.fn(),
    cleanRoomForStore: vi.fn(),
    updateRoomStatusForStore: vi.fn(),
  }
})

const flagshipId = "room-fs-vip-01"
const flagshipOccupiedId = "room-fs-vip-02"
const riverAvailableId = "room-rv-02"

beforeEach(() => {
  useRoomStore.getState().reset()
})

describe("useRoomStore/fetchRooms（门店作用域）", () => {
  it("加载旗舰店包厢，全部属于当前门店", async () => {
    await useRoomStore.getState().fetchRooms(STORE_FLAGSHIP_ID)
    const state = useRoomStore.getState()
    expect(state.rooms).toHaveLength(4)
    expect(state.rooms.every((room) => room.storeId === STORE_FLAGSHIP_ID)).toBe(true)
    expect(state.rooms.some((room) => room.name === "VIP-01")).toBe(true)
    expect(state.loading).toBe(false)
  })

  it("切换门店后只返回该门店包厢", async () => {
    await useRoomStore.getState().fetchRooms(STORE_RIVER_ID)
    const rooms = useRoomStore.getState().rooms
    expect(rooms).toHaveLength(4)
    expect(rooms.every((room) => room.storeId === STORE_RIVER_ID)).toBe(true)
    expect(rooms.some((room) => room.name === "滨江-VIP")).toBe(true)
    expect(rooms.some((room) => room.name === "VIP-01")).toBe(false)
  })

  it("加载失败时清空数据并记录错误", async () => {
    const { listRooms } = await import("@/lib/services/rooms")
    vi.mocked(listRooms).mockRejectedValueOnce(new Error("网络失败"))
    await expect(useRoomStore.getState().fetchRooms(STORE_FLAGSHIP_ID)).rejects.toThrow("网络失败")
    expect(useRoomStore.getState().rooms).toEqual([])
    expect(useRoomStore.getState().error).toContain("网络失败")
  })
})

describe("useRoomStore/状态机", () => {
  it("允许合法迁移", () => {
    expect(canTransitionRoom(RoomStatus.AVAILABLE, RoomStatus.OCCUPIED)).toBe(true)
    expect(canTransitionRoom(RoomStatus.OCCUPIED, RoomStatus.CLEANING)).toBe(true)
    expect(canTransitionRoom(RoomStatus.CLEANING, RoomStatus.AVAILABLE)).toBe(true)
    expect(canTransitionRoom(RoomStatus.MAINTENANCE, RoomStatus.AVAILABLE)).toBe(true)
  })

  it("拒绝跳步迁移", () => {
    expect(canTransitionRoom(RoomStatus.AVAILABLE, RoomStatus.CLEANING)).toBe(false)
    expect(canTransitionRoom(RoomStatus.OCCUPIED, RoomStatus.AVAILABLE)).toBe(false)
    expect(canTransitionRoom(RoomStatus.MAINTENANCE, RoomStatus.OCCUPIED)).toBe(false)
  })
})

describe("useRoomStore/开房", () => {
  it("空闲包厢开房后变为消费中", async () => {
    await useRoomStore.getState().fetchRooms(STORE_FLAGSHIP_ID)
    await useRoomStore.getState().startRoom(flagshipId)
    expect(useRoomStore.getState().rooms.find((room) => room.id === flagshipId)?.status).toBe(
      RoomStatus.OCCUPIED,
    )
    expect(useRoomStore.getState().error).toBeNull()
  })

  it("已占用包厢重复开房被拒绝并记录错误", async () => {
    await useRoomStore.getState().fetchRooms(STORE_FLAGSHIP_ID)
    await expect(useRoomStore.getState().startRoom(flagshipOccupiedId)).rejects.toThrow("不允许")
    expect(useRoomStore.getState().error).toContain("不允许")
  })

  it("不存在的包厢开房被拒绝", async () => {
    await useRoomStore.getState().fetchRooms(STORE_FLAGSHIP_ID)
    await expect(useRoomStore.getState().startRoom("missing")).rejects.toThrow("不存在")
  })
})

describe("useRoomStore/跨店隔离", () => {
  it("拒绝操作其他门店的包厢", async () => {
    useRoomStore.setState({
      activeStoreId: STORE_FLAGSHIP_ID,
      rooms: createPreviewRooms(STORE_RIVER_ID),
      loading: false,
      error: null,
    })

    await expect(useRoomStore.getState().startRoom(riverAvailableId)).rejects.toThrow("无权操作")
    expect(useRoomStore.getState().error).toContain("无权操作")
  })

  it("没有门店上下文时拒绝写操作", async () => {
    useRoomStore.setState({ activeStoreId: null, rooms: createPreviewRooms(STORE_FLAGSHIP_ID) })
    await expect(useRoomStore.getState().startRoom(flagshipId)).rejects.toThrow("未选择门店")
  })
})

describe("useRoomStore/结账与清台", () => {
  it("结账后进入待清洁，不能直接回到空闲", async () => {
    await useRoomStore.getState().fetchRooms(STORE_FLAGSHIP_ID)
    await useRoomStore.getState().checkoutRoom(flagshipOccupiedId)
    expect(
      useRoomStore.getState().rooms.find((room) => room.id === flagshipOccupiedId)?.status,
    ).toBe(RoomStatus.CLEANING)
  })

  it("清台后恢复空闲", async () => {
    useRoomStore.setState({
      activeStoreId: STORE_FLAGSHIP_ID,
      rooms: createPreviewRooms(STORE_FLAGSHIP_ID).map((room) =>
        room.id === flagshipId ? { ...room, status: RoomStatus.CLEANING } : room,
      ),
    })
    await useRoomStore.getState().cleanRoom(flagshipId)
    expect(useRoomStore.getState().rooms.find((room) => room.id === flagshipId)?.status).toBe(
      RoomStatus.AVAILABLE,
    )
  })

  it("未结账不能清台", async () => {
    await useRoomStore.getState().fetchRooms(STORE_FLAGSHIP_ID)
    await expect(useRoomStore.getState().cleanRoom(flagshipOccupiedId)).rejects.toThrow("不允许")
  })
})

describe("useRoomStore/维修与恢复", () => {
  it("空闲包厢可转为维修，维修后可恢复", async () => {
    await useRoomStore.getState().fetchRooms(STORE_FLAGSHIP_ID)
    await useRoomStore.getState().setMaintenance(flagshipId)
    expect(useRoomStore.getState().rooms.find((room) => room.id === flagshipId)?.status).toBe(
      RoomStatus.MAINTENANCE,
    )
    await useRoomStore.getState().resumeRoom(flagshipId)
    expect(useRoomStore.getState().rooms.find((room) => room.id === flagshipId)?.status).toBe(
      RoomStatus.AVAILABLE,
    )
  })

  it("消费中包厢不能直接转为维修", async () => {
    await useRoomStore.getState().fetchRooms(STORE_FLAGSHIP_ID)
    await expect(useRoomStore.getState().setMaintenance(flagshipOccupiedId)).rejects.toThrow("不允许")
  })
})
