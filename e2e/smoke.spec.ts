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
  test("空闲包厢可完成开房 → POS 点单结账 → 清台", async ({ page }) => {
    await page.goto("/rooms", { waitUntil: "networkidle" })

    await page.getByRole("button", { name: /VIP-01/ }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText("空闲")

    await dialog.getByRole("button", { name: "开房" }).click()
    await expect(dialog).toContainText("消费中")

    // 结账必须经过 POS（含消费明细与支付方式）
    await dialog.getByRole("button", { name: /结账/ }).click()
    await expect(page.getByText("POS 收银台")).toBeVisible()
    await expect(page.getByText("当前包厢：VIP-01")).toBeVisible()

    await page.getByRole("button", { name: /矿泉水/ }).click()
    await expect(page.getByText("尚未点单")).toHaveCount(0)

    await page.getByRole("button", { name: "结账并打印小票" }).click()
    const receipt = page.getByRole("dialog")
    await expect(receipt).toContainText("结账成功")
    await expect(receipt).toContainText("矿泉水")
    await receipt.getByRole("button", { name: "完成并返回" }).click()

    // 返回包厢列表后为待清洁，清台后回到空闲
    await page.getByRole("button", { name: /VIP-01/ }).click()
    const roomDialog = page.getByRole("dialog")
    await expect(roomDialog).toContainText("待清洁")
    await roomDialog.getByRole("button", { name: "清洁完成" }).click()
    await expect(roomDialog).toContainText("空闲")

    await page.keyboard.press("Escape")
    await expect(roomDialog).toBeHidden()
  })

  test("消费中包厢可进入点单", async ({ page }) => {
    await page.goto("/rooms", { waitUntil: "networkidle" })
    await page.getByRole("button", { name: /VIP-02/ }).click()

    const dialog = page.getByRole("dialog")
    await dialog.getByRole("button", { name: "点单" }).click()

    await expect(page.getByText("POS 收银台")).toBeVisible()
    await expect(page.getByText("当前包厢：VIP-02")).toBeVisible()
    await expect(page.getByRole("button", { name: /矿泉水/ })).toBeVisible()
  })

  test("POS 页面可直接点单、退单并结账出小票", async ({ page }) => {
    await page.goto("/pos", { waitUntil: "networkidle" })
    await expect(page.getByText("POS 收银台")).toBeVisible()

    await page.getByRole("button", { name: /百威啤酒/ }).click()
    await expect(page.getByText("尚未点单")).toHaveCount(0)

    await page.getByRole("button", { name: "退单" }).first().click()
    await expect(page.getByText("尚未点单")).toBeVisible()

    await page.getByRole("button", { name: /矿泉水/ }).click()
    await page.getByRole("button", { name: "结账并打印小票" }).click()
    const receipt = page.getByRole("dialog")
    await expect(receipt).toContainText("结账成功")
    await expect(receipt).toContainText("合计")
    await receipt.getByRole("button", { name: "继续点单" }).click()
    await expect(receipt).toBeHidden()
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
