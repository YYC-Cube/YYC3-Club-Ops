"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Bot, Send, Mic, Paperclip, Minimize2, X, Sparkles, Brain } from "lucide-react"

// mock 消息初始时间戳（react-hooks/purity：render 期不调用 new Date）
const AI_INITIAL_TS = new Date()

interface Message {
  id: string
  type: "user" | "ai" | "system"
  content: string
  timestamp: Date
  status?: "sending" | "sent" | "error"
}

interface AIAssistantProps {
  isMinimized?: boolean
  onToggleMinimize?: () => void
  onClose?: () => void
}

export default function AIAssistant({ isMinimized = false, onToggleMinimize, onClose }: AIAssistantProps) {
  // 消息 id 计数器（事件回调内递增；替代 Date.now，react-hooks/purity）
  const idCounter = useRef(0)
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      type: "ai",
      content: "您好！我是智慧商家AI助手，可以帮您处理各种业务问题。请问有什么可以为您服务的吗？",
      timestamp: AI_INITIAL_TS,
    },
    {
      id: "2",
      type: "system",
      content: "AI助手已连接到您的业务系统，可以实时查询数据和执行操作。",
      timestamp: AI_INITIAL_TS,
    },
  ])
  const [inputValue, setInputValue] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return

    const userMessage: Message = {
      id: `user_msg_${(idCounter.current += 1)}`,
      type: "user",
      content: inputValue,
      timestamp: new Date(),
      status: "sending",
    }

    setMessages((prev) => [...prev, userMessage])
    setInputValue("")
    setIsTyping(true)

    // 模拟AI响应
    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        type: "ai",
        content: getAIResponse(inputValue),
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev.slice(0, -1), { ...userMessage, status: "sent" }, aiResponse])
      setIsTyping(false)
    }, 1500)
  }

  const getAIResponse = (_input: string): string => {
    const responses = [
      "根据您的查询，我为您找到了相关信息。当前营业数据显示今日收入较昨日增长15%。",
      "我已经为您分析了员工排班情况，建议在晚高峰时段增加2名服务员。",
      "检测到包厢A08有客户呼叫服务，已通知就近的服务员前往处理。",
      "根据历史数据分析，建议您在周末推出特价套餐活动，预计可提升20%的营业额。",
      "我已经帮您生成了本周的营业报表，数据显示客流量稳步上升。",
    ]
    return responses[Math.floor(Math.random() * responses.length)]
  }

  const quickActions = [
    { label: "查看今日营业额", icon: "💰" },
    { label: "员工排班查询", icon: "👥" },
    { label: "包厢状态总览", icon: "🏠" },
    { label: "库存预警提醒", icon: "📦" },
  ]

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          onClick={onToggleMinimize}
          className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-full w-14 h-14 shadow-lg"
        >
          <Bot className="h-6 w-6" />
        </Button>
      </div>
    )
  }

  return (
    <Card className="fixed bottom-4 right-4 w-96 h-[600px] bg-slate-900/95 border-slate-700/50 backdrop-blur-sm shadow-2xl z-50">
      <CardHeader className="pb-2 border-b border-slate-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="relative">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-gradient-to-r from-purple-600 to-blue-600 text-white">
                  <Bot className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="absolute -top-1 -right-1 h-3 w-3 bg-green-500 rounded-full border-2 border-slate-900"></div>
            </div>
            <div>
              <CardTitle className="text-sm text-slate-100">AI智能助手</CardTitle>
              <div className="flex items-center space-x-1">
                <Sparkles className="h-3 w-3 text-purple-400" />
                <span className="text-xs text-slate-400">在线服务</span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onToggleMinimize}>
              <Minimize2 className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 flex flex-col h-[calc(600px-80px)]">
        {/* 消息区域 */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    message.type === "user"
                      ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white"
                      : message.type === "ai"
                        ? "bg-slate-800/50 text-slate-100 border border-slate-700/50"
                        : "bg-purple-900/30 text-purple-300 border border-purple-700/50"
                  }`}
                >
                  {message.type === "ai" && (
                    <div className="flex items-center space-x-1 mb-1">
                      <Brain className="h-3 w-3 text-purple-400" />
                      <span className="text-xs text-purple-400">AI助手</span>
                    </div>
                  )}
                  <div className="text-sm">{message.content}</div>
                  <div className="text-xs opacity-70 mt-1">
                    {message.timestamp.toLocaleTimeString()}
                    {message.status === "sending" && " • 发送中..."}
                  </div>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-slate-800/50 text-slate-100 border border-slate-700/50 rounded-lg p-3">
                  <div className="flex items-center space-x-1">
                    <Brain className="h-3 w-3 text-purple-400" />
                    <span className="text-xs text-purple-400">AI助手正在思考</span>
                  </div>
                  <div className="flex space-x-1 mt-2">
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"></div>
                    <div
                      className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"
                      style={{ animationDelay: "0.1s" }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    ></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* 快捷操作 */}
        <div className="p-3 border-t border-slate-700/50">
          <div className="text-xs text-slate-400 mb-2">快捷操作</div>
          <div className="grid grid-cols-2 gap-2">
            {quickActions.map((action, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                className="text-xs border-slate-600 hover:bg-slate-800/50 justify-start"
                onClick={() => setInputValue(action.label)}
              >
                <span className="mr-1">{action.icon}</span>
                {action.label}
              </Button>
            ))}
          </div>
        </div>

        {/* 输入区域 */}
        <div className="p-3 border-t border-slate-700/50">
          <div className="flex items-center space-x-2">
            <div className="flex-1 relative">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="输入您的问题..."
                className="bg-slate-800/50 border-slate-600 text-slate-100 pr-20"
                onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
              />
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex space-x-1">
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <Paperclip className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <Mic className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <Button
              onClick={handleSendMessage}
              disabled={!inputValue.trim()}
              className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
