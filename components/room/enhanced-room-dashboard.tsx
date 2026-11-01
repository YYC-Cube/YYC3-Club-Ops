"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Search, RefreshCw, Eye, EyeOff, Filter } from "lucide-react"

// 包厢状态枚举
enum RoomStatus {
  AVAILABLE = "available", // 空闲
  OCCUPIED = "occupied", // 消费中
  CLEANING = "cleaning", // 清洁中
  MAINTENANCE = "maintenance", // 维修中
  RESERVED = "reserved", // 预定
  CHECKOUT = "checkout", // 待结账
  DISABLED = "disabled", // 停用
}

// 包厢类型枚举
enum RoomType {
  SMALL = "small", // 小包
  MEDIUM = "medium", // 中包
  LARGE = "large", // 大包
  VIP = "vip", // VIP包
  PRIVATE = "private", // 外卖房
}

interface RoomData {
  id: string
  number: string
  type: RoomType
  status: RoomStatus
  capacity: number
  currentGuests?: number
  startTime?: Date
  duration?: number
  amount?: number
  unpaidAmount?: number
  lastCleanTime?: Date
  maintenanceReason?: string
  reservationTime?: Date
  customerName?: string
  waiter?: string
  features?: string[]
}

interface EnhancedRoomDashboardProps {
  onRoomClick?: (room: RoomData) => void
  onQuickAction?: (action: string, roomId?: string) => void
}

