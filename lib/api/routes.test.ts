import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { API_PATHS, apiRoutes } from "@/lib/api/routes"

describe("api/routes", () => {
  it("路径构造带门店作用域并正确编码", () => {
    expect(apiRoutes.session()).toBe("/auth/session")
    expect(apiRoutes.login()).toBe("/auth/login")
    expect(apiRoutes.logout()).toBe("/auth/logout")
    expect(apiRoutes.refresh()).toBe("/auth/refresh")
    expect(apiRoutes.authAudit()).toBe("/admin/auth-audit")
    expect(apiRoutes.authAudit(10)).toBe("/admin/auth-audit?limit=10")
    expect(apiRoutes.forceLogout("user-demo-cashier")).toBe("/admin/users/user-demo-cashier/force-logout")
    expect(apiRoutes.stores()).toBe("/stores")
    expect(apiRoutes.health()).toBe("/health")
    expect(apiRoutes.rooms("store-demo-001")).toBe("/stores/store-demo-001/rooms")
    expect(apiRoutes.room("store/001", "room 01")).toBe("/stores/store%2F001/rooms/room%2001")
    expect(apiRoutes.roomStatus("s1", "r1")).toBe("/stores/s1/rooms/r1/status")
    expect(apiRoutes.startRoom("s1", "r1")).toBe("/stores/s1/rooms/r1/start")
    expect(apiRoutes.checkoutRoom("s1", "r1")).toBe("/stores/s1/rooms/r1/checkout")
    expect(apiRoutes.cleanRoom("s1", "r1")).toBe("/stores/s1/rooms/r1/clean")
  })

  it("拒绝空门店/包厢参数", () => {
    expect(() => apiRoutes.rooms("  ")).toThrow("storeId")
    expect(() => apiRoutes.room("s1", "")).toThrow("roomId")
  })

  it("所有路径都出现在 OpenAPI 契约中", () => {
    const spec = readFileSync(path.resolve(process.cwd(), "contracts/openapi.yaml"), "utf8")
    for (const pathTemplate of Object.values(API_PATHS)) {
      expect(spec).toContain(`\n  ${pathTemplate}:`)
    }
  })
})
