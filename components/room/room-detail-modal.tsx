"use client"

import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCNY } from "@/lib/money"
import { RoomStatus, type Room } from "@/lib/types"

export type RoomAction = "start" | "checkout" | "clean" | "maintenance" | "resume" | "order"

interface RoomActionOption {
  action: RoomAction
  label: string
  variant: "default" | "outline" | "secondary" | "destructive"
}

const STATUS_LABEL: Record<RoomStatus, string> = {
  [RoomStatus.AVAILABLE]: "空闲",
  [RoomStatus.OCCUPIED]: "消费中",
  [RoomStatus.RESERVED]: "已预定",
  [RoomStatus.CLEANING]: "待清洁",
  [RoomStatus.MAINTENANCE]: "维修中",
}

const STATUS_VARIANT: Record<RoomStatus, "default" | "secondary" | "outline" | "destructive"> = {
  [RoomStatus.AVAILABLE]: "default",
  [RoomStatus.OCCUPIED]: "secondary",
  [RoomStatus.RESERVED]: "outline",
  [RoomStatus.CLEANING]: "outline",
  [RoomStatus.MAINTENANCE]: "destructive",
}

const ACTIONS_BY_STATUS: Record<RoomStatus, RoomActionOption[]> = {
  [RoomStatus.AVAILABLE]: [
    { action: "start", label: "开房", variant: "default" },
    { action: "maintenance", label: "设为维修", variant: "outline" },
  ],
  [RoomStatus.RESERVED]: [
    { action: "start", label: "开房", variant: "default" },
    { action: "maintenance", label: "设为维修", variant: "outline" },
  ],
  [RoomStatus.OCCUPIED]: [
    { action: "order", label: "点单", variant: "default" },
    { action: "checkout", label: "结账", variant: "secondary" },
  ],
  [RoomStatus.CLEANING]: [
    { action: "clean", label: "清洁完成", variant: "default" },
    { action: "maintenance", label: "设为维修", variant: "outline" },
  ],
  [RoomStatus.MAINTENANCE]: [{ action: "resume", label: "恢复营业", variant: "default" }],
}

interface RoomDetailModalProps {
  room: Room | null
  isOpen: boolean
  onClose: () => void
  onAction?: (action: RoomAction) => void
}

export default function RoomDetailModal({ room, isOpen, onClose, onAction }: RoomDetailModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    dialogRef.current?.focus()

    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [isOpen, onClose])

  if (!isOpen || !room) return null

  const actions = ACTIONS_BY_STATUS[room.status]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-dialog-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 p-6 text-slate-100 shadow-xl focus:outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="room-dialog-title" className="text-xl font-bold">
              {room.name}
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              门店 {room.storeId} · {room.floor ? `${room.floor} 楼` : "楼层未设置"}
            </p>
          </div>
          <Badge variant={STATUS_VARIANT[room.status]}>{STATUS_LABEL[room.status]}</Badge>
        </div>

        <dl className="grid grid-cols-2 gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm">
          <div>
            <dt className="text-xs text-slate-500">房型</dt>
            <dd className="mt-1 font-medium">{room.type}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">当前房价</dt>
            <dd className="mt-1 font-medium">{formatCNY(room.priceCents)}/小时</dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-wrap gap-2">
          {actions.map((option) => (
            <Button key={option.action} variant={option.variant} onClick={() => onAction?.(option.action)}>
              {option.label}
            </Button>
          ))}
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>
    </div>
  )
}