export default function EnhancedRoomDashboard({ onRoomClick, onQuickAction }: EnhancedRoomDashboardProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [viewMode, setViewMode] = useState<"large" | "medium" | "small">("medium")
  const [showHidden, setShowHidden] = useState(false)
  const [selectedArea, setSelectedArea] = useState("全部")
  const [selectedType, setSelectedType] = useState("全部")
  const [selectedStatus, setSelectedStatus] = useState("全部")
  const [rooms, setRooms] = useState<RoomData[]>([])


  // 模拟包厢数据 - 按房号分类
  useEffect(() => {
    const mockRooms: RoomData[] = [
      // 小包区 (100-199)
      {
        id: "111",
        number: "111",
        type: RoomType.SMALL,
        status: RoomStatus.AVAILABLE,
        capacity: 8,
        features: ["小包"],
      },
      {
        id: "112",
        number: "112",
        type: RoomType.SMALL,
        status: RoomStatus.OCCUPIED,
        capacity: 8,
        currentGuests: 6,
        startTime: new Date(Date.now() - 2 * 60 * 60 * 1000),
        amount: 580,
        unpaidAmount: 580,
        features: ["小包"],
      },
      {
        id: "113",
        number: "113",
        type: RoomType.SMALL,
        status: RoomStatus.CLEANING,
        capacity: 8,
        features: ["小包"],
      },

      // 中包区 (200-299)
      {
        id: "201",
        number: "201",
        type: RoomType.MEDIUM,
        status: RoomStatus.AVAILABLE,
        capacity: 12,
        features: ["中包"],
      },
      {
        id: "202",
        number: "202",
        type: RoomType.MEDIUM,
        status: RoomStatus.OCCUPIED,
        capacity: 12,
        currentGuests: 8,
        startTime: new Date(Date.now() - 3 * 60 * 60 * 1000),
        amount: 890,
        unpaidAmount: 890,
        features: ["中包"],
      },
      {
        id: "203",
        number: "203",
        type: RoomType.MEDIUM,
        status: RoomStatus.CHECKOUT,
        capacity: 12,
        amount: 1200,
        unpaidAmount: 1200,
        features: ["中包"],
      },

      // 大包区 (300-399)
      {
        id: "301",
        number: "301",
        type: RoomType.LARGE,
        status: RoomStatus.AVAILABLE,
        capacity: 15,
        features: ["大包"],
      },
      {
        id: "302",
        number: "302",
        type: RoomType.LARGE,
        status: RoomStatus.RESERVED,
        capacity: 15,
        reservationTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
        customerName: "张先生",
        features: ["大包"],
      },

      // 豪华区 (600-699)
      {
        id: "606",
        number: "606",
        type: RoomType.SMALL,
        status: RoomStatus.CLEANING,
        capacity: 8,
        features: ["豪华小包"],
      },
      {
        id: "608",
        number: "608",
        type: RoomType.SMALL,
        status: RoomStatus.OCCUPIED,
        capacity: 8,
        currentGuests: 6,
        startTime: new Date(Date.now() - 2 * 60 * 60 * 1000),
        amount: 580,
        unpaidAmount: 580,
        features: ["豪华小包"],
      },

      // VIP区 (900+)
      {
        id: "999",
        number: "999",
        type: RoomType.VIP,
        status: RoomStatus.OCCUPIED,
        capacity: 25,
        currentGuests: 12,
        startTime: new Date(Date.now() - 4 * 60 * 60 * 1000),
        amount: 3989,
        unpaidAmount: 5973,
        features: ["VIP包"],
      },

      // 外卖房
      {
        id: "pt1",
        number: "外卖房1",
        type: RoomType.PRIVATE,
        status: RoomStatus.AVAILABLE,
        capacity: 4,
        features: ["外卖房"],
      },
      {
        id: "pt2",
        number: "外卖房2",
        type: RoomType.PRIVATE,
        status: RoomStatus.CHECKOUT,
        capacity: 4,
        unpaidAmount: 300,
        features: ["外卖房"],
      },
    ]
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 既有合法模式（父子实例同步/路由镜像），结构化改造排入专项
    setRooms(mockRooms)
  }, [])

  // 更新当前时间


  // 根据房号获取区域分类
  const getRoomArea = (roomNumber: string) => {
    const roomNum = Number.parseInt(roomNumber)
    if (!isNaN(roomNum)) {
      if (roomNum >= 100 && roomNum < 200) return "小包区"
      if (roomNum >= 200 && roomNum < 300) return "中包区"
      if (roomNum >= 300 && roomNum < 400) return "大包区"
      if (roomNum >= 600 && roomNum < 700) return "豪华区"
      if (roomNum >= 800 && roomNum < 900) return "中包区"
      if (roomNum >= 900) return "VIP区"
    } else if (roomNumber.includes("外卖")) {
      return "外卖区"
    }
    return "其他区域"
  }

  // 获取所有区域分类
  const getRoomCategories = () => {
    const categories = new Set<string>()
    rooms.forEach((room) => {
      categories.add(getRoomArea(room.number))
    })
    return Array.from(categories).sort()
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
      disabled: 0,
      guests: 0,
    }

    rooms.forEach((room) => {
      switch (room.status) {
        case RoomStatus.AVAILABLE:
          counts.available++
          break
        case RoomStatus.OCCUPIED:
          counts.occupied++
          counts.guests += room.currentGuests || 0
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
        case RoomStatus.DISABLED:
          counts.disabled++
          break
      }
    })

    return counts
  }

  const statusCounts = getStatusCounts()

  // 获取包厢状态颜色
  const getRoomStatusColor = (status: RoomStatus) => {
    switch (status) {
      case RoomStatus.AVAILABLE:
        return "bg-green-500"
      case RoomStatus.OCCUPIED:
        return "bg-orange-500"
      case RoomStatus.CLEANING:
        return "bg-blue-500"
      case RoomStatus.MAINTENANCE:
        return "bg-gray-500"
      case RoomStatus.RESERVED:
        return "bg-purple-500"
      case RoomStatus.CHECKOUT:
        return "bg-orange-600"
      case RoomStatus.DISABLED:
        return "bg-red-500"
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
        return "消费中"
      case RoomStatus.CLEANING:
        return "清洁中"
      case RoomStatus.MAINTENANCE:
        return "维修中"
      case RoomStatus.RESERVED:
        return "预定"
      case RoomStatus.CHECKOUT:
        return "待结账"
      case RoomStatus.DISABLED:
        return "停用"
      default:
        return "未知"
    }
  }

  // 格式化时间
  const formatDuration = (startTime: Date) => {
    const now = new Date()
    const diff = now.getTime() - startTime.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    return `${hours}小时${minutes}分钟`
  }

  // 过滤包厢
  const filteredRooms = rooms.filter((room) => {
    const matchesSearch =
      searchTerm === "" ||
      room.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      room.features?.some((feature) => feature.includes(searchTerm))

    const matchesArea = selectedArea === "全部" || getRoomArea(room.number) === selectedArea

    const matchesType =
      selectedType === "全部" ||
      (() => {
        if (selectedType === "小包" && room.type === RoomType.SMALL) return true
        if (selectedType === "中包" && room.type === RoomType.MEDIUM) return true
        if (selectedType === "大包" && room.type === RoomType.LARGE) return true
        if (selectedType === "VIP包" && room.type === RoomType.VIP) return true
        if (selectedType === "外卖房" && room.type === RoomType.PRIVATE) return true
        return false
      })()

    const matchesStatus = selectedStatus === "全部" || room.status === selectedStatus

    return matchesSearch && matchesArea && matchesType && matchesStatus
  })

  // 获取视图模式的网格类样式
  const getGridClass = () => {
    switch (viewMode) {
      case "large":
        return "grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
      case "medium":
        return "grid-cols-4 md:grid-cols-6 lg:grid-cols-8"
      case "small":
        return "grid-cols-6 md:grid-cols-8 lg:grid-cols-12"
      default:
        return "grid-cols-4 md:grid-cols-6 lg:grid-cols-8"
    }
  }

  // 状态按钮点击处理
  const handleStatusClick = (status: string) => {
    setSelectedStatus(selectedStatus === status ? "全部" : status)
  }

  return (
    <div className="h-screen bg-slate-900 text-white flex">
      {/* 左侧状态统计面板 */}
      <div className="w-64 bg-slate-800/50 border-r border-slate-700/50 p-4">
        <div className="space-y-3">
          <div className="text-lg font-bold text-cyan-400 mb-4">包厢状态筛选</div>

          <div className="space-y-2">
            <button
              onClick={() => setSelectedStatus("全部")}
              className={`flex items-center justify-between p-2 rounded transition-colors w-full ${
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
              className={`flex items-center justify-between p-2 rounded transition-colors w-full ${
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
              className={`flex items-center justify-between p-2 rounded transition-colors w-full ${
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
              className={`flex items-center justify-between p-2 rounded transition-colors w-full ${
                selectedStatus === "cleaning"
                  ? "bg-blue-500/30 ring-2 ring-blue-500"
                  : "bg-blue-500/10 hover:bg-blue-500/20"
              }`}
            >
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                <span className="text-sm">清洁中</span>
              </div>
              <span className="font-bold text-blue-400">{statusCounts.cleaning}</span>
            </button>

            <button
              onClick={() => handleStatusClick("maintenance")}
              className={`flex items-center justify-between p-2 rounded transition-colors w-full ${
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

            <button
              onClick={() => handleStatusClick("reserved")}
              className={`flex items-center justify-between p-2 rounded transition-colors w-full ${
                selectedStatus === "reserved"
                  ? "bg-purple-500/30 ring-2 ring-purple-500"
                  : "bg-purple-500/10 hover:bg-purple-500/20"
              }`}
            >
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                <span className="text-sm">预定</span>
              </div>
              <span className="font-bold text-purple-400">{statusCounts.reserved}</span>
            </button>

            <button
              onClick={() => handleStatusClick("checkout")}
              className={`flex items-center justify-between p-2 rounded transition-colors w-full ${
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

            <div className="flex items-center justify-between p-2 rounded bg-cyan-500/10">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-cyan-500 rounded-full"></div>
                <span className="text-sm">客人数</span>
              </div>
              <span className="font-bold text-cyan-400">{statusCounts.guests}</span>
            </div>
          </div>

          {/* 筛选状态显示 */}
          {(selectedArea !== "全部" || selectedType !== "全部" || selectedStatus !== "全部") && (
            <div className="mt-4 p-3 bg-slate-700/30 rounded">
              <div className="text-xs text-slate-400 mb-2">当前筛选:</div>
              <div className="space-y-1 text-xs">
                {selectedArea !== "全部" && (
                  <div className="flex items-center justify-between">
                    <span>区域:</span>
                    <span className="text-cyan-400">{selectedArea}</span>
                  </div>
                )}
                {selectedType !== "全部" && (
                  <div className="flex items-center justify-between">
                    <span>类型:</span>
                    <span className="text-cyan-400">{selectedType}</span>
                  </div>
                )}
                {selectedStatus !== "全部" && (
                  <div className="flex items-center justify-between">
                    <span>状态:</span>
                    <span className="text-cyan-400">{getRoomStatusText(selectedStatus as RoomStatus)}</span>
                  </div>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSelectedArea("全部")
                  setSelectedType("全部")
                  setSelectedStatus("全部")
                }}
                className="w-full mt-2 text-xs border-slate-600"
              >
                清除筛选
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* 主内容区域 */}
      <div className="flex-1 flex flex-col">
        {/* 顶部工具栏 */}
        <div className="bg-slate-800/50 border-b border-slate-700/50 p-4">
          <div className="flex items-center justify-between">
            {/* 左侧搜索和标题 */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Search className="h-4 w-4 text-slate-400" />
                <Input
                  placeholder="请输入包厢号"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-48 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
                />
                <Button className="bg-blue-600 hover:bg-blue-700">查询</Button>
              </div>

              <div className="text-2xl font-bold text-cyan-400">
                包厢状态
                <span className="text-sm text-slate-400 ml-2">
                  (显示 {filteredRooms.length}/{rooms.length} 个包厢)
                </span>
              </div>
            </div>

            {/* 右侧控制按钮 */}
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowHidden(!showHidden)}
                className="border-slate-600 text-slate-300"
              >
                {showHidden ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                隐藏前缀
              </Button>

              <div className="flex border border-slate-600 rounded">
                <Button
                  variant={viewMode === "large" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("large")}
                  className="rounded-r-none"
                >
                  大视图
                </Button>
                <Button
                  variant={viewMode === "medium" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("medium")}
                  className="rounded-none border-x border-slate-600"
                >
                  中视图
                </Button>
                <Button
                  variant={viewMode === "small" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("small")}
                  className="rounded-l-none"
                >
                  小视图
                </Button>
              </div>

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

          {/* 第二行控制栏 */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center space-x-4">
              <select
                value={selectedArea}
                onChange={(e) => setSelectedArea(e.target.value)}
                className="bg-slate-700 border border-slate-600 rounded px-3 py-1 text-sm text-white"
              >
                <option value="全部">选择区域</option>
                {getRoomCategories().map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>

              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="bg-slate-700 border border-slate-600 rounded px-3 py-1 text-sm text-white"
              >
                <option value="全部">包厢类型</option>
                <option value="小包">小包</option>
                <option value="中包">中包</option>
                <option value="大包">大包</option>
                <option value="VIP包">VIP包</option>
                <option value="外卖房">外卖房</option>
              </select>

              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="bg-slate-700 border border-slate-600 rounded px-3 py-1 text-sm text-white"
              >
                <option value="全部">全部状态</option>
                <option value="available">空闲</option>
                <option value="occupied">消费中</option>
                <option value="cleaning">清洁中</option>
                <option value="maintenance">维修中</option>
                <option value="reserved">预定</option>
                <option value="checkout">待结账</option>
                <option value="disabled">停用</option>
              </select>

              <select className="bg-slate-700 border border-slate-600 rounded px-3 py-1 text-sm text-white">
                <option>按包厢名</option>
                <option>按状态</option>
                <option>按类型</option>
                <option>按区域</option>
              </select>

              <div className="text-sm text-slate-400">
                当前打单: <span className="text-cyan-400">11笔</span>
                当日收益: <span className="text-red-400">33118元</span>
                当日未收款: <span className="text-red-400">27440元</span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Button className="bg-blue-600 hover:bg-blue-700 text-sm">管停营业</Button>
              <Button className="bg-green-600 hover:bg-green-700 text-sm">恢复营业</Button>
              <Button className="bg-cyan-600 hover:bg-cyan-700 text-sm">一键清扫</Button>
              <Button className="bg-purple-600 hover:bg-purple-700 text-sm">一键开房</Button>
            </div>
          </div>
        </div>

        {/* 包厢网格 */}
        <div className="flex-1 p-4 overflow-auto">
          <div className={`grid gap-3 ${getGridClass()}`}>
            {filteredRooms.map((room) => (
              <Card
                key={room.id}
                className={`${getRoomStatusColor(room.status)} border-0 cursor-pointer hover:scale-105 transition-transform duration-200 ${
                  viewMode === "small" ? "h-16" : viewMode === "medium" ? "h-24" : "h-32"
                }`}
                onClick={() => onRoomClick?.(room)}
              >
                <CardContent
                  className={`p-2 h-full flex flex-col justify-between text-white relative ${
                    viewMode === "small" ? "text-xs" : "text-sm"
                  }`}
                >
                  <div>
                    <div className="font-bold text-center mb-1">
                      {room.number} {room.features?.[0]}
                    </div>

                    {viewMode !== "small" && (
                      <div className="text-xs opacity-90 space-y-0.5">
                        <div>区域: {getRoomArea(room.number)}</div>
                        <div>容量: {room.capacity}人</div>
                        <div>{getRoomStatusText(room.status)}</div>
                      </div>
                    )}
                  </div>

                  {/* 状态特定信息 */}
                  {room.status === RoomStatus.OCCUPIED && room.startTime && viewMode !== "small" && (
                    <div className="text-xs bg-black/20 rounded p-1 mt-1">
                      <div>消费时长: {formatDuration(room.startTime)}</div>
                      {room.unpaidAmount && <div className="text-yellow-300">未收款: ¥{room.unpaidAmount}</div>}
                    </div>
                  )}

                  {room.status === RoomStatus.CHECKOUT && room.unpaidAmount && viewMode !== "small" && (
                    <div className="text-xs bg-black/20 rounded p-1 mt-1">
                      <div className="text-yellow-300">未收款: ¥{room.unpaidAmount}</div>
                    </div>
                  )}

                  {room.status === RoomStatus.RESERVED && room.reservationTime && viewMode !== "small" && (
                    <div className="text-xs bg-black/20 rounded p-1 mt-1">
                      <div>预定时间: {room.reservationTime.toLocaleTimeString()}</div>
                      {room.customerName && <div>客户: {room.customerName}</div>}
                    </div>
                  )}

                  {/* VIP标识 */}
                  {room.type === RoomType.VIP && (
                    <div className="absolute top-1 right-1 bg-yellow-500 text-black text-xs px-1 rounded">VIP</div>
                  )}

                  {/* 特殊状态标识 */}
                  {room.status === RoomStatus.CHECKOUT && (
                    <div className="absolute top-1 right-1 bg-orange-600 text-white text-xs px-1 rounded">账单</div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* 无结果提示 */}
          {filteredRooms.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <Filter className="h-12 w-12 mb-4" />
              <div className="text-lg mb-2">没有找到匹配的包厢</div>
              <div className="text-sm">请尝试调整筛选条件</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
