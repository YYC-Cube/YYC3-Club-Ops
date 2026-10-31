"use client"

import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatCNY } from "@/lib/money"
import { usePosStore } from "@/lib/stores/usePosStore"
import { useRoomStore } from "@/lib/stores/useRoomStore"
import { useStoreContextStore } from "@/lib/stores/useStoreContextStore"
import { RoomStatus, type PaymentMethod } from "@/lib/types"

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "现金",
  wechat: "微信",
  alipay: "支付宝",
  member_card: "会员卡",
  card: "银行卡",
}

const PAYMENT_METHODS = Object.keys(PAYMENT_LABELS) as PaymentMethod[]

export default function POSSystem({
  roomId,
  onClose,
}: {
  roomId?: string
  onClose?: () => void
}) {
  const currentStoreId = useStoreContextStore((state) => state.currentStoreId)
  const rooms = useRoomStore((state) => state.rooms)
  const activeRoomStoreId = useRoomStore((state) => state.activeStoreId)
  const fetchRooms = useRoomStore((state) => state.fetchRooms)

  const products = usePosStore((state) => state.products)
  const bill = usePosStore((state) => state.bill)
  const receipt = usePosStore((state) => state.receipt)
  const loading = usePosStore((state) => state.loading)
  const submitting = usePosStore((state) => state.submitting)
  const error = usePosStore((state) => state.error)
  const load = usePosStore((state) => state.load)
  const addProduct = usePosStore((state) => state.addProduct)
  const removeLine = usePosStore((state) => state.removeLine)
  const settle = usePosStore((state) => state.settle)
  const clearReceipt = usePosStore((state) => state.clearReceipt)
  const reset = usePosStore((state) => state.reset)

  const [selectedRoomId, setSelectedRoomId] = useState<string>(roomId ?? "")
  const [category, setCategory] = useState<string>("全部")
  const [keyword, setKeyword] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash")

  // 未显式传入房间时：默认选中第一个进行中的包厢
  useEffect(() => {
    if (selectedRoomId) return
    const occupied = rooms.find((room) => room.status === RoomStatus.OCCUPIED)
    if (occupied) setSelectedRoomId(occupied.id)
  }, [rooms, selectedRoomId])

  useEffect(() => {
    // 同一门店的包厢已由房间页加载时不再重拉，避免把本地最新状态覆盖回初始值。
    if (!currentStoreId || activeRoomStoreId === currentStoreId) return
    void fetchRooms(currentStoreId).catch(() => {})
  }, [currentStoreId, activeRoomStoreId, fetchRooms])

  useEffect(() => {
    if (!currentStoreId || !selectedRoomId) return
    void load(currentStoreId, selectedRoomId).catch(() => {})
  }, [currentStoreId, selectedRoomId, load])

  useEffect(() => () => reset(), [reset])

  const categories = useMemo(
    () => ["全部", ...new Set(products.map((product) => product.category))],
    [products],
  )

  const visibleProducts = useMemo(
    () =>
      products.filter((product) => {
        const matchCategory = category === "全部" || product.category === category
        const matchKeyword = keyword.trim() ? product.name.includes(keyword.trim()) : true
        return matchCategory && matchKeyword
      }),
    [products, category, keyword],
  )

  const occupiedRooms = rooms.filter((room) => room.status === RoomStatus.OCCUPIED)
  const roomName = rooms.find((room) => room.id === selectedRoomId)?.name ?? selectedRoomId

  const handleSettle = async () => {
    try {
      const result = await settle(paymentMethod)
      // 结账后包厢进入待清洁：同步房间 store，避免返回列表时状态过期。
      useRoomStore.setState((state) => ({
        rooms: state.rooms.map((room) =>
          room.id === result.roomId ? { ...room, status: RoomStatus.CLEANING } : room,
        ),
      }))
    } catch {
      // 错误已写入 store.error
    }
  }

  const handleClose = () => {
    reset()
    onClose?.()
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">POS 收银台</h1>
          <p className="mt-1 text-xs text-slate-400">
            {roomName ? `当前包厢：${roomName}` : "请选择进行中的包厢"}
            {bill ? ` · 已开台 ${bill.billableHours} 小时` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
            <SelectTrigger className="w-44" aria-label="选择包厢">
              <SelectValue placeholder="选择包厢" />
            </SelectTrigger>
            <SelectContent>
              {occupiedRooms.length === 0 ? (
                <SelectItem value="__none" disabled>
                  无进行中的包厢
                </SelectItem>
              ) : (
                occupiedRooms.map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    {room.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {onClose ? (
            <Button variant="outline" onClick={handleClose}>
              返回
            </Button>
          ) : null}
        </div>
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300"
        >
          {error}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="flex min-h-0 flex-col border-slate-800 bg-slate-900/40">
          <CardHeader className="gap-3 pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">商品价目</CardTitle>
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索商品"
                className="h-8 w-40"
                aria-label="搜索商品"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((item) => (
                <Button
                  key={item}
                  size="sm"
                  variant={category === item ? "default" : "outline"}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 pt-0">
            {loading ? (
              <p className="py-6 text-sm text-slate-400" role="status">
                加载价目表与账单...
              </p>
            ) : visibleProducts.length === 0 ? (
              <p className="py-6 text-sm text-slate-400">没有匹配的商品</p>
            ) : (
              <ScrollArea className="h-full pr-3">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {visibleProducts.map((product) => {
                    const soldOut = product.stock <= 0
                    return (
                      <Button
                        key={product.id}
                        variant="outline"
                        disabled={soldOut || submitting || !selectedRoomId}
                        onClick={() => {
                          void addProduct(product.id).catch(() => {})
                        }}
                        className="h-auto flex-col items-start gap-1 whitespace-normal p-3 text-left"
                      >
                        <span className="font-medium">{product.name}</span>
                        <span className="text-xs text-slate-400">
                          {formatCNY(product.priceCents)} / {product.unit}
                        </span>
                        <Badge variant={soldOut ? "destructive" : "secondary"} className="mt-1">
                          {soldOut ? "缺货" : `库存 ${product.stock}`}
                        </Badge>
                      </Button>
                    )
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-col border-slate-800 bg-slate-900/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">当前账单</CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-0">
            <ScrollArea className="min-h-24 flex-1 pr-3">
              {bill && bill.items.length > 0 ? (
                <ul className="space-y-2">
                  {bill.items.map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate">{item.name}</p>
                        <p className="text-xs text-slate-400">
                          {formatCNY(item.unitPriceCents)} × {item.quantity}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums">{formatCNY(item.totalCents)}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-rose-300"
                          disabled={submitting}
                          onClick={() => {
                            void removeLine(item.id).catch(() => {})
                          }}
                        >
                          退单
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-4 text-sm text-slate-400">尚未点单</p>
              )}
            </ScrollArea>

            <Separator className="bg-slate-800" />

            <dl className="space-y-1 text-sm">
              <div className="flex justify-between text-slate-300">
                <dt>房费（{bill?.billableHours ?? 0} 小时）</dt>
                <dd className="tabular-nums">{formatCNY(bill?.roomCents ?? 0)}</dd>
              </div>
              <div className="flex justify-between text-slate-300">
                <dt>商品</dt>
                <dd className="tabular-nums">{formatCNY(bill?.itemsCents ?? 0)}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-800 pt-2 text-base font-semibold">
                <dt>应收</dt>
                <dd className="tabular-nums">{formatCNY(bill?.totalCents ?? 0)}</dd>
              </div>
            </dl>

            <Select
              value={paymentMethod}
              onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}
            >
              <SelectTrigger aria-label="支付方式">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((method) => (
                  <SelectItem key={method} value={method}>
                    {PAYMENT_LABELS[method]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              className="w-full"
              disabled={!bill || submitting || loading}
              onClick={() => {
                void handleSettle()
              }}
            >
              {submitting ? "结账中..." : "结账并打印小票"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={receipt !== null} onOpenChange={(open) => (!open ? clearReceipt() : undefined)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>结账成功</DialogTitle>
            <DialogDescription>小票号 {receipt?.orderNo}</DialogDescription>
          </DialogHeader>
          {receipt ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-400">
                <span>包厢</span>
                <span>{receipt.room.name}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>计费时长</span>
                <span>{receipt.billableHours} 小时</span>
              </div>
              <Separator className="bg-slate-800" />
              {(receipt.items.length > 0 ? receipt.items : []).map((item) => (
                <div key={item.id} className="flex justify-between">
                  <span>
                    {item.name} × {item.quantity}
                  </span>
                  <span className="tabular-nums">{formatCNY(item.totalCents)}</span>
                </div>
              ))}
              <Separator className="bg-slate-800" />
              <div className="flex justify-between">
                <span>房费</span>
                <span className="tabular-nums">{formatCNY(receipt.roomCents)}</span>
              </div>
              <div className="flex justify-between">
                <span>商品</span>
                <span className="tabular-nums">{formatCNY(receipt.itemsCents)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <span>合计</span>
                <span className="tabular-nums">{formatCNY(receipt.totalCents)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>支付方式</span>
                <span>{PAYMENT_LABELS[receipt.paymentMethod]}</span>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => clearReceipt()}>
              继续点单
            </Button>
            <Button
              onClick={() => {
                clearReceipt()
                handleClose()
              }}
            >
              完成并返回
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
