import { create } from "zustand"
import type { Session, Store } from "@/lib/types"
import { getSession, refreshSession as requestSessionRefresh, assertValidSession } from "@/lib/services/session"
import { StoreScopeError, resolveCurrentStore } from "@/lib/services/store-scope"

export type SessionStatus = "idle" | "loading" | "ready" | "error"

interface StoreContextState {
  session: Session | null
  stores: Store[]
  currentStoreId: string | null
  currentStore: Store | null
  status: SessionStatus
  error: string | null
  /** 加载会话；默认从 API/Mock 获取，测试可注入 loader。 */
  loadSession: (loader?: () => Promise<Session>, options?: { force?: boolean }) => Promise<void>
  /** 滑动续期；失败时进入 error（由 UI 引导重新登录）。测试可注入 loader。 */
  refreshSession: (loader?: () => Promise<Session>) => Promise<void>
  /** 切换门店：只允许会话授权列表内的门店，禁止静默回退。 */
  switchStore: (storeId: string) => void
  clearError: () => void
  reset: () => void
}

const initialState = {
  session: null,
  stores: [],
  currentStoreId: null,
  currentStore: null,
  status: "idle" as SessionStatus,
  error: null,
}

export const useStoreContextStore = create<StoreContextState>((set, get) => ({
  ...initialState,

  loadSession: async (loader = getSession, options = {}) => {
    if (!options.force && get().status === "ready") {
      return
    }

    set({ status: "loading", error: null })

    try {
      const session = assertValidSession(await loader())
      const store = resolveCurrentStore(session)
      set({
        session,
        stores: session.stores,
        currentStoreId: store.id,
        currentStore: store,
        status: "ready",
        error: null,
      })
    } catch (error) {
      const message =
        error instanceof StoreScopeError || error instanceof Error ? error.message : "会话加载失败"
      set({ ...initialState, status: "error", error: message })
      throw error
    }
  },

  refreshSession: async (loader = requestSessionRefresh) => {
    const currentSession = get().session
    if (!currentSession) return

    try {
      const session = assertValidSession(await loader())
      // 续期后门店授权可能变化：优先保留当前门店，失效则回退到会话默认门店。
      let store: Store
      try {
        store = resolveCurrentStore(session, get().currentStoreId ?? undefined)
      } catch {
        store = resolveCurrentStore(session)
      }
      set({
        session,
        stores: session.stores,
        currentStoreId: store.id,
        currentStore: store,
        status: "ready",
        error: null,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "会话刷新失败"
      set({ status: "error", error: message })
      throw error
    }
  },

  switchStore: (storeId) => {
    const session = get().session
    if (!session) {
      const error = new StoreScopeError("会话尚未加载，无法切换门店", "invalid_session")
      set({ error: error.message })
      throw error
    }

    try {
      const store = resolveCurrentStore(session, storeId)
      set({
        currentStoreId: store.id,
        currentStore: store,
        error: null,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "切换门店失败"
      set({ error: message })
      throw error
    }
  },

  clearError: () => set({ error: null }),

  reset: () => set({ ...initialState }),
}))
