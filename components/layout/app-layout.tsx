"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { StoreSwitcher } from "@/components/layout/store-switcher"
import { useStoreContextStore } from "@/lib/stores/useStoreContextStore"
import {
  Home,
  CreditCard,
  BarChart3,
  Users,
  Package,
  Settings,
  ShoppingCart,
  Warehouse,
  Menu,
  X,
  Bot,
  Bell,
  type LucideIcon,
} from "lucide-react"

interface NavItem {
  id: string
  label: string
  icon: LucideIcon
  href: string
  group: "pos" | "admin"
  badge?: string | number
  children?: NavItem[]
}

const navItems: NavItem[] = [
  { id: "rooms", label: "包厢管理", icon: Home, href: "/rooms", group: "pos", badge: "核心" },
  { id: "pos", label: "点单收银", icon: CreditCard, href: "/pos", group: "pos", badge: "热门" },
  { id: "dashboard", label: "经营看板", icon: BarChart3, href: "/dashboard", group: "admin" },
  { id: "reports", label: "报表分析", icon: ShoppingCart, href: "/reports", group: "admin" },
  { id: "members", label: "会员管理", icon: Users, href: "/members", group: "admin" },
  { id: "inventory", label: "库存管理", icon: Warehouse, href: "/inventory", group: "admin" },
  { id: "staff", label: "员工管理", icon: Package, href: "/staff", group: "admin" },
  { id: "settings", label: "系统设置", icon: Settings, href: "/settings", group: "admin" },
]

const posItems = navItems.filter((i) => i.group === "pos")
const adminItems = navItems.filter((i) => i.group === "admin")

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const session = useStoreContextStore((state) => state.session)
  const currentStore = useStoreContextStore((state) => state.currentStore)
  const sessionStatus = useStoreContextStore((state) => state.status)
  const loadSession = useStoreContextStore((state) => state.loadSession)
  const refreshSession = useStoreContextStore((state) => state.refreshSession)
  const sessionExpiresAt = session?.expiresAt

  const isPosRoute = pathname === "/" || pathname.startsWith("/rooms") || pathname.startsWith("/pos")
  const routeGroup: "pos" | "admin" = isPosRoute ? "pos" : "admin"
  const [activeGroup, setActiveGroup] = useState<"pos" | "admin">(routeGroup)

  useEffect(() => {
    // 路由变化时自动切到对应分组，避免管理端页面看不到自己的导航入口。
    setActiveGroup(routeGroup)
  }, [routeGroup])

  useEffect(() => {
    if (sessionStatus === "idle" && pathname !== "/login") {
      void loadSession().catch(() => {})
    }
  }, [loadSession, pathname, sessionStatus])

  useEffect(() => {
    // 滑动续期：在到期前 30 分钟（最长不超过剩余时长的一半）自动刷新一次。
    if (sessionStatus !== "ready" || !sessionExpiresAt) return
    const remaining = new Date(sessionExpiresAt).getTime() - Date.now()
    if (remaining <= 0) return

    const lead = Math.min(30 * 60 * 1000, Math.max(60_000, Math.floor(remaining / 2)))
    const delay = Math.max(60_000, remaining - lead)
    const timer = setTimeout(() => {
      void refreshSession().catch(() => {})
    }, delay)
    return () => clearTimeout(timer)
  }, [refreshSession, sessionExpiresAt, sessionStatus])

  useEffect(() => {
    // 标签页长时间挂起后回到前台：若临近过期则立即续期。
    if (sessionStatus !== "ready" || !sessionExpiresAt) return
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return
      const remaining = new Date(sessionExpiresAt).getTime() - Date.now()
      if (remaining > 0 && remaining < 60 * 60 * 1000) {
        void refreshSession().catch(() => {})
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => document.removeEventListener("visibilitychange", onVisibilityChange)
  }, [refreshSession, sessionExpiresAt, sessionStatus])

  if (pathname === "/login") {
    return <div className="min-h-screen bg-slate-950 text-slate-100">{children}</div>
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      <aside
        className={`${sidebarOpen ? "w-16 md:w-60" : "w-16"} shrink-0 transition-all duration-300 bg-slate-900 border-r border-slate-800 flex flex-col`}
      >
        <div className="p-3 flex items-center justify-between border-b border-slate-800">
          {sidebarOpen && (
            <span className="hidden font-bold text-sm text-cyan-400 md:inline">
              YYC³ <span className="text-[10px] font-normal text-slate-500">Club Ops</span>
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={sidebarOpen ? "收起侧边栏" : "展开侧边栏"}
            className="h-7 w-7"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>

        <div className="flex border-b border-slate-800" role="tablist" aria-label="业务分组">
          <button
            type="button"
            role="tab"
            aria-selected={activeGroup === "pos"}
            onClick={() => setActiveGroup("pos")}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeGroup === "pos" ? "text-cyan-400 border-b-2 border-cyan-400" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {sidebarOpen && <span className="hidden md:inline">前台收银</span>}
            <CreditCard className={`mx-auto h-4 w-4 ${sidebarOpen ? "md:hidden" : ""}`} aria-hidden="true" />
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeGroup === "admin"}
            onClick={() => setActiveGroup("admin")}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeGroup === "admin"
                ? "text-violet-400 border-b-2 border-violet-400"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {sidebarOpen && <span className="hidden md:inline">运维管理</span>}
            <BarChart3 className={`mx-auto h-4 w-4 ${sidebarOpen ? "md:hidden" : ""}`} aria-hidden="true" />
          </button>
        </div>

        {sidebarOpen && (
          <div className="hidden border-b border-slate-800 p-2 md:block">
            <StoreSwitcher />
          </div>
        )}

        <ScrollArea className="flex-1">
          <nav className="p-2 space-y-1">
            {(activeGroup === "pos" ? posItems : adminItems).map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                  }`}
                >
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {sidebarOpen && (
                    <>
                      <span className="hidden flex-1 md:inline">{item.label}</span>
                      {item.badge && (
                        <Badge variant="secondary" className="hidden text-[10px] px-1.5 py-0 md:inline-flex">
                          {item.badge}
                        </Badge>
                      )}
                    </>
                  )}
                </Link>
              )
            })}
          </nav>
        </ScrollArea>

        <div className="p-3 border-t border-slate-800">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-cyan-600 flex items-center justify-center text-xs font-bold">
              {session?.user.name?.slice(0, 1) ?? "?"}
            </div>
            {sidebarOpen && (
              <div className="hidden flex-1 min-w-0 md:block">
                <p className="text-xs font-medium truncate">{session?.user.name ?? "未登录"}</p>
                <p className="text-[10px] text-slate-500 truncate">
                  {sessionStatus === "error" ? "会话未就绪" : currentStore?.name ?? "未选择门店"}
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-10 bg-slate-900/80 backdrop-blur border-b border-slate-800 flex items-center justify-between px-4">
          <div className="flex min-w-0 items-center gap-2 text-xs text-slate-400">
            <span className="shrink-0 rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">开发预览 · 非生产</span>
            <span className="truncate">{isPosRoute ? "前台收银" : "运维管理"}</span>
            <span>/</span>
            <span className="truncate text-slate-200">{navItems.find((i) => pathname === i.href || pathname.startsWith(i.href + "/"))?.label || "首页"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-400"
              aria-label="通知（即将上线）"
              title="通知（即将上线）"
              disabled
            >
              <Bell className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-400"
              aria-label="AI 助手（即将上线）"
              title="AI 助手（即将上线）"
              disabled
            >
              <Bot className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <div className="flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  )
}
