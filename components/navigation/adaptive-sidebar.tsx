"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Search, Star, Clock, TrendingUp, SortAsc, ChevronDown, Pin, PinOff, EyeOff } from "lucide-react"

interface SidebarItem {
  id: string
  label: string
  icon: any
  path?: string
  children?: SidebarItem[]
  metadata: {
    usage: number
    lastAccessed: Date
    isPinned: boolean
    isHidden: boolean
    category: string
    priority: "high" | "medium" | "low"
  }
}

interface AdaptiveSidebarProps {
  items: SidebarItem[]
  collapsed: boolean
  onItemClick?: (item: SidebarItem) => void
  onTogglePin?: (itemId: string) => void
  onToggleHidden?: (itemId: string) => void
}

export default function AdaptiveSidebar({
  items,
  collapsed,
  onItemClick,
  onTogglePin,
  onToggleHidden,
}: AdaptiveSidebarProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [sortBy, setSortBy] = useState<"usage" | "name" | "recent">("usage")
  const [filterBy, setFilterBy] = useState<"all" | "pinned" | "recent">("all")
  // 「最近访问」判定基准时间：挂载时快照，避免 render 期调用 Date.now()（react-hooks/purity）
  const [recentThreshold] = useState(() => Date.now())
  const [expandedItems, setExpandedItems] = useState<string[]>([])

  // 智能排序和过滤
  const processItems = (items: SidebarItem[]): SidebarItem[] => {
    const filtered = items.filter((item) => {
      if (item.metadata.isHidden) return false

      const matchesSearch = searchTerm === "" || item.label.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesFilter =
        filterBy === "all" ||
        (filterBy === "pinned" && item.metadata.isPinned) ||
        (filterBy === "recent" && Date.now() - item.metadata.lastAccessed.getTime() < 24 * 60 * 60 * 1000)

      return matchesSearch && matchesFilter
    })

    // 排序逻辑
    filtered.sort((a, b) => {
      // 置顶项目优先
      if (a.metadata.isPinned && !b.metadata.isPinned) return -1
      if (!a.metadata.isPinned && b.metadata.isPinned) return 1

      switch (sortBy) {
        case "usage":
          return b.metadata.usage - a.metadata.usage
        case "recent":
          return b.metadata.lastAccessed.getTime() - a.metadata.lastAccessed.getTime()
        case "name":
          return a.label.localeCompare(b.label)
        default:
          return 0
      }
    })

    return filtered.map((item) => ({
      ...item,
      children: item.children ? processItems(item.children) : undefined,
    }))
  }

  const processedItems = processItems(items)

  const toggleExpanded = (itemId: string) => {
    setExpandedItems((prev) => (prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]))
  }

  const renderSidebarItem = (item: SidebarItem, level = 0) => {
    const isExpanded = expandedItems.includes(item.id)
    const hasChildren = item.children && item.children.length > 0

    return (
      <div key={item.id} className="w-full">
        <div className="group relative">
          <Button
            variant="ghost"
            className={`w-full justify-start h-auto py-2 px-3 ${
              level > 0 ? `ml-${level * 4}` : ""
            } text-slate-300 hover:text-slate-100 hover:bg-slate-800/50`}
            onClick={() => {
              if (hasChildren) {
                toggleExpanded(item.id)
              } else {
                onItemClick?.(item)
              }
            }}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center space-x-2">
                <item.icon className={`h-4 w-4 ${collapsed ? "mx-auto" : ""}`} />
                {!collapsed && (
                  <>
                    <span className="text-sm font-medium">{item.label}</span>

                    {/* 使用频率指示器 */}
                    {item.metadata.usage > 80 && (
                      <Badge className="bg-red-500/20 text-red-400 border-red-500/50 text-xs">热门</Badge>
                    )}

                    {/* 置顶指示器 */}
                    {item.metadata.isPinned && <Pin className="h-3 w-3 text-yellow-500" />}

                    {/* 最近访问指示器 */}
                    {recentThreshold - item.metadata.lastAccessed.getTime() < 60 * 60 * 1000 && (
                      <div className="h-2 w-2 bg-green-500 rounded-full" />
                    )}
                  </>
                )}
              </div>

              {!collapsed && hasChildren && (
                <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
              )}
            </div>
          </Button>

          {/* 悬浮操作菜单 */}
          {!collapsed && (
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation()
                  onTogglePin?.(item.id)
                }}
              >
                {item.metadata.isPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleHidden?.(item.id)
                }}
              >
                <EyeOff className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>

        {/* 子项目 */}
        {hasChildren && isExpanded && (
          <div className="space-y-1">{item.children?.map((child) => renderSidebarItem(child, level + 1))}</div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* 搜索和过滤控制 */}
      {!collapsed && (
        <div className="p-3 border-b border-slate-700/50 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="搜索功能..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-slate-800/50 border-slate-600 text-slate-100"
            />
          </div>

          <div className="flex space-x-2">
            <Button
              variant={sortBy === "usage" ? "default" : "outline"}
              size="sm"
              onClick={() => setSortBy("usage")}
              className="text-xs flex-1"
            >
              <TrendingUp className="h-3 w-3 mr-1" />
              使用率
            </Button>

            <Button
              variant={sortBy === "recent" ? "default" : "outline"}
              size="sm"
              onClick={() => setSortBy("recent")}
              className="text-xs flex-1"
            >
              <Clock className="h-3 w-3 mr-1" />
              最近
            </Button>

            <Button
              variant={sortBy === "name" ? "default" : "outline"}
              size="sm"
              onClick={() => setSortBy("name")}
              className="text-xs flex-1"
            >
              <SortAsc className="h-3 w-3 mr-1" />
              名称
            </Button>
          </div>

          <div className="flex space-x-2">
            <Button
              variant={filterBy === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterBy("all")}
              className="text-xs flex-1"
            >
              全部
            </Button>

            <Button
              variant={filterBy === "pinned" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterBy("pinned")}
              className="text-xs flex-1"
            >
              <Pin className="h-3 w-3 mr-1" />
              置顶
            </Button>

            <Button
              variant={filterBy === "recent" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterBy("recent")}
              className="text-xs flex-1"
            >
              <Star className="h-3 w-3 mr-1" />
              最近
            </Button>
          </div>
        </div>
      )}

      {/* 导航项目列表 */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">{processedItems.map((item) => renderSidebarItem(item))}</div>
      </ScrollArea>

      {/* 统计信息 */}
      {!collapsed && (
        <div className="p-3 border-t border-slate-700/50 text-xs text-slate-400">
          <div className="flex justify-between">
            <span>显示 {processedItems.length} 项</span>
            <span>共 {items.length} 功能</span>
          </div>
        </div>
      )}
    </div>
  )
}
