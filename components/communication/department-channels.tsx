"use client"

import { useState } from "react"

// mock 会话/消息时间戳提为模块级常量（react-hooks/purity：render 期不调用 new Date/Date.now）
const DC_TS_5MIN = new Date(Date.now() - 5 * 60000)
const DC_TS_15MIN = new Date(Date.now() - 15 * 60000)
const DC_TS_30MIN = new Date(Date.now() - 30 * 60000)
const DC_TS_45MIN = new Date(Date.now() - 45 * 60000)
const DC_TS_60MIN = new Date(Date.now() - 60 * 60000)
const DC_TS_2H = new Date(Date.now() - 2 * 60 * 60000)
const DC_TS_90MIN = new Date(Date.now() - 90 * 60000)
const DC_TS_75MIN = new Date(Date.now() - 75 * 60000)
const DC_TS_10MIN = new Date(Date.now() - 10 * 60000)
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Hash,
  Send,
  Phone,
  Video,
  Bell,
  Search,
  Settings,
  UserPlus,
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  Zap,
} from "lucide-react"

interface Channel {
  id: string
  name: string
  type: "department" | "project" | "emergency" | "general"
  department: string
  memberCount: number
  unreadCount: number
  lastMessage?: {
    sender: string
    content: string
    timestamp: Date
  }
  isOnline: boolean
  priority: "low" | "normal" | "high" | "urgent"
}

interface Message {
  id: string
  sender: string
  content: string
  timestamp: Date
  type: "text" | "system" | "alert"
  avatar?: string
  role?: string
}

