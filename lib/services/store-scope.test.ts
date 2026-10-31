import { describe, expect, it } from "vitest"
import { PREVIEW_SESSION, STORE_FLAGSHIP_ID, STORE_RIVER_ID } from "@/lib/mocks/preview-session"
import {
  StoreScopeError,
  assertEntityStore,
  assertStoreAccess,
  isStoreAllowed,
  resolveCurrentStore,
} from "@/lib/services/store-scope"

describe("store-scope/授权门店", () => {
  it("只允许会话中的同租户门店", () => {
    expect(isStoreAllowed(PREVIEW_SESSION, STORE_FLAGSHIP_ID)).toBe(true)
    expect(isStoreAllowed(PREVIEW_SESSION, STORE_RIVER_ID)).toBe(true)
    expect(isStoreAllowed(PREVIEW_SESSION, "store-unknown")).toBe(false)
  })

  it("assertStoreAccess 拒绝未授权门店", () => {
    expect(() => assertStoreAccess(PREVIEW_SESSION, STORE_RIVER_ID)).not.toThrow()
    expect(() => assertStoreAccess(PREVIEW_SESSION, "store-unknown")).toThrow("无权访问门店")
  })
})

describe("store-scope/解析当前门店", () => {
  it("默认使用会话 currentStoreId", () => {
    const store = resolveCurrentStore(PREVIEW_SESSION)
    expect(store.id).toBe(STORE_FLAGSHIP_ID)
  })

  it("允许显式切换到授权门店", () => {
    const store = resolveCurrentStore(PREVIEW_SESSION, STORE_RIVER_ID)
    expect(store.id).toBe(STORE_RIVER_ID)
  })

  it("未授权门店抛出 forbidden_store，且不静默回退", () => {
    try {
      resolveCurrentStore(PREVIEW_SESSION, "store-unknown")
      throw new Error("不应执行到这里")
    } catch (error) {
      expect(error).toBeInstanceOf(StoreScopeError)
      expect((error as StoreScopeError).code).toBe("forbidden_store")
    }
  })

  it("无门店抛出 no_store", () => {
    try {
      resolveCurrentStore({ ...PREVIEW_SESSION, stores: [], currentStoreId: "" })
      throw new Error("不应执行到这里")
    } catch (error) {
      expect((error as StoreScopeError).code).toBe("no_store")
    }
  })
})

describe("store-scope/实体归属", () => {
  it("拒绝跨门店实体", () => {
    expect(() => assertEntityStore(STORE_FLAGSHIP_ID, STORE_FLAGSHIP_ID)).not.toThrow()
    expect(() => assertEntityStore(STORE_FLAGSHIP_ID, STORE_RIVER_ID)).toThrow("跨门店")
  })
})
