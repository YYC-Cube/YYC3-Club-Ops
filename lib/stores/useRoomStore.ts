import { create } from "zustand"
import { RoomStatus, type Room } from "@/lib/types"
import { runtimeConfig } from "@/lib/config/runtime"
import { canTransitionRoom } from "@/lib/domain/room-state"
import {
  checkoutRoomForStore,
  cleanRoomForStore,
  listRooms,
  startRoomForStore,
  updateRoomStatusForStore,
} from "@/lib/services/rooms"
import { StoreScopeError } from "@/lib/services/store-scope"

export { canTransitionRoom } from "@/lib/domain/room-state"

interface RoomState {
  rooms: Room[]
  /** 当前门店作用域；所有写操作必须与 room.storeId 一致 */
  activeStoreId: string | null
  loading: boolean
  error: string | null
  fetchRooms: (storeId: string) => Promise<void>
  updateRoomStatus: (id: string, status: RoomStatus) => Promise<void>
  startRoom: (id: string) => Promise<void>
  checkoutRoom: (id: string) => Promise<void>
  cleanRoom: (id: string) => Promise<void>
  setMaintenance: (id: string) => Promise<void>
  resumeRoom: (id: string) => Promise<void>
  clearError: () => void
  reset: () => void
}

type RemoteMutation = (storeId: string, roomId: string) => Promise<Room>

export const useRoomStore = create<RoomState>((set, get) => {
  const assertTransition = (id: string, next: RoomStatus): Room => {
    const activeStoreId = get().activeStoreId
    if (!activeStoreId) {
      throw new StoreScopeError("未选择门店，无法操作包厢", "no_store")
    }

    const room = get().rooms.find((item) => item.id === id)
    if (!room) {
      throw new Error(`包厢不存在：${id}`)
    }
    if (room.storeId !== activeStoreId) {
      throw new StoreScopeError("无权操作其他门店的包厢", "forbidden_store")
    }
    if (!canTransitionRoom(room.status, next)) {
      throw new Error(`包厢状态不允许从 ${room.status} 变更为 ${next}`)
    }

    return room
  }

  const applyLocal = (id: string, next: RoomStatus) => {
    set((state) => ({
      error: null,
      rooms: state.rooms.map((item) => (item.id === id ? { ...item, status: next } : item)),
    }))
  }

  const applyRemote = (updated: Room) => {
    set((state) => ({
      error: null,
      rooms: state.rooms.map((item) => (item.id === updated.id ? updated : item)),
    }))
  }

  const run = async (
    id: string,
    next: RoomStatus,
    fallbackMessage: string,
    remote?: RemoteMutation,
  ) => {
    try {
      const activeStoreId = get().activeStoreId
      assertTransition(id, next)

      if (runtimeConfig.useMock) {
        applyLocal(id, next)
        return
      }
      if (!activeStoreId) {
        throw new StoreScopeError("未选择门店，无法操作包厢", "no_store")
      }

      const updated = remote
        ? await remote(activeStoreId, id)
        : await updateRoomStatusForStore(activeStoreId, id, next)
      applyRemote(updated)
    } catch (error) {
      const message = error instanceof Error ? error.message : fallbackMessage
      set({ error: message })
      throw error
    }
  }

  return {
    rooms: [],
    activeStoreId: null,
    loading: false,
    error: null,

    fetchRooms: async (storeId) => {
      set({ loading: true, error: null, activeStoreId: storeId, rooms: [] })
      try {
        const rooms = await listRooms(storeId)
        set({ loading: false, rooms })
      } catch (error) {
        const message = error instanceof Error ? error.message : "加载包厢失败"
        set({ loading: false, error: message, rooms: [] })
        throw error
      }
    },

    updateRoomStatus: async (id, status) => run(id, status, "更新包厢状态失败"),
    startRoom: async (id) =>
      run(id, RoomStatus.OCCUPIED, "开房失败", async (storeId, roomId) => {
        const result = await startRoomForStore(storeId, roomId)
        return result.room
      }),
    // 结账后进入待清洁，而不是直接空闲，避免未清台即再次开房。
    checkoutRoom: async (id) =>
      run(id, RoomStatus.CLEANING, "结账失败", async (storeId, roomId) => {
        const result = await checkoutRoomForStore(storeId, roomId)
        return result.room
      }),
    cleanRoom: async (id) =>
      run(id, RoomStatus.AVAILABLE, "清台失败", (storeId, roomId) => cleanRoomForStore(storeId, roomId)),
    setMaintenance: async (id) =>
      run(id, RoomStatus.MAINTENANCE, "设置维修失败", (storeId, roomId) =>
        updateRoomStatusForStore(storeId, roomId, RoomStatus.MAINTENANCE),
      ),
    resumeRoom: async (id) =>
      run(id, RoomStatus.AVAILABLE, "恢复营业失败", (storeId, roomId) =>
        updateRoomStatusForStore(storeId, roomId, RoomStatus.AVAILABLE),
      ),

    clearError: () => set({ error: null }),

    reset: () =>
      set({
        rooms: [],
        activeStoreId: null,
        loading: false,
        error: null,
      }),
  }
})