export default function DepartmentChannels() {
  const [selectedChannel, setSelectedChannel] = useState<string>("floor-service")
  const [messageInput, setMessageInput] = useState("")
  const [searchTerm, setSearchTerm] = useState("")

  const channels: Channel[] = [
    {
      id: "floor-service",
      name: "楼面服务部",
      type: "department",
      department: "楼面部",
      memberCount: 12,
      unreadCount: 3,
      lastMessage: {
        sender: "张三",
        content: "A08包厢客人需要加冰块",
        timestamp: DC_TS_5MIN,
      },
      isOnline: true,
      priority: "high",
    },
    {
      id: "cashier-team",
      name: "收银团队",
      type: "department",
      department: "前厅部",
      memberCount: 8,
      unreadCount: 1,
      lastMessage: {
        sender: "李四",
        content: "今日营业额已达成目标的85%",
        timestamp: DC_TS_15MIN,
      },
      isOnline: true,
      priority: "normal",
    },
    {
      id: "kitchen-staff",
      name: "出品部",
      type: "department",
      department: "出品部",
      memberCount: 6,
      unreadCount: 0,
      lastMessage: {
        sender: "王五",
        content: "今日特色菜品准备完毕",
        timestamp: DC_TS_30MIN,
      },
      isOnline: true,
      priority: "normal",
    },
    {
      id: "emergency-response",
      name: "紧急响应",
      type: "emergency",
      department: "全部门",
      memberCount: 25,
      unreadCount: 0,
      isOnline: true,
      priority: "urgent",
    },
    {
      id: "management",
      name: "管理层",
      type: "department",
      department: "管理部",
      memberCount: 5,
      unreadCount: 2,
      lastMessage: {
        sender: "赵经理",
        content: "明日晨会议题已发送",
        timestamp: DC_TS_45MIN,
      },
      isOnline: true,
      priority: "high",
    },
    {
      id: "maintenance",
      name: "设备维护",
      type: "project",
      department: "技术部",
      memberCount: 4,
      unreadCount: 1,
      lastMessage: {
        sender: "技术员小刘",
        content: "音响系统检修完成",
        timestamp: DC_TS_60MIN,
      },
      isOnline: true,
      priority: "normal",
    },
  ]

  const messages: Message[] = [
    {
      id: "1",
      sender: "系统通知",
      content: "楼面服务部频道已创建，欢迎大家加入！",
      timestamp: DC_TS_2H,
      type: "system",
    },
    {
      id: "2",
      sender: "张三",
      content: "大家好，我是新来的服务员，请多多指教！",
      timestamp: DC_TS_90MIN,
      type: "text",
      avatar: "/placeholder.svg?height=32&width=32",
      role: "服务员",
    },
    {
      id: "3",
      sender: "李主管",
      content: "欢迎张三！今天的工作安排已经发到群里了，大家注意查看。",
      timestamp: DC_TS_75MIN,
      type: "text",
      avatar: "/placeholder.svg?height=32&width=32",
      role: "主管",
    },
    {
      id: "4",
      sender: "系统警报",
      content: "A08包厢客人按下呼叫按钮，请就近服务员前往处理",
      timestamp: DC_TS_10MIN,
      type: "alert",
    },
    {
      id: "5",
      sender: "张三",
      content: "A08包厢客人需要加冰块，我正在处理",
      timestamp: DC_TS_5MIN,
      type: "text",
      avatar: "/placeholder.svg?height=32&width=32",
      role: "服务员",
    },
  ]

  const currentChannel = channels.find((c) => c.id === selectedChannel)

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "bg-red-500/20 text-red-400 border-red-500/50"
      case "high":
        return "bg-orange-500/20 text-orange-400 border-orange-500/50"
      case "normal":
        return "bg-blue-500/20 text-blue-400 border-blue-500/50"
      case "low":
        return "bg-gray-500/20 text-gray-400 border-gray-500/50"
      default:
        return "bg-blue-500/20 text-blue-400 border-blue-500/50"
    }
  }

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case "urgent":
        return <AlertTriangle className="h-3 w-3" />
      case "high":
        return <Zap className="h-3 w-3" />
      case "normal":
        return <CheckCircle className="h-3 w-3" />
      case "low":
        return <Clock className="h-3 w-3" />
      default:
        return <CheckCircle className="h-3 w-3" />
    }
  }

  const handleSendMessage = () => {
    if (!messageInput.trim()) return
    // 这里处理发送消息的逻辑
    setMessageInput("")
  }

  const filteredChannels = channels.filter(
    (channel) =>
      channel.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      channel.department.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  return (
    <div className="h-full flex">
      {/* 频道列表 */}
      <div className="w-80 border-r border-slate-700/50 bg-slate-900/30">
        <div className="p-4 border-b border-slate-700/50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-slate-100">部门频道</h3>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <UserPlus className="h-4 w-4" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="搜索频道..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-slate-800/50 border-slate-600 text-slate-100"
            />
          </div>
        </div>

        <ScrollArea className="h-[calc(100%-120px)]">
          <div className="p-2">
            {filteredChannels.map((channel) => (
              <div
                key={channel.id}
                onClick={() => setSelectedChannel(channel.id)}
                className={`p-3 rounded-lg cursor-pointer transition-colors mb-2 ${
                  selectedChannel === channel.id ? "bg-slate-800/70 border border-cyan-500/50" : "hover:bg-slate-800/50"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Hash className="h-4 w-4 text-slate-400" />
                    <span className="text-sm font-medium text-slate-200">{channel.name}</span>
                    {channel.isOnline && <div className="h-2 w-2 bg-green-500 rounded-full"></div>}
                  </div>
                  {channel.unreadCount > 0 && (
                    <Badge className="bg-cyan-500 text-white text-xs">{channel.unreadCount}</Badge>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline" className={getPriorityColor(channel.priority)}>
                      {getPriorityIcon(channel.priority)}
                      <span className="ml-1 text-xs">{channel.department}</span>
                    </Badge>
                    <span className="text-xs text-slate-400">{channel.memberCount}人</span>
                  </div>
                </div>

                {channel.lastMessage && (
                  <div className="mt-2 text-xs text-slate-400 truncate">
                    <span className="text-slate-300">{channel.lastMessage.sender}:</span> {channel.lastMessage.content}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* 聊天区域 */}
      <div className="flex-1 flex flex-col">
        {/* 频道头部 */}
        <div className="p-4 border-b border-slate-700/50 bg-slate-900/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Hash className="h-5 w-5 text-cyan-400" />
              <div>
                <h3 className="text-lg font-semibold text-slate-100">{currentChannel?.name}</h3>
                <div className="flex items-center space-x-2">
                  <Badge variant="outline" className={getPriorityColor(currentChannel?.priority || "normal")}>
                    {getPriorityIcon(currentChannel?.priority || "normal")}
                    <span className="ml-1">{currentChannel?.department}</span>
                  </Badge>
                  <span className="text-sm text-slate-400">{currentChannel?.memberCount} 成员在线</span>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="icon">
                <Phone className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon">
                <Video className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon">
                <Bell className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon">
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* 消息区域 */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.map((message) => (
              <div key={message.id} className="flex space-x-3">
                {message.type !== "system" && message.type !== "alert" && (
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={message.avatar || "/placeholder.svg"} />
                    <AvatarFallback className="bg-slate-700 text-cyan-500">{message.sender.charAt(0)}</AvatarFallback>
                  </Avatar>
                )}
                <div className="flex-1">
                  {message.type === "system" && (
                    <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-3">
                      <div className="flex items-center space-x-2">
                        <Shield className="h-4 w-4 text-blue-400" />
                        <span className="text-sm text-blue-300">{message.content}</span>
                      </div>
                    </div>
                  )}
                  {message.type === "alert" && (
                    <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3">
                      <div className="flex items-center space-x-2">
                        <AlertTriangle className="h-4 w-4 text-red-400" />
                        <span className="text-sm text-red-300">{message.content}</span>
                      </div>
                    </div>
                  )}
                  {message.type === "text" && (
                    <div>
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="text-sm font-medium text-slate-200">{message.sender}</span>
                        {message.role && (
                          <Badge variant="outline" className="text-xs bg-slate-800/50 text-slate-400 border-slate-600">
                            {message.role}
                          </Badge>
                        )}
                        <span className="text-xs text-slate-500">{message.timestamp.toLocaleTimeString()}</span>
                      </div>
                      <div className="text-sm text-slate-300">{message.content}</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* 输入区域 */}
        <div className="p-4 border-t border-slate-700/50 bg-slate-900/30">
          <div className="flex items-center space-x-2">
            <div className="flex-1 relative">
              <Input
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder={`在 #${currentChannel?.name} 中发送消息...`}
                className="bg-slate-800/50 border-slate-600 text-slate-100"
                onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
              />
            </div>
            <Button
              onClick={handleSendMessage}
              disabled={!messageInput.trim()}
              className="bg-cyan-600 hover:bg-cyan-700"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
