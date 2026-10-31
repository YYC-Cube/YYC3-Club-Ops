"use client"

import { Badge } from "@/components/ui/badge"
import { formatCNY } from "@/lib/money"
import { RoomStatus, type Room } from "@/lib/types"

const STATUS_LABEL: Record<RoomStatus, string> = {
  [RoomStatus.AVAILABLE]: "空闲",
  [RoomStatus.OCCUPIED]: "消费中",
  [RoomStatus.RESERVED]: "已预定",
  [RoomStatus.CLEANING]: "待清洁",
  [RoomStatus.MAINTENANCE]: "维修中",
}

const STATUS_STYLE: Record<RoomStatus, string> = {
  [RoomStatus.AVAILABLE]: "border-emerald-500/40 bg-emerald-500/10",
  [RoomStatus.OCCUPIED]: "border-rose-500/40 bg-rose-500/10",
  [RoomStatus.RESERVED]: "border-amber-500/40 bg-amber-500/10",
  [RoomStatus.CLEANING]: "border-sky-500/40 bg-sky-500/10",
  [RoomStatus.MAINTENANCE]: "border-slate-500/40 bg-slate-500/10",
}

interface RoomStatusDashboardProps {
  rooms: Room[]
  onRoomClick?: (room: Room) => void
}

export default function RoomStatusDashboard({ rooms, onRoomClick }: RoomStatusDashboardProps) {
  if (rooms.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-700 p-10 text-center" role="status">
        <p className="text-sm text-slate-300">当前门店暂无包厢数据</p>
        <p className="mt-1 text-xs text-slate-500">请先在系统设置中创建门店与包厢，或检查数据源配置。</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {rooms.map((room) => (
        <button
          key={room.id}
          type="button"
          onClick={() => onRoomClick?.(room)}
          aria-label={`${room.name}，${STATUS_LABEL[room.status]}，单价 ${formatCNY(room.priceCents)}`}
          className={`rounded-lg border p-4 text-left transition-colors hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${STATUS_STYLE[room.status]}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{room.name}</span>
            <Badge variant="outline" className="text-[10px]">
              {STATUS_LABEL[room.status]}
            </Badge>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {room.type} · {room.floor ? `${room.floor} 楼` : "楼层未设置"}
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-200">{formatCNY(room.priceCents)}/小时</div>
        </button>
      ))}
    </div>
  )
}
