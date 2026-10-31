import { beforeEach, describe, expect, it, vi } from "vitest"
import { PREVIEW_SESSION, STORE_FLAGSHIP_ID } from "@/lib/mocks/preview-session"

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
}))

vi.mock("@/lib/api/client", () => {
  class ApiError extends Error {
    constructor(
      message: string,
      public readonly status = 0,
      public readonly code = "api_error",
    ) {
      super(message)
      this.name = "ApiError"
    }
  }
  return {
    apiClient: { getSession: mocks.getSession, refreshSession: mocks.refreshSession },
    ApiError,
  }
})

import { ApiError } from "@/lib/api/client"
import { assertValidSession, getSession, refreshSession } from "@/lib/services/session"
import { StoreScopeError } from "@/lib/services/store-scope"

beforeEach(() => {
  mocks.getSession.mockReset()
  mocks.refreshSession.mockReset()
})

describe("session-service/getSession", () => {
  it("返回合法会话", async () => {
    mocks.getSession.mockResolvedValue({ success: true, data: PREVIEW_SESSION })
    const session = await getSession()
    expect(session.currentStoreId).toBe(STORE_FLAGSHIP_ID)
    expect(session.stores).toHaveLength(2)
  })

  it("空数据时抛出 ApiError", async () => {
    mocks.getSession.mockResolvedValue({ success: true, data: undefined })
    await expect(getSession()).rejects.toThrow("会话数据为空")
    await expect(getSession()).rejects.toBeInstanceOf(ApiError)
  })

  it("无门店时拒绝会话", async () => {
    mocks.getSession.mockResolvedValue({
      success: true,
      data: { ...PREVIEW_SESSION, stores: [], currentStoreId: "" },
    })
    await expect(getSession()).rejects.toThrow("未绑定任何门店")
  })
})

describe("session-service/refreshSession", () => {
  it("返回续期后的合法会话", async () => {
    mocks.refreshSession.mockResolvedValue({
      success: true,
      data: { ...PREVIEW_SESSION, expiresAt: "2026-10-31T18:00:00.000Z" },
    })
    const session = await refreshSession()
    expect(session.expiresAt).toBe("2026-10-31T18:00:00.000Z")
    expect(session.currentStoreId).toBe(STORE_FLAGSHIP_ID)
  })

  it("空数据时抛出 ApiError", async () => {
    mocks.refreshSession.mockResolvedValue({ success: true, data: undefined })
    await expect(refreshSession()).rejects.toThrow("会话刷新失败")
    await expect(refreshSession()).rejects.toBeInstanceOf(ApiError)
  })

  it("续期返回非法会话时拒绝", async () => {
    mocks.refreshSession.mockResolvedValue({
      success: true,
      data: { ...PREVIEW_SESSION, currentStoreId: "store-unknown" },
    })
    await expect(refreshSession()).rejects.toThrow("当前门店不在授权列表")
  })
})

describe("session-service/assertValidSession", () => {
  it("拒绝当前门店不在授权列表", () => {
    expect(() =>
      assertValidSession({ ...PREVIEW_SESSION, currentStoreId: "store-unknown" }),
    ).toThrow("当前门店不在授权列表")
  })

  it("拒绝跨租户门店", () => {
    expect(() =>
      assertValidSession({
        ...PREVIEW_SESSION,
        stores: PREVIEW_SESSION.stores.map((store, index) =>
          index === 0 ? { ...store, tenantId: "tenant-other" } : store,
        ),
      }),
    ).toThrow("跨租户")
  })

  it("拒绝缺少租户/用户", () => {
    try {
      assertValidSession({ ...PREVIEW_SESSION, tenant: undefined as never })
      throw new Error("不应执行到这里")
    } catch (error) {
      expect(error).toBeInstanceOf(StoreScopeError)
      expect((error as StoreScopeError).code).toBe("invalid_session")
    }
  })
})
