/**
 * 金额工具：内部统一使用“分”为整数，避免浮点误差。
 * 多店 SaaS 场景下，金额必须由服务端为唯一事实源；本文件用于前端展示与校验。
 */

export class MoneyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MoneyError"
  }
}

/** 将元转换为分（四舍五入到整数分） */
export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) {
    throw new MoneyError("金额必须是有限数字")
  }
  return Math.round((amount + Number.EPSILON) * 100)
}

/** 将分转换为元（仅用于展示/兼容旧接口） */
export function fromCents(cents: number): number {
  assertIntegerCents(cents)
  return cents / 100
}

/** 格式化为人民币字符串，如 -¥12.30 */
export function formatCNY(cents: number): string {
  assertIntegerCents(cents)
  const sign = cents < 0 ? "-" : ""
  return `${sign}¥${(Math.abs(cents) / 100).toFixed(2)}`
}

/** 多笔金额求和（分） */
export function sumCents(values: readonly number[]): number {
  return values.reduce((total, value) => {
    assertIntegerCents(value)
    return total + value
  }, 0)
}

/** 按数量乘以单价（分） */
export function multiplyCents(unitCents: number, quantity: number): number {
  assertIntegerCents(unitCents)
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new MoneyError("数量必须是非负整数")
  }
  return unitCents * quantity
}

/**
 * 计算折扣后金额（分）。
 * @param cents 原价（分）
 * @param discountPercent 折扣百分比，0~100，如 20 表示减免 20%
 */
export function applyDiscountCents(cents: number, discountPercent: number): number {
  assertIntegerCents(cents)
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    throw new MoneyError("折扣百分比必须在 0~100 之间")
  }
  return Math.round(cents * (1 - discountPercent / 100))
}

/** 计算找零（分） */
export function calculateChangeCents(paidCents: number, totalCents: number): number {
  assertIntegerCents(paidCents)
  assertIntegerCents(totalCents)
  if (totalCents < 0) {
    throw new MoneyError("应收金额不能为负")
  }
  if (paidCents < totalCents) {
    throw new MoneyError("支付金额不足")
  }
  return paidCents - totalCents
}

function assertIntegerCents(cents: number): void {
  if (!Number.isInteger(cents)) {
    throw new MoneyError("金额（分）必须是整数")
  }
}
