/**
 * 包厢计时计费规则（依据《YYC3-艺人管理-开发文档》的“超时 15 分钟进位”规则）。
 *
 * 规则：
 * - 计费基础单位为整小时；
 * - 超过整小时后，剩余时间 ≤ graceMinutes（默认 15 分钟）不进位；
 * - 剩余时间 > graceMinutes 则进位到下一小时；
 * - 最低计费 minimumHours（默认 1 小时）。
 *
 * 说明：该规则是房间计费的占位默认值；门店级计费配置（首台最低时长、包厢类型单价等）
 * 将在 Phase 3 随“艺人设置/包厢计费规则”一起接入。
 */

export interface BillingPolicy {
  graceMinutes?: number
  minimumHours?: number
}

export function calculateBillableHours(
  startedAt: string,
  endedAt: string,
  policy: BillingPolicy = {},
): number {
  const start = Date.parse(startedAt)
  const end = Date.parse(endedAt)

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new Error("计费时间格式不合法")
  }
  if (end < start) {
    throw new Error("结束时间不能早于开始时间")
  }

  const graceMinutes = policy.graceMinutes ?? 15
  const minimumHours = policy.minimumHours ?? 1

  if (graceMinutes < 0 || graceMinutes >= 60) {
    throw new Error("graceMinutes 必须在 0~59 之间")
  }
  if (minimumHours < 0) {
    throw new Error("minimumHours 不能为负")
  }

  const totalMinutes = (end - start) / 60_000
  const fullHours = Math.floor(totalMinutes / 60)
  const remainderMinutes = totalMinutes - fullHours * 60
  const roundedHours = remainderMinutes > graceMinutes ? fullHours + 1 : fullHours

  return Math.max(minimumHours, roundedHours)
}

/** 按小时数与房价（分）计算房费（分） */
export function calculateRoomChargeCents(hourlyRateCents: number, hours: number): number {
  if (!Number.isInteger(hourlyRateCents) || hourlyRateCents < 0) {
    throw new Error("房价（分）必须是非负整数")
  }
  if (!Number.isInteger(hours) || hours < 0) {
    throw new Error("计费小时必须是非负整数")
  }
  return hourlyRateCents * hours
}
