"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Search, RefreshCw, MapPin, Calendar } from "lucide-react"

// 包厢状态枚举
enum RoomStatus {
  AVAILABLE = "available", // 空闲
  OCCUPIED = "occupied", // 消费中
  CLEANING = "cleaning", // 清扫中
  MAINTENANCE = "maintenance", // 维修中
  RESERVED = "reserved", // 预定
  CHECKOUT = "checkout", // 待结账
  DISABLED = "disabled", // 停用
  VIP_OCCUPIED = "vip_occupied", // VIP消费中
  MEMBER = "member", // 会员
  SERVICE = "service", // 服务
  TRANSFER = "transfer", // 转房
  CONTINUOUS = "continuous", // 续房
  OVERTIME = "overtime", // 续时
  ACCOUNT = "account", // 结账
  WAITING = "waiting", // 待客
  PRE_ORDER = "pre_order", // 预买
  CUTOFF = "cutoff", // 包断
  LOW_CONSUMPTION = "low_consumption", // 满低消
}

// 房型枚举
enum RoomType {
  SMALL = "small", // 小包
  MEDIUM = "medium", // 中包
  LARGE = "large", // 大包
  VIP = "vip", // VIP包
  TAKEOUT = "takeout", // 外卖房
}

interface SeasonalRoom {
  id: string
  number: string
  name: string
  type: RoomType
  status: RoomStatus
  capacity: number
  currentGuests?: number
  startTime?: Date
  duration?: number
  dailyRevenue?: number
  dailyOpenCount?: number
  unpaidAmount?: number
  category: "节气" | "季节" | "外卖"
  isPointed?: boolean // 是否被箭头指向
  consumeTime?: string // 消费时长
  displayName?: string // 显示名称
}

interface SeasonalRoomDashboardProps {
  onRoomClick?: (room: SeasonalRoom) => void
  onQuickAction?: (action: string, roomId?: string) => void
}

