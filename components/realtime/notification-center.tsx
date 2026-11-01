"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Bell, X, AlertTriangle, CheckCircle, Info, Clock, Zap } from "lucide-react"

// mock 通知时间戳提为模块级常量（react-hooks/purity：render 期不调用 new Date/Date.now）
const TS_2MIN = new Date(Date.now() - 2 * 60000)
const TS_15MIN = new Date(Date.now() - 15 * 60000)
const TS_30MIN = new Date(Date.now() - 30 * 60000)
const TS_45MIN = new Date(Date.now() - 45 * 60000)
const TS_60MIN = new Date(Date.now() - 60 * 60000)


interface Notification {
  id: string
  type: "alert" | "info" | "success" | "warning" | "urgent"
  title: string
  message: string
  timestamp: Date
  department?: string
  isRead: boolean
  priority: "low" | "normal" | "high" | "urgent"
  actionRequired?: boolean
}

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: "1",
      type: "urgent",
      title: "紧急呼叫",
      message: "A08包厢客人按下紧急呼叫按钮",
      timestamp: TS_2MIN,
      department: "楼面部",
      isRead: false,
      priority: "urgent",
      actionRequired: true,
    },
    {
      id: "2",
      type: "warning",
      title: "库存预警",
      message: "啤酒库存不足，剩余数量: 15瓶",
      timestamp: TS_15MIN,
      department: "仓库",
      isRead: false,
      priority: "high",
      actionRequired: true,
    },
    {
      id: "3",
      type: "info",
      title: "员工签到",
      message: "张三已签到上班",
      timestamp: TS_30MIN,
      department: "人事",
      isRead: true,
      priority: "normal",
    },
    {
      id: "4",
      type: "success",
      title: "营业目标达成",
      message: "今日营业额已达成目标的120%",
      timestamp: TS_45MIN,
      department: "财务",
      isRead: false,
      priority: "normal",
    },
    {
      id: "5",
      type: "alert",
      title: "设备故障",
      message: "B区音响系统出现故障，需要维修",
      timestamp: TS_60MIN,
      department: "技术部",
      isRead: false,
      priority: "high",
      actionRequired: true,
    },
  ])

  const [isOpen, setIsOpen] = useState(false)

  const unreadCount = notifications.filter((n) => !n.isRead).length
  const urgentCount = notifications.filter((n) => n.priority === "urgent" && !n.isRead).length

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "urgent":
        return <AlertTriangle className="h-4 w-4 text-red-500" />
      case "alert":
        return <AlertTriangle className="h-4 w-4 text-orange-500" />
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "info":
        return <Info className="h-4 w-4 text-blue-500" />
      default:
        return <Bell className="h-4 w-4 text-slate-500" />
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "border-l-red-500 bg-red-500/5"
      case "high":
        return "border-l-orange-500 bg-orange-500/5"
      case "normal":
        return "border-l-blue-500 bg-blue-500/5"
      case "low":
        return "border-l-gray-500 bg-gray-500/5"
      default:
        return "border-l-blue-500 bg-blue-500/5"
    }
  }

  const markAsRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)))
  }

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
  }

  const deleteNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  // 模拟实时通知
  useEffect(() => {
    const interval = setInterval(() => {
      const randomNotifications = [
        {
          type: "info" as const,
          title: "新订单",
          message: "收到新的包厢预订",
          department: "前厅部",
          priority: "normal" as const,
        },
        {
          type: "warning" as const,
          title: "设备检查",
          message: "定期设备检查提醒",
          department: "技术部",
          priority: "normal" as const,
        },
      ]

      if (Math.random() > 0.7) {
        const randomNotification = randomNotifications[Math.floor(Math.random() * randomNotifications.length)]
        const newNotification: Notification = {
          id: Date.now().toString(),
          ...randomNotification,
          timestamp: new Date(),
          isRead: false,
        }
        setNotifications((prev) => [newNotification, ...prev])
      }
    }, 30000) // 每30秒检查一次

    return () => clearInterval(interval)
  }, [])

  return (
    <>
      {/* 通知按钮 */}
      <Button variant="ghost" size="icon" onClick={() => setIsOpen(!isOpen)} className="relative">
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center bg-red-500 text-white text-xs">
            {unreadCount > 99 ? "99+" : unreadCount}
          </Badge>
        )}
        {urgentCount > 0 && (
          <div className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full animate-pulse"></div>
        )}
      </Button>

      {/* 通知面板 */}
      {isOpen && (
        <Card className="fixed top-16 right-4 w-96 max-h-[600px] bg-slate-900/95 border-slate-700/50 backdrop-blur-sm shadow-2xl z-50">
          <CardHeader className="pb-2 border-b border-slate-700/50">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-slate-100">通知中心</CardTitle>
              <div className="flex items-center space-x-2">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={markAllAsRead}
                    className="text-xs text-cyan-400 hover:text-cyan-300"
                  >
                    全部已读
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="h-6 w-6">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {unreadCount > 0 && (
              <div className="flex items-center space-x-2 text-sm">
                <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/50">
                  {unreadCount} 条未读
                </Badge>
                {urgentCount > 0 && (
                  <Badge variant="outline" className="bg-red-600/20 text-red-300 border-red-600/50">
                    <Zap className="h-3 w-3 mr-1" />
                    {urgentCount} 条紧急
                  </Badge>
                )}
              </div>
            )}
          </CardHeader>

          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>暂无通知</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-700/50">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-4 border-l-4 ${getPriorityColor(notification.priority)} ${
                        !notification.isRead ? "bg-slate-800/30" : ""
                      } hover:bg-slate-800/50 transition-colors`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3 flex-1">
                          <div className="mt-1">{getNotificationIcon(notification.type)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2 mb-1">
                              <h4
                                className={`text-sm font-medium ${
                                  !notification.isRead ? "text-slate-100" : "text-slate-300"
                                }`}
                              >
                                {notification.title}
                              </h4>
                              {!notification.isRead && <div className="h-2 w-2 bg-cyan-500 rounded-full"></div>}
                            </div>
                            <p className="text-sm text-slate-400 mb-2">{notification.message}</p>
                            <div className="flex items-center space-x-2">
                              {notification.department && (
                                <Badge
                                  variant="outline"
                                  className="text-xs bg-slate-800/50 text-slate-400 border-slate-600"
                                >
                                  {notification.department}
                                </Badge>
                              )}
                              <span className="text-xs text-slate-500 flex items-center">
                                <Clock className="h-3 w-3 mr-1" />
                                {notification.timestamp.toLocaleTimeString()}
                              </span>
                            </div>
                            {notification.actionRequired && (
                              <div className="mt-2 flex space-x-2">
                                <Button size="sm" className="bg-cyan-600 hover:bg-cyan-700 text-xs">
                                  立即处理
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs border-slate-600"
                                  onClick={() => markAsRead(notification.id)}
                                >
                                  标记已读
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteNotification(notification.id)}
                          className="h-6 w-6 text-slate-400 hover:text-slate-100"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </>
  )
}
