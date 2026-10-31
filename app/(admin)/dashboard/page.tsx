"use client"

import { useEffect } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Home, ShoppingBag, DollarSign, Users, Clock } from "lucide-react"
import { formatCNY, toCents } from "@/lib/money"
import { RoomStatus } from "@/lib/types"
import { useRoomStore } from "@/lib/stores/useRoomStore"
import { useOrderStore } from "@/lib/stores/useOrderStore"
import { useStoreContextStore } from "@/lib/stores/useStoreContextStore"

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
}

export default function AdminDashboard() {
  const currentStore = useStoreContextStore((state) => state.currentStore)
  const currentStoreId = useStoreContextStore((state) => state.currentStoreId)
  const { rooms, fetchRooms } = useRoomStore()
  const { orders, fetchOrders } = useOrderStore()

  useEffect(() => {
    if (!currentStoreId) return
    void fetchRooms(currentStoreId).catch(() => {})
  }, [currentStoreId, fetchRooms])

  useEffect(() => {
    void fetchOrders()
  }, [fetchOrders])

  const hasOrderData = orders.length > 0
  const todayRevenueCents = orders.reduce((sum, order) => sum + toCents(order.total), 0)

  const stats = {
    totalRooms: rooms.length,
    availableRooms: rooms.filter((r) => r.status === RoomStatus.AVAILABLE).length,
    occupiedRooms: rooms.filter((r) => r.status === RoomStatus.OCCUPIED).length,
    totalOrders: orders.length,
    todayRevenue: formatCNY(todayRevenueCents),
  }

  const statCards = [
    {
      title: "包厢总数",
      value: rooms.length > 0 ? stats.totalRooms : "—",
      icon: Home,
      sub: rooms.length > 0 ? `空闲 ${stats.availableRooms} | 占用 ${stats.occupiedRooms}` : "包厢数据未接入",
    },
    {
      title: "今日订单",
      value: hasOrderData ? stats.totalOrders : "—",
      icon: ShoppingBag,
      sub: hasOrderData ? "已接入订单数据" : "订单数据未接入",
    },
    {
      title: "今日营收",
      value: hasOrderData ? stats.todayRevenue : "—",
      icon: DollarSign,
      sub: hasOrderData ? "按已接入订单统计" : "订单数据未接入",
    },
    {
      title: "会员数",
      value: "—",
      icon: Users,
      sub: "会员数据未接入",
    },
  ]

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">经营看板</h1>
          <p className="mt-1 text-xs text-slate-400">{currentStore ? `${currentStore.name} · ${currentStore.timezone}` : "门店上下文加载中"}</p>
        </div>
        <Badge variant="outline" className="text-xs">
          <Clock className="h-3 w-3 mr-1" />
          实时
        </Badge>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <motion.div key={card.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">{card.title}</CardTitle>
                <card.icon className="h-4 w-4 text-slate-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.value}</div>
                <p className="text-xs text-slate-500 mt-1">{card.sub}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