export default function SeasonalRoomDashboard({ onRoomClick, onQuickAction }: SeasonalRoomDashboardProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedStatus, setSelectedStatus] = useState("全部")
  const [selectedCategory, setSelectedCategory] = useState("全部")
  const [rooms, setRooms] = useState<SeasonalRoom[]>([])
  const [pointedRooms, setPointedRooms] = useState<string[]>([])


  // 初始化包厢数据 - 完全按照图片配置
  useEffect(() => {
    const mockRooms: SeasonalRoom[] = [
      // 大包房 (3间) - 111, 222, 333
      {
        id: "111",
        number: "111",
        name: "小包",
        displayName: "111小包",
        type: RoomType.LARGE,
        status: RoomStatus.AVAILABLE,
        capacity: 15,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        category: "节气",
      },
      {
        id: "222",
        number: "222",
        name: "大包",
        displayName: "222大包",
        type: RoomType.LARGE,
        status: RoomStatus.AVAILABLE,
        capacity: 15,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        category: "节气",
      },
      {
        id: "333",
        number: "333",
        name: "小寒",
        displayName: "333小寒",
        type: RoomType.LARGE,
        status: RoomStatus.AVAILABLE,
        capacity: 15,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        category: "节气",
      },

      // 小包房 (3间) - 606, 608, 609
      {
        id: "606",
        number: "606",
        name: "大寒",
        displayName: "606大寒",
        type: RoomType.SMALL,
        status: RoomStatus.CLEANING,
        capacity: 8,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        category: "节气",
      },
      {
        id: "608",
        number: "608",
        name: "立秋",
        displayName: "608立秋",
        type: RoomType.SMALL,
        status: RoomStatus.OCCUPIED,
        capacity: 8,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        consumeTime: "2小时0分钟",
        category: "节气",
      },
      {
        id: "609",
        number: "609",
        name: "白雪",
        displayName: "609白雪",
        type: RoomType.SMALL,
        status: RoomStatus.AVAILABLE,
        capacity: 8,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        category: "节气",
      },

      // VIP包房 (4间) - 666, 777, 888, 999
      {
        id: "666",
        number: "666",
        name: "冬雪",
        displayName: "666冬雪",
        type: RoomType.VIP,
        status: RoomStatus.AVAILABLE,
        capacity: 25,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        category: "季节",
      },
      {
        id: "777",
        number: "777",
        name: "秋月",
        displayName: "777秋月",
        type: RoomType.VIP,
        status: RoomStatus.OCCUPIED,
        capacity: 25,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        consumeTime: "4小时0分钟",
        category: "季节",
      },
      {
        id: "888",
        number: "888",
        name: "立风",
        displayName: "888立风",
        type: RoomType.VIP,
        status: RoomStatus.CHECKOUT,
        capacity: 25,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        category: "季节",
      },
      {
        id: "999",
        number: "999",
        name: "春花",
        displayName: "999春花",
        type: RoomType.VIP,
        status: RoomStatus.CLEANING,
        capacity: 25,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        category: "季节",
      },

      // 中包房 (18间) - 8开头
      {
        id: "801",
        number: "801",
        name: "立春",
        displayName: "801立春",
        type: RoomType.MEDIUM,
        status: RoomStatus.CLEANING,
        capacity: 12,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        category: "节气",
      },
      {
        id: "802",
        number: "802",
        name: "雨水",
        displayName: "802雨水",
        type: RoomType.MEDIUM,
        status: RoomStatus.AVAILABLE,
        capacity: 12,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        category: "节气",
      },
      {
        id: "803",
        number: "803",
        name: "惊蛰",
        displayName: "803惊蛰",
        type: RoomType.MEDIUM,
        status: RoomStatus.AVAILABLE,
        capacity: 12,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        category: "节气",
      },
      {
        id: "805",
        number: "805",
        name: "春分",
        displayName: "805春分",
        type: RoomType.MEDIUM,
        status: RoomStatus.CLEANING,
        capacity: 12,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        category: "节气",
      },
      {
        id: "806",
        number: "806",
        name: "清明",
        displayName: "806清明",
        type: RoomType.MEDIUM,
        status: RoomStatus.AVAILABLE,
        capacity: 12,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        category: "节气",
      },
      {
        id: "808",
        number: "808",
        name: "谷雨",
        displayName: "808谷雨",
        type: RoomType.MEDIUM,
        status: RoomStatus.AVAILABLE,
        capacity: 12,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        category: "节气",
      },
      {
        id: "809",
        number: "809",
        name: "立夏",
        displayName: "809立夏",
        type: RoomType.MEDIUM,
        status: RoomStatus.CLEANING,
        capacity: 12,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        category: "节气",
      },
      {
        id: "810",
        number: "810",
        name: "小满",
        displayName: "810小满",
        type: RoomType.MEDIUM,
        status: RoomStatus.CLEANING,
        capacity: 12,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        category: "节气",
      },
      {
        id: "811",
        number: "811",
        name: "芒种",
        displayName: "811芒种",
        type: RoomType.MEDIUM,
        status: RoomStatus.CLEANING,
        capacity: 12,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        category: "节气",
      },
      {
        id: "812",
        number: "812",
        name: "夏至",
        displayName: "812夏至",
        type: RoomType.MEDIUM,
        status: RoomStatus.CLEANING,
        capacity: 12,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        category: "节气",
      },
      {
        id: "813",
        number: "813",
        name: "小暑",
        displayName: "813小暑",
        type: RoomType.MEDIUM,
        status: RoomStatus.CLEANING,
        capacity: 12,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        category: "节气",
      },
      {
        id: "815",
        number: "815",
        name: "大暑",
        displayName: "815大暑",
        type: RoomType.MEDIUM,
        status: RoomStatus.CHECKOUT,
        capacity: 12,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        unpaidAmount: 1995,
        category: "节气",
      },
      {
        id: "816",
        number: "816",
        name: "立秋",
        displayName: "816立秋",
        type: RoomType.MEDIUM,
        status: RoomStatus.CHECKOUT,
        capacity: 12,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        unpaidAmount: 3778,
        category: "节气",
      },
      {
        id: "818",
        number: "818",
        name: "秋分",
        displayName: "818秋分",
        type: RoomType.MEDIUM,
        status: RoomStatus.AVAILABLE,
        capacity: 12,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        category: "节气",
      },
      {
        id: "819",
        number: "819",
        name: "大寒",
        displayName: "819大寒",
        type: RoomType.MEDIUM,
        status: RoomStatus.CLEANING,
        capacity: 12,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        category: "节气",
      },
      {
        id: "820",
        number: "820",
        name: "大雪",
        displayName: "820大雪",
        type: RoomType.MEDIUM,
        status: RoomStatus.AVAILABLE,
        capacity: 12,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        category: "节气",
      },
      {
        id: "821",
        number: "821",
        name: "小雪",
        displayName: "821小雪",
        type: RoomType.MEDIUM,
        status: RoomStatus.AVAILABLE,
        capacity: 12,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        category: "节气",
      },
      {
        id: "822",
        number: "822",
        name: "立冬",
        displayName: "822立冬",
        type: RoomType.MEDIUM,
        status: RoomStatus.AVAILABLE,
        capacity: 12,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        category: "节气",
      },

      // 外卖房 (4间)
      {
        id: "takeout1",
        number: "外卖房1",
        name: "外卖房1PT包",
        displayName: "外卖房1PT包",
        type: RoomType.TAKEOUT,
        status: RoomStatus.AVAILABLE,
        capacity: 4,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        category: "外卖",
      },
      {
        id: "takeout2",
        number: "外卖房2",
        name: "外卖房2PT包",
        displayName: "外卖房2PT包",
        type: RoomType.TAKEOUT,
        status: RoomStatus.AVAILABLE,
        capacity: 4,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        category: "外卖",
      },
      {
        id: "takeout3",
        number: "外卖房3",
        name: "外卖房3PT包",
        displayName: "外卖房3PT包",
        type: RoomType.TAKEOUT,
        status: RoomStatus.AVAILABLE,
        capacity: 4,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        category: "外卖",
      },
      {
        id: "takeout4",
        number: "外卖房4",
        name: "外卖房4PT包",
        displayName: "外卖房4PT包",
        type: RoomType.TAKEOUT,
        status: RoomStatus.CHECKOUT,
        capacity: 4,
        dailyRevenue: 0,
        dailyOpenCount: 0,
        unpaidAmount: 300,
        category: "外卖",
      },
    ]

    // eslint-disable-next-line react-hooks/set-state-in-effect -- 既有合法模式（父子实例同步/路由镜像），结构化改造排入专项
    setRooms(mockRooms)

    // 设置一些包厢被箭头指向
    setPointedRooms(["111", "222", "333", "606", "608", "609", "666", "777"])
  }, [])

  // 更新当前时间


  // 获取包厢状态颜色
  const getRoomStatusColor = (status: RoomStatus) => {
    switch (status) {
      case RoomStatus.AVAILABLE:
        return "bg-green-500"
      case RoomStatus.OCCUPIED:
      case RoomStatus.VIP_OCCUPIED:
        return "bg-orange-500"
      case RoomStatus.CLEANING:
        return "bg-cyan-500"
      case RoomStatus.MAINTENANCE:
        return "bg-gray-500"
      case RoomStatus.RESERVED:
        return "bg-purple-500"
      case RoomStatus.CHECKOUT:
        return "bg-orange-600"
      case RoomStatus.DISABLED:
        return "bg-red-500"
      case RoomStatus.MEMBER:
        return "bg-blue-400"
      case RoomStatus.SERVICE:
        return "bg-indigo-400"
      case RoomStatus.TRANSFER:
        return "bg-teal-400"
      case RoomStatus.CONTINUOUS:
        return "bg-pink-500"
      case RoomStatus.OVERTIME:
        return "bg-purple-600"
      case RoomStatus.ACCOUNT:
        return "bg-yellow-600"
      case RoomStatus.WAITING:
        return "bg-blue-600"
      case RoomStatus.PRE_ORDER:
        return "bg-red-600"
      case RoomStatus.CUTOFF:
        return "bg-yellow-500"
      case RoomStatus.LOW_CONSUMPTION:
        return "bg-orange-400"
      default:
        return "bg-gray-400"
    }
  }

  // 获取包厢状态文本
  const getRoomStatusText = (status: RoomStatus) => {
    switch (status) {
      case RoomStatus.AVAILABLE:
        return "空闲"
      case RoomStatus.OCCUPIED:
      case RoomStatus.VIP_OCCUPIED:
        return "消费中"
      case RoomStatus.CLEANING:
        return "清扫中"
      case RoomStatus.MAINTENANCE:
        return "维修中"
      case RoomStatus.RESERVED:
        return "预定"
      case RoomStatus.CHECKOUT:
        return "待结账"
      case RoomStatus.DISABLED:
        return "停用"
      case RoomStatus.MEMBER:
        return "会员"
      case RoomStatus.SERVICE:
        return "服务"
      case RoomStatus.TRANSFER:
        return "转房"
      case RoomStatus.CONTINUOUS:
        return "续房"
      case RoomStatus.OVERTIME:
        return "续时"
      case RoomStatus.ACCOUNT:
        return "结账"
      case RoomStatus.WAITING:
        return "待客"
      case RoomStatus.PRE_ORDER:
        return "预买"
      case RoomStatus.CUTOFF:
        return "包断"
      case RoomStatus.LOW_CONSUMPTION:
        return "满低消"
      default:
        return "未知"
    }
  }

  // 统计各状态包厢数量
  const getStatusCounts = () => {
    const counts = {
      total: rooms.length,
      available: 0,
      occupied: 0,
      cleaning: 0,
      maintenance: 0,
      reserved: 0,
      checkout: 0,
      member: 0,
      service: 0,
      transfer: 0,
      continuous: 0,
      overtime: 0,
      account: 0,
      waiting: 0,
      preOrder: 0,
      cutoff: 0,
      lowConsumption: 0,
      currentOrders: 0,
      dailyRevenue: 0,
      unpaidAmount: 0,
      smallRooms: 0,
      mediumRooms: 0,
      largeRooms: 0,
      vipRooms: 0,
      takeoutRooms: 0,
    }

    rooms.forEach((room) => {
      // 统计房型
      switch (room.type) {
        case RoomType.SMALL:
          counts.smallRooms++
          break
        case RoomType.MEDIUM:
          counts.mediumRooms++
          break
        case RoomType.LARGE:
          counts.largeRooms++
          break
        case RoomType.VIP:
          counts.vipRooms++
          break
        case RoomType.TAKEOUT:
          counts.takeoutRooms++
          break
      }

      // 统计状态
      switch (room.status) {
        case RoomStatus.AVAILABLE:
          counts.available++
          break
        case RoomStatus.OCCUPIED:
        case RoomStatus.VIP_OCCUPIED:
          counts.occupied++
          break
        case RoomStatus.CLEANING:
          counts.cleaning++
          break
        case RoomStatus.MAINTENANCE:
          counts.maintenance++
          break
        case RoomStatus.RESERVED:
          counts.reserved++
          break
        case RoomStatus.CHECKOUT:
          counts.checkout++
          break
        case RoomStatus.MEMBER:
          counts.member++
          break
        case RoomStatus.SERVICE:
          counts.service++
          break
        case RoomStatus.TRANSFER:
          counts.transfer++
          break
        case RoomStatus.CONTINUOUS:
          counts.continuous++
          break
        case RoomStatus.OVERTIME:
          counts.overtime++
          break
        case RoomStatus.ACCOUNT:
          counts.account++
          break
        case RoomStatus.WAITING:
          counts.waiting++
          break
        case RoomStatus.PRE_ORDER:
          counts.preOrder++
          break
        case RoomStatus.CUTOFF:
          counts.cutoff++
          break
        case RoomStatus.LOW_CONSUMPTION:
          counts.lowConsumption++
          break
      }

      if (room.dailyRevenue) {
        counts.dailyRevenue += room.dailyRevenue
      }
      if (room.unpaidAmount) {
        counts.unpaidAmount += room.unpaidAmount
      }
    })

    // 模拟当前订单数
    counts.currentOrders = 4

    return counts
  }

  const statusCounts = getStatusCounts()

  // 过滤包厢
  const filteredRooms = rooms.filter((room) => {
    const matchesSearch =
      searchTerm === "" ||
      room.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      room.name.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = selectedStatus === "全部" || room.status === selectedStatus

    const matchesCategory = selectedCategory === "全部" || room.category === selectedCategory

    const matchesRoomType =
      selectedCategory === "小包"
        ? room.type === RoomType.SMALL
        : selectedCategory === "大包"
          ? room.type === RoomType.LARGE
          : selectedCategory === "中包"
            ? room.type === RoomType.MEDIUM
            : selectedCategory === "VIP包"
              ? room.type === RoomType.VIP
              : true

    return matchesSearch && matchesStatus && matchesCategory && matchesRoomType
  })

  // 状态按钮点击处理
  const handleStatusClick = (status: string) => {
    setSelectedStatus(selectedStatus === status ? "全部" : status)
  }

  // 获取箭头颜色
  const getArrowColor = (status: RoomStatus) => {
    switch (status) {
      case RoomStatus.AVAILABLE:
        return "text-green-500"
      case RoomStatus.OCCUPIED:
      case RoomStatus.VIP_OCCUPIED:
        return "text-orange-500"
      case RoomStatus.CLEANING:
        return "text-cyan-500"
      case RoomStatus.CHECKOUT:
        return "text-orange-600"
      default:
        return "text-gray-400"
    }
  }

  return (
    <div className="h-screen bg-slate-900 text-white flex">
      {/* 左侧状态统计面板 */}
      <div className="w-80 bg-slate-800/50 border-r border-slate-700/50 p-4 overflow-y-auto">
        <div className="space-y-3">
          <div className="text-lg font-bold text-cyan-400 mb-4">包厢状态总览</div>

          {/* 第一行状态 */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setSelectedStatus("全部")}
              className={`flex items-center justify-between p-2 rounded transition-colors ${
                selectedStatus === "全部"
                  ? "bg-slate-600/50 ring-2 ring-cyan-500"
                  : "bg-slate-700/30 hover:bg-slate-600/30"
              }`}
            >
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-slate-400 rounded-full"></div>
                <span className="text-sm">总数</span>
              </div>
              <span className="font-bold text-cyan-400">{statusCounts.total}</span>
            </button>

            <button
              onClick={() => handleStatusClick("available")}
              className={`flex items-center justify-between p-2 rounded transition-colors ${
                selectedStatus === "available"
                  ? "bg-green-500/30 ring-2 ring-green-500"
                  : "bg-green-500/10 hover:bg-green-500/20"
              }`}
            >
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-sm">空闲</span>
              </div>
              <span className="font-bold text-green-400">{statusCounts.available}</span>
            </button>

            <button
              onClick={() => handleStatusClick("occupied")}
              className={`flex items-center justify-between p-2 rounded transition-colors ${
                selectedStatus === "occupied"
                  ? "bg-orange-500/30 ring-2 ring-orange-500"
                  : "bg-orange-500/10 hover:bg-orange-500/20"
              }`}
            >
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                <span className="text-sm">消费中</span>
              </div>
              <span className="font-bold text-orange-400">{statusCounts.occupied}</span>
            </button>

            <button
              onClick={() => handleStatusClick("cleaning")}
              className={`flex items-center justify-between p-2 rounded transition-colors ${
                selectedStatus === "cleaning"
                  ? "bg-cyan-500/30 ring-2 ring-cyan-500"
                  : "bg-cyan-500/10 hover:bg-cyan-500/20"
              }`}
            >
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-cyan-500 rounded-full"></div>
                <span className="text-sm">清扫中</span>
              </div>
              <span className="font-bold text-cyan-400">{statusCounts.cleaning}</span>
            </button>

            <button
              onClick={() => handleStatusClick("checkout")}
              className={`flex items-center justify-between p-2 rounded transition-colors ${
                selectedStatus === "checkout"
                  ? "bg-orange-600/30 ring-2 ring-orange-600"
                  : "bg-orange-600/10 hover:bg-orange-600/20"
              }`}
            >
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-orange-600 rounded-full"></div>
                <span className="text-sm">待结账</span>
              </div>
              <span className="font-bold text-orange-400">{statusCounts.checkout}</span>
            </button>

            <button
              onClick={() => handleStatusClick("maintenance")}
              className={`flex items-center justify-between p-2 rounded transition-colors ${
                selectedStatus === "maintenance"
                  ? "bg-gray-500/30 ring-2 ring-gray-500"
                  : "bg-gray-500/10 hover:bg-gray-500/20"
              }`}
            >
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
                <span className="text-sm">维修中</span>
              </div>
              <span className="font-bold text-gray-400">{statusCounts.maintenance}</span>
            </button>
          </div>

          {/* 地址和收益信息 */}
          <div className="mt-6 space-y-2 text-sm">
            <div className="flex items-center space-x-2 text-slate-300">
              <MapPin className="h-4 w-4" />
              <span>河南省洛阳市</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400">当前订单:</span>
              <span className="text-cyan-400 font-bold">{statusCounts.currentOrders}笔</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400">当日未收款:</span>
              <span className="text-red-400 font-bold">{statusCounts.unpaidAmount}元</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400">当日收益:</span>
              <span className="text-red-400 font-bold">{statusCounts.dailyRevenue.toLocaleString()}元</span>
            </div>
          </div>

          {/* 房型分类筛选 */}
          <div className="mt-6">
            <div className="text-sm font-medium text-slate-300 mb-2">房型分类</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setSelectedCategory("全部")}
                className={`p-2 rounded text-sm transition-colors ${
                  selectedCategory === "全部"
                    ? "bg-cyan-500/30 ring-2 ring-cyan-500"
                    : "bg-slate-700/30 hover:bg-slate-600/30"
                }`}
              >
                全部 ({rooms.length})
              </button>
              <button
                onClick={() => setSelectedCategory("小包")}
                className={`p-2 rounded text-sm transition-colors ${
                  selectedCategory === "小包"
                    ? "bg-cyan-500/30 ring-2 ring-cyan-500"
                    : "bg-slate-700/30 hover:bg-slate-600/30"
                }`}
              >
                小包 ({statusCounts.smallRooms})
              </button>
              <button
                onClick={() => setSelectedCategory("中包")}
                className={`p-2 rounded text-sm transition-colors ${
                  selectedCategory === "中包"
                    ? "bg-cyan-500/30 ring-2 ring-cyan-500"
                    : "bg-slate-700/30 hover:bg-slate-600/30"
                }`}
              >
                中包 ({statusCounts.mediumRooms})
              </button>
              <button
                onClick={() => setSelectedCategory("大包")}
                className={`p-2 rounded text-sm transition-colors ${
                  selectedCategory === "大包"
                    ? "bg-cyan-500/30 ring-2 ring-cyan-500"
                    : "bg-slate-700/30 hover:bg-slate-600/30"
                }`}
              >
                大包 ({statusCounts.largeRooms})
              </button>
              <button
                onClick={() => setSelectedCategory("VIP包")}
                className={`p-2 rounded text-sm transition-colors ${
                  selectedCategory === "VIP包"
                    ? "bg-cyan-500/30 ring-2 ring-cyan-500"
                    : "bg-slate-700/30 hover:bg-slate-600/30"
                }`}
              >
                VIP包 ({statusCounts.vipRooms})
              </button>
              <button
                onClick={() => setSelectedCategory("外卖")}
                className={`p-2 rounded text-sm transition-colors ${
                  selectedCategory === "外卖"
                    ? "bg-cyan-500/30 ring-2 ring-cyan-500"
                    : "bg-slate-700/30 hover:bg-slate-600/30"
                }`}
              >
                外卖 ({statusCounts.takeoutRooms})
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 主内容区域 */}
      <div className="flex-1 flex flex-col">
        {/* 顶部工具栏 */}
        <div className="bg-slate-800/50 border-b border-slate-700/50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Search className="h-4 w-4 text-slate-400" />
                <Input
                  placeholder="搜索包厢号或名称"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-48 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
                />
                <Button className="bg-blue-600 hover:bg-blue-700">查询</Button>
              </div>

              <div className="text-xl font-bold text-cyan-400">
                24节气+四季包厢管理
                <span className="text-sm text-slate-400 ml-2">
                  (显示 {filteredRooms.length}/{rooms.length} 个包厢)
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Button className="bg-blue-600 hover:bg-blue-700">暂停营业</Button>
              <Button className="bg-green-600 hover:bg-green-700">恢复营业</Button>
              <Button className="bg-cyan-600 hover:bg-cyan-700">一键清扫</Button>
              <Button className="bg-purple-600 hover:bg-purple-700">一键开房</Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onQuickAction?.("refresh")}
                className="border-slate-600 text-slate-300"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* 包厢网格 - 带箭头指向效果 */}
        <div className="flex-1 p-6 overflow-auto relative">
          <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
            {filteredRooms.map((room) => (
              <div key={room.id} className="relative">
                {/* 箭头指向效果 */}
                {pointedRooms.includes(room.number) && (
                  <div className={`absolute -top-8 left-1/2 transform -translate-x-1/2 ${getArrowColor(room.status)}`}>
                    <div className="text-2xl">↓</div>
                  </div>
                )}

                <Card
                  className={`${getRoomStatusColor(room.status)} border-0 cursor-pointer hover:scale-105 transition-all duration-200 h-32 ${
                    pointedRooms.includes(room.number) ? "ring-2 ring-white/50" : ""
                  }`}
                  onClick={() => onRoomClick?.(room)}
                >
                  <CardContent className="p-3 h-full flex flex-col justify-between text-white relative">
                    <div>
                      <div className="font-bold text-center mb-1 text-lg">{room.displayName}</div>
                      <div className="text-xs opacity-90 text-center">
                        <div>{getRoomStatusText(room.status)}</div>
                        {room.consumeTime && <div className="text-xs mt-1">消费时长: {room.consumeTime}</div>}
                      </div>
                    </div>

                    {/* 收益信息 */}
                    <div className="text-xs bg-black/20 rounded p-1 mt-1">
                      <div>日总收益: {room.dailyRevenue || 0}元</div>
                      <div>日开房数: {room.dailyOpenCount || 0}次</div>
                      {room.unpaidAmount && <div className="text-red-300">未收款: ¥{room.unpaidAmount}</div>}
                    </div>

                    {/* VIP标识 */}
                    {room.type === RoomType.VIP && (
                      <div className="absolute top-1 right-1 bg-yellow-500 text-black text-xs px-1 rounded">VIP</div>
                    )}

                    {/* 外卖标识 */}
                    {room.category === "外卖" && (
                      <div className="absolute top-1 left-1 bg-blue-500 text-white text-xs px-1 rounded">外卖</div>
                    )}

                    {/* 节气标识 */}
                    {room.category === "节气" && (
                      <div className="absolute bottom-1 right-1 text-xs opacity-60">
                        <Calendar className="h-3 w-3" />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>

          {/* 无结果提示 */}
          {filteredRooms.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <Calendar className="h-12 w-12 mb-4" />
              <div className="text-lg mb-2">没有找到匹配的包厢</div>
              <div className="text-sm">请尝试调整筛选条件</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
