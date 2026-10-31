import { describe, expect, it } from "vitest"
import {
  MoneyError,
  applyDiscountCents,
  calculateChangeCents,
  formatCNY,
  fromCents,
  multiplyCents,
  sumCents,
  toCents,
} from "@/lib/money"

describe("money/toCents", () => {
  it("将元精确转换为分", () => {
    expect(toCents(19.99)).toBe(1999)
    expect(toCents(0)).toBe(0)
    expect(toCents(0.1 + 0.2)).toBe(30)
  })

  it("拒绝非有限数字", () => {
    expect(() => toCents(Number.NaN)).toThrow(MoneyError)
    expect(() => toCents(Number.POSITIVE_INFINITY)).toThrow(MoneyError)
  })
})

describe("money/formatCNY", () => {
  it("格式化为两位小数", () => {
    expect(formatCNY(1230)).toBe("¥12.30")
    expect(formatCNY(0)).toBe("¥0.00")
    expect(formatCNY(-1230)).toBe("-¥12.30")
  })

  it("拒绝非整数分", () => {
    expect(() => formatCNY(12.3)).toThrow(MoneyError)
  })
})

describe("money/sumCents", () => {
  it("对多笔金额求和", () => {
    expect(sumCents([1999, 3050, 0])).toBe(5049)
    expect(sumCents([])).toBe(0)
  })

  it("拒绝非整数分", () => {
    expect(() => sumCents([1.5])).toThrow(MoneyError)
  })
})

describe("money/multiplyCents", () => {
  it("按数量计算小计", () => {
    expect(multiplyCents(1500, 3)).toBe(4500)
    expect(multiplyCents(1500, 0)).toBe(0)
  })

  it("拒绝非法数量", () => {
    expect(() => multiplyCents(1500, -1)).toThrow(MoneyError)
    expect(() => multiplyCents(1500, 1.5)).toThrow(MoneyError)
  })
})

describe("money/applyDiscountCents", () => {
  it("按百分比计算折扣", () => {
    expect(applyDiscountCents(10000, 20)).toBe(8000)
    expect(applyDiscountCents(10000, 0)).toBe(10000)
    expect(applyDiscountCents(10000, 100)).toBe(0)
  })

  it("拒绝越界折扣", () => {
    expect(() => applyDiscountCents(10000, -1)).toThrow(MoneyError)
    expect(() => applyDiscountCents(10000, 101)).toThrow(MoneyError)
  })
})

describe("money/calculateChangeCents", () => {
  it("计算找零", () => {
    expect(calculateChangeCents(5000, 3680)).toBe(1320)
    expect(calculateChangeCents(3680, 3680)).toBe(0)
  })

  it("拒绝支付金额不足", () => {
    expect(() => calculateChangeCents(1000, 3680)).toThrow(MoneyError)
  })
})

describe("money/fromCents", () => {
  it("分转换为元", () => {
    expect(fromCents(1999)).toBe(19.99)
  })
})
