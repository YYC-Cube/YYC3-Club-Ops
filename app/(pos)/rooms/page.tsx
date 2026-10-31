"use client"

import { useEffect, useMemo, useState } from "react"
import POSSystem from "@/components/pos/pos-system"
import RoomDetailModal, { type RoomAction } from "@/components/room/room-detail-modal"
import RoomStatusDashboard from "@/components/room/room-status-dashboard"
import { Button } from "@/components/ui/button"
import { useRoomStore } from "@/lib/stores/useRoomStore"
import { useStoreContextStore } from "@/lib/stores/useStoreContextStore"
import type { Room } from "@/lib/types"

export default function RoomsPage() {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [showPOS, setShowPOS] = useState(false)
  const [posRoomId, setPosRoomId] = useState<string | undefined>()
  const [actionError, setActionError] = useState<string | null>(null)

  const currentStore = useStoreContextStore((state) => state.currentStore)
  const currentStoreId = useStoreContextStore((state) => state.currentStoreId)
  const sessionStatus = useStoreContextStore((state) => state.status)
  const sessionError = useStoreContextStore((state) => state.error)
  const loadSession = useStoreContextStore((state) => state.loadSession)

  const { rooms, loading, error: roomError, fetchRooms, startRoom, checkoutRoom, cleanRoom, setMaintenance, resumeRoom } =
    useRoomStore()

  useEffect(() => {
    if (!currentStoreId) return
    // 错误由 store 记录；这里只阻止未处理的 Promise 拒绝。
    void fetchRooms(currentStoreId).catch(() => {})
  }, [currentStoreId, fetchRooms])

  useEffect(() => {
    setSelectedRoomId(null)
    setActionError(null)
  }, [currentStoreId])

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId],
  )

  const handleRoomClick = (room: Room) => {
    setActionError(null)
    setSelectedRoomId(room.id)
  }

  const handleCloseModal = () => {
    setSelectedRoomId(null)
  }

  const handleRoomAction = async (action: RoomAction) => {
    if (!selectedRoom) return

    try {
      setActionError(null)
      switch (action) {
        case "start":
          await startRoom(selectedRoom.id)
          break
        case "checkout":
          await checkoutRoom(selectedRoom.id)
          break
        case "clean":
          await cleanRoom(selectedRoom.id)
          break
        case "maintenance":
          await setMaintenance(selectedRoom.id)
          break
        case "resume":
          await resumeRoom(selectedRoom.id)
          break
        case "order":
          setPosRoomId(selectedRoom.id)
          setShowPOS(true)
          setSelectedRoomId(null)
          break
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "操作失败，请重试")
    }
  }

  if (showPOS) {
    return (
      <POSSystem
        roomId={posRoomId}
        onClose={() => {
          setShowPOS(false)
          setPosRoomId(undefined)
        }}
      />
    )
  }

  const errorMessage = actionError ?? roomError ?? (sessionStatus === "error" ? sessionError : null)

  return (
    <div className="h-full space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">包厢管理</h1>
          <p className="mt-1 text-xs text-slate-400">
            {currentStore ? `${currentStore.name} · 多店 SaaS 开发预览` : "多店 SaaS 开发预览 · 门店上下文加载中"}
          </p>
        </div>
        <span className="text-xs text-slate-500">{loading ? "加载中..." : `共 ${rooms.length} 个包厢`}</span>
      </header>

      {errorMessage && (
        <div role="alert" className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {errorMessage}
        </div>
      )}

      {!currentStoreId && sessionStatus !== "error" ? (
        <div className="rounded-md border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm text-slate-400" role="status">
          正在加载门店上下文...
        </div>
      ) : null}

      {sessionStatus === "error" ? (
        <Button
          variant="outline"
          onClick={() => {
            void loadSession(undefined, { force: true }).catch(() => {})
          }}
        >
          重试加载门店上下文
        </Button>
      ) : null}

      {currentStoreId ? (
        <RoomStatusDashboard rooms={rooms} onRoomClick={handleRoomClick} />
      ) : null}

      <RoomDetailModal
        room={selectedRoom}
        isOpen={selectedRoom !== null}
        onClose={handleCloseModal}
        onAction={handleRoomAction}
      />
    </div>
  )
}
