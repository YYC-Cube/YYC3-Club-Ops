import { describe, expect, it } from "vitest"
import {
  buildEnvelope,
  nextRetrySeconds,
  payloadChecksum,
  relayPendingEvents,
  type OutboxRow,
} from "./outbox"

describe("sync/outbox", () => {
  it("payloadChecksum 对同内容稳定、异内容不同", () => {
    const a = payloadChecksum({ b: 2, a: 1 })
    const b = payloadChecksum({ a: 1, b: 2 })
    const c = payloadChecksum({ a: 2, b: 1 })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it("指数退避：30s 起、上限 1h", () => {
    expect(nextRetrySeconds(0)).toBe(30)
    expect(nextRetrySeconds(1)).toBe(60)
    expect(nextRetrySeconds(5)).toBe(960)
    expect(nextRetrySeconds(10)).toBe(3600)
  })

  it("buildEnvelope 输出 03 §2 信封形态", () => {
    const row = {
      id: "evt-1",
      tenant_id: "tnt-1",
      store_id: "str-1",
      aggregate_type: "room_order",
      aggregate_id: "ord-1",
      event_type: "order.checkout.completed",
      event_version: 1,
      sequence: "7",
      occurred_at: "2026-11-01T12:00:00.000Z",
      actor_id: "usr-1",
      idempotency_key: "checkout:ord-1",
      payload: { totalCents: 100 },
      payload_checksum: "sha256:abc",
      attempts: 0,
    } as unknown as OutboxRow
    const envelope = buildEnvelope(row)
    expect(envelope).toMatchObject({
      eventId: "evt-1",
      eventType: "order.checkout.completed",
      aggregateType: "room_order",
      aggregateId: "ord-1",
      tenantId: "tnt-1",
      storeId: "str-1",
      sequence: 7,
      producer: "yyc3-club-ops",
      idempotencyKey: "checkout:ord-1",
      payloadChecksum: "sha256:abc",
      actorId: "usr-1",
    })
    expect(envelope.occurredAt).toBe("2026-11-01T12:00:00.000Z")
  })

  it("未配置 endpoint 时中继 no-op，事件保留 pending", async () => {
    const result = await relayPendingEvents({
      connect: async () => {
        throw new Error("不应建立连接")
      },
      query: async () => {
        throw new Error("不应查询数据库")
      },
    })
    expect(result).toEqual({ picked: 0, sent: 0, failed: 0, skipped: true })
  })
})
