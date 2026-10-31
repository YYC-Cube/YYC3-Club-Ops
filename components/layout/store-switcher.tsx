"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { apiClient } from "@/lib/api/client"
import { runtimeConfig } from "@/lib/config/runtime"
import { useStoreContextStore } from "@/lib/stores/useStoreContextStore"

const IS_MOCK = runtimeConfig.useMock

export function StoreSwitcher() {
  const router = useRouter()
  const status = useStoreContextStore((state) => state.status)
  const session = useStoreContextStore((state) => state.session)
  const stores = useStoreContextStore((state) => state.stores)
  const currentStoreId = useStoreContextStore((state) => state.currentStoreId)
  const currentStore = useStoreContextStore((state) => state.currentStore)
  const error = useStoreContextStore((state) => state.error)
  const loadSession = useStoreContextStore((state) => state.loadSession)
  const switchStore = useStoreContextStore((state) => state.switchStore)
  const reset = useStoreContextStore((state) => state.reset)

  if (status === "idle" || status === "loading") {
    return <p className="text-[10px] text-slate-500">正在加载门店上下文...</p>
  }

  if (status === "error" || !currentStore) {
    return (
      <div className="space-y-2" role="alert">
        <p className="text-[10px] text-rose-300">{error ?? "门店上下文未就绪"}</p>
        <Button
          size="sm"
          variant="outline"
          className="h-7 w-full text-[10px]"
          onClick={() => {
            void loadSession(undefined, { force: true }).catch(() => {})
          }}
        >
          重试加载会话
        </Button>
        <Link href="/login" className="block text-center text-[10px] text-cyan-300 hover:underline">
          去登录
        </Link>
      </div>
    )
  }

  const handleSwitch = (storeId: string) => {
    try {
      switchStore(storeId)
    } catch {
      // 错误由 store 统一记录并在下方展示，禁止静默回退。
    }
  }

  const handleLogout = async () => {
    try {
      await apiClient.logout()
    } catch {
      // 即使接口失败也清理本地上下文并回到登录页
    } finally {
      reset()
      router.replace("/login")
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[10px] text-slate-500">{session?.tenant.name}</span>
        {IS_MOCK ? (
          <Badge variant="outline" className="shrink-0 border-amber-500/40 px-1 py-0 text-[9px] text-amber-300">
            Mock
          </Badge>
        ) : null}
      </div>
      <label className="sr-only" htmlFor="store-switcher">
        切换门店
      </label>
      <select
        id="store-switcher"
        aria-label="切换门店"
        value={currentStoreId ?? ""}
        onChange={(event) => handleSwitch(event.target.value)}
        className="h-8 w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
      >
        {stores.map((store) => (
          <option key={store.id} value={store.id}>
            {store.name}
          </option>
        ))}
      </select>
      {error ? (
        <p className="text-[10px] text-rose-300" role="alert">
          {error}
        </p>
      ) : null}
      <p className="truncate text-[10px] text-slate-500">
        门店 ID：{currentStore.id} · {currentStore.timezone}
      </p>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-full text-[10px] text-slate-400"
        onClick={() => {
          void handleLogout()
        }}
      >
        退出登录
      </Button>
    </div>
  )
}
