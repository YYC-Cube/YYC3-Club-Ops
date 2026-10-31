import { beforeEach, describe, expect, it } from "vitest"
import { PREVIEW_SESSION, STORE_FLAGSHIP_ID, STORE_RIVER_ID } from "@/lib/mocks/preview-session"
import { useStoreContextStore } from "@/lib/stores/useStoreContextStore"

beforeEach(() => {
  useStoreContextStore.getState().reset()
})

const sessionLoader = async () => PREVIEW_SESSION

describe("useStoreContextStore/加载会话", () => {
  it("加载后确定当前门店与状态", async () => {
    await useStoreContextStore.getState().loadSession(sessionLoader)
    const state = useStoreContextStore.getState()
    expect(state.status).toBe("ready")
    expect(state.session?.tenant.id).toBe(PREVIEW_SESSION.tenant.id)
    expect(state.stores).toHaveLength(2)
    expect(state.currentStoreId).toBe(STORE_FLAGSHIP_ID)
    expect(state.currentStore?.name).toBe("云枢旗舰店")
  })

  it("已 ready 时默认不重复加载", async () => {
    await useStoreContextStore.getState().loadSession(sessionLoader)
    await expect(
      useStoreContextStore.getState().loadSession(async () => {
        throw new Error("不应再次调用")
      }),
    ).resolves.toBeUndefined()
    expect(useStoreContextStore.getState().error).toBeNull()
  })

  it("force 重新加载失败时进入 error 并清空上下文", async () => {
    await useStoreContextStore.getState().loadSession(sessionLoader)
    await expect(
      useStoreContextStore.getState().loadSession(
        async () => {
          throw new Error("会话服务不可用")
        },
        { force: true },
      ),
    ).rejects.toThrow("会话服务不可用")
    const state = useStoreContextStore.getState()
    expect(state.status).toBe("error")
    expect(state.session).toBeNull()
    expect(state.error).toContain("会话服务不可用")
  })

  it("无门店会话被拒绝", async () => {
    await expect(
      useStoreContextStore.getState().loadSession(async () => ({
        ...PREVIEW_SESSION,
        stores: [],
        currentStoreId: "",
      })),
    ).rejects.toThrow("未绑定任何门店")
    expect(useStoreContextStore.getState().status).toBe("error")
  })
})

describe("useStoreContextStore/会话续期", () => {
  it("续期成功后保留当前门店并更新过期时间", async () => {
    await useStoreContextStore.getState().loadSession(sessionLoader)
    useStoreContextStore.getState().switchStore(STORE_RIVER_ID)

    await useStoreContextStore.getState().refreshSession(async () => ({
      ...PREVIEW_SESSION,
      expiresAt: "2026-10-31T18:00:00.000Z",
    }))

    const state = useStoreContextStore.getState()
    expect(state.status).toBe("ready")
    expect(state.currentStoreId).toBe(STORE_RIVER_ID)
    expect(state.session?.expiresAt).toBe("2026-10-31T18:00:00.000Z")
    expect(state.error).toBeNull()
  })

  it("续期后当前门店授权失效时回退到会话默认门店", async () => {
    await useStoreContextStore.getState().loadSession(sessionLoader)
    expect(useStoreContextStore.getState().currentStoreId).toBe(STORE_FLAGSHIP_ID)

    const riverStore = PREVIEW_SESSION.stores.find((store) => store.id === STORE_RIVER_ID)!
    await useStoreContextStore.getState().refreshSession(async () => ({
      ...PREVIEW_SESSION,
      stores: [riverStore],
      currentStoreId: STORE_RIVER_ID,
    }))

    const state = useStoreContextStore.getState()
    expect(state.currentStoreId).toBe(STORE_RIVER_ID)
    expect(state.stores).toHaveLength(1)
    expect(state.error).toBeNull()
  })

  it("续期失败时进入 error 并抛出", async () => {
    await useStoreContextStore.getState().loadSession(sessionLoader)

    await expect(
      useStoreContextStore.getState().refreshSession(async () => {
        throw new Error("会话已过期，请重新登录")
      }),
    ).rejects.toThrow("会话已过期")

    const state = useStoreContextStore.getState()
    expect(state.status).toBe("error")
    expect(state.error).toContain("会话已过期")
  })

  it("未加载会话时续期为无操作", async () => {
    await expect(useStoreContextStore.getState().refreshSession()).resolves.toBeUndefined()
    expect(useStoreContextStore.getState().session).toBeNull()
  })
})

describe("useStoreContextStore/切换门店", () => {
  it("允许切换到授权门店", async () => {
    await useStoreContextStore.getState().loadSession(sessionLoader)
    useStoreContextStore.getState().switchStore(STORE_RIVER_ID)
    const state = useStoreContextStore.getState()
    expect(state.currentStoreId).toBe(STORE_RIVER_ID)
    expect(state.currentStore?.name).toBe("滨江店")
    expect(state.error).toBeNull()
  })

  it("拒绝未授权门店且不回退", async () => {
    await useStoreContextStore.getState().loadSession(sessionLoader)
    expect(() => useStoreContextStore.getState().switchStore("store-unknown")).toThrow("无权访问")
    const state = useStoreContextStore.getState()
    expect(state.currentStoreId).toBe(STORE_FLAGSHIP_ID)
    expect(state.error).toContain("无权访问")
  })

  it("未加载会话时拒绝切换", () => {
    expect(() => useStoreContextStore.getState().switchStore(STORE_RIVER_ID)).toThrow("会话尚未加载")
  })

  it("clearError 清空错误", async () => {
    await useStoreContextStore.getState().loadSession(sessionLoader)
    expect(() => useStoreContextStore.getState().switchStore("store-unknown")).toThrow()
    useStoreContextStore.getState().clearError()
    expect(useStoreContextStore.getState().error).toBeNull()
  })
})
