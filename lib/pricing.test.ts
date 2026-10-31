import { describe, expect, it } from "vitest"
import { calculateBillableHours, calculateRoomChargeCents } from "@/lib/pricing"

const START = "2026-10-31T10:00:00.000+08:00"

const endAfter = (minutes: number) =>
  new Date(Date.parse(START) + minutes * 60_000).toISOString()

describe("pricing/calculateBillableHours", () => {
  it("不足最低时长按 1 小时计费", () => {
    expect(calculateBillableHours(START, endAfter(30))).toBe(1)
    expect(calculateBillableHours(START, endAfter(60))).toBe(1)
  })

  it("超时 15 分钟内不进位", () => {
    expect(calculateBillableHours(START, endAfter(75))).toBe(1)
    expect(calculateBillableHours(START, endAfter(135))).toBe(2)
  })

  it("超时超过 15 分钟进位到下一小时", () => {
    expect(calculateBillableHours(START, endAfter(76))).toBe(2)
    expect(calculateBillableHours(START, endAfter(136))).toBe(3)
    expect(calculateBillableHours(START, endAfter(181))).toBe(3)
  })

  it("支持自定义进位分钟与最低时长", () => {
    expect(calculateBillableHours(START, endAfter(70), { graceMinutes: 5 })).toBe(2)
    expect(calculateBillableHours(START, endAfter(30), { minimumHours: 2 })).toBe(2)
  })

  it("拒绝非法时间与参数", () => {
    expect(() => calculateBillableHours("bad", endAfter(60))).toThrow("时间格式")
    expect(() => calculateBillableHours(endAfter(60), START)).toThrow("不能早于")
    expect(() => calculateBillableHours(START, endAfter(60), { graceMinutes: 60 })).toThrow("0~59")
  })
})

describe("pricing/calculateRoomChargeCents", () => {
  it("按小时单价计算房费", () => {
    expect(calculateRoomChargeCents(58000, 1)).toBe(58000)
    expect(calculateRoomChargeCents(28000, 3)).toBe(84000)
    expect(calculateRoomChargeCents(58000, 0)).toBe(0)
  })

  it("拒绝非法房价或小时数", () => {
    expect(() => calculateRoomChargeCents(-1, 1)).toThrow("非负整数")
    expect(() => calculateRoomChargeCents(58000, 1.5)).toThrow("非负整数")
  })
})
