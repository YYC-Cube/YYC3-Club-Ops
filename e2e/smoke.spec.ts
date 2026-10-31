import { expect, test } from "@playwright/test"

const routes = ["/", "/rooms", "/pos", "/dashboard", "/reports", "/members", "/inventory", "/staff", "/settings"]

test.describe("路由冒烟", () => {
  for (const route of routes) {
    test(`${route} 可访问且无页面异常`, async ({ page }) => {
      const pageErrors: string[] = []
      page.on("pageerror", (error) => pageErrors.push(error.message))

      const response = await page.goto(route, { waitUntil: "networkidle" })
      expect(response?.status()).toBe(200)
      expect(pageErrors).toEqual([])
      await expect(page.locator("body")).toBeVisible()
    })
  }
})

test.describe("包厢核心闭环", () => {
  test("空闲包厢可完成开房 → 结账 → 清台", async ({ page }) => {
    await page.goto("/rooms", { waitUntil: "networkidle" })

    await page.getByRole("button", { name: /VIP-01/ }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText("空闲")

    await dialog.getByRole("button", { name: "开房" }).click()
    await expect(dialog).toContainText("消费中")

    await dialog.getByRole("button", { name: "结账" }).click()
    await expect(dialog).toContainText("待清洁")

    await dialog.getByRole("button", { name: "清洁完成" }).click()
    await expect(dialog).toContainText("空闲")

    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
  })

  test("消费中包厢可进入点单", async ({ page }) => {
    await page.goto("/rooms", { waitUntil: "networkidle" })
    await page.getByRole("button", { name: /VIP-02/ }).click()

    const dialog = page.getByRole("dialog")
    await dialog.getByRole("button", { name: "点单" }).click()

    await expect(page.getByText("POS 收银系统")).toBeVisible()
    await expect(page.getByText("房间: room-fs-vip-02")).toBeVisible()
  })
})

test.describe("导航与响应式", () => {
  test("进入管理端自动显示运维分组", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "networkidle" })
    const sidebar = page.locator("aside nav")
    await expect(sidebar).toContainText("经营看板")
    await expect(sidebar).toContainText("报表分析")
    await expect(page.getByText("开发预览 · 非生产")).toBeVisible()
  })

  test("切换门店后只展示该门店包厢", async ({ page }) => {
    await page.goto("/rooms", { waitUntil: "networkidle" })
    await expect(page.getByRole("button", { name: /VIP-01/ })).toBeVisible()

    await page.getByLabel("切换门店").selectOption({ label: "滨江店" })
    await expect(page.getByRole("button", { name: /滨江-VIP/ })).toBeVisible()
    await expect(page.getByRole("button", { name: /VIP-01/ })).toHaveCount(0)

    await page.getByLabel("切换门店").selectOption({ label: "云枢旗舰店" })
    await expect(page.getByRole("button", { name: /VIP-01/ })).toBeVisible()
    await expect(page.getByRole("button", { name: /滨江-VIP/ })).toHaveCount(0)
  })

  test("390px 无横向溢出", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/rooms", { waitUntil: "networkidle" })
    const scrollWidth = await page.locator("body").evaluate((element) => element.scrollWidth)
    expect(scrollWidth).toBe(390)
  })
})
