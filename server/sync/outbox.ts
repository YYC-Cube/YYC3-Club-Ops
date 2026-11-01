/**
 * App→CMS 事件 Outbox（协同规范 03 §1/§2）。
 * - enqueueSyncEvent：业务事务内写入，与业务同事务提交即「必达」；
 * - buildEnvelope：DB 行 → 03 §2 事件信封；
 * - relayPendingEvents：拉取 pending 批次投递 CMS（端点未配置时 no-op）。
 * sequence 取聚合根当前最大值 +1；调用方必须持有聚合行锁（FOR UPDATE），
 * 唯一索引 (aggregate_type, aggregate_id, sequence) 兜底并发。
 */
import { createHash, createHmac, randomUUID } from "node:crypto"
import type { Pool, PoolClient, QueryResultRow } from "pg"

export const EVENT_PRODUCER = "yyc3-club-ops"

export interface SyncEventInput {
  tenantId: string
  storeId: string
  aggregateType: string
  aggregateId: string
  eventType: string
  eventVersion?: number
  actorId?: string | null
  idempotencyKey: string
  payload: Record<string, unknown>
  occurredAt?: Date
}

/** 03 §2 事件信封 */
export interface SyncEventEnvelope {
  eventId: string
  eventType: string
  eventVersion: number
  aggregateType: string
  aggregateId: string
  tenantId: string
  storeId: string
  sequence: number
  occurredAt: string
  actorId?: string
  producer: string
  idempotencyKey: string
  payloadChecksum: string
  payload: Record<string, unknown>
}

export interface OutboxRow extends QueryResultRow {
  id: string
  tenant_id: string
  store_id: string
  aggregate_type: string
  aggregate_id: string
  event_type: string
  event_version: number
  sequence: string | number
  occurred_at: Date | string
  actor_id: string | null
  idempotency_key: string
  payload: Record<string, unknown>
  payload_checksum: string
  attempts: number | string
}

/** canonical JSON：键递归排序后序列化，保证同内容异键序校验和一致（03 §1） */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonicalize(item)]),
    )
  }
  return value
}

export function payloadChecksum(payload: Record<string, unknown>): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex")}`
}

/** 与业务同事务入队；幂等键冲突时返回既有事件 id（业务重放不产生重复事件）。 */
export async function enqueueSyncEvent(
  client: Pick<PoolClient, "query">,
  input: SyncEventInput,
): Promise<string> {
  const occurredAt = (input.occurredAt ?? new Date()).toISOString()
  const checksum = payloadChecksum(input.payload)

  const seqResult = await client.query<{ next: string | number }>(
    `SELECT COALESCE(MAX(sequence), 0) + 1 AS next
       FROM app.sync_outbox
      WHERE tenant_id = $1 AND aggregate_type = $2 AND aggregate_id = $3`,
    [input.tenantId, input.aggregateType, input.aggregateId],
  )
  const sequence = Number(seqResult.rows[0]?.next ?? 1)

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO app.sync_outbox
       (tenant_id, store_id, aggregate_type, aggregate_id, event_type, event_version,
        sequence, occurred_at, actor_id, idempotency_key, payload, payload_checksum)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
     ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
     RETURNING id`,
    [
      input.tenantId,
      input.storeId,
      input.aggregateType,
      input.aggregateId,
      input.eventType,
      input.eventVersion ?? 1,
      sequence,
      occurredAt,
      input.actorId ?? null,
      input.idempotencyKey,
      JSON.stringify(input.payload),
      checksum,
    ],
  )
  if (inserted.rows[0]?.id) return inserted.rows[0].id

  const existing = await client.query<{ id: string }>(
    `SELECT id FROM app.sync_outbox
      WHERE tenant_id = $1 AND idempotency_key = $2`,
    [input.tenantId, input.idempotencyKey],
  )
  return existing.rows[0]?.id ?? ""
}

export function buildEnvelope(row: OutboxRow): SyncEventEnvelope {
  const actorId = row.actor_id ?? undefined
  return {
    eventId: row.id,
    eventType: row.event_type,
    eventVersion: row.event_version,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    tenantId: row.tenant_id,
    storeId: row.store_id,
    sequence: Number(row.sequence),
    occurredAt: new Date(row.occurred_at).toISOString(),
    ...(actorId ? { actorId } : {}),
    producer: EVENT_PRODUCER,
    idempotencyKey: row.idempotency_key,
    payloadChecksum: row.payload_checksum,
    payload: row.payload,
  }
}

const RELAY_MAX_ATTEMPTS = 5

/** 指数退避：30s·2^n，上限 1h。 */
export function nextRetrySeconds(attempts: number): number {
  return Math.min(30 * 2 ** attempts, 3600)
}

export interface RelayOptions {
  /** CMS 事件接收端点（POST {events:[...]}）；未配置时 no-op。 */
  endpoint?: string
  /** 服务间 HMAC 凭据：与 CMS 侧共享（协同规范 01 §安全；不留 Bearer 过渡）。 */
  accessKey?: string
  secret?: string
  limit?: number
  fetchImpl?: typeof fetch
  now?: () => number
  nonce?: () => string
}

export interface RelayResult {
  picked: number
  sent: number
  failed: number
  /** endpoint 未配置时 true（事件保留 pending，待配置后投递）。 */
  skipped: boolean
}

/**
 * 拉取 pending/到期 failed 批次 → 信封批量 POST → 标记 sent/failed。
 * 以 owner 连接运行（sync_outbox 仅 ENABLE RLS，owner 可跨门店认领）；
 * SKIP LOCKED 允许多实例并行。
 */
export async function relayPendingEvents(
  pool: Pick<Pool, "connect" | "query">,
  options: RelayOptions = {},
): Promise<RelayResult> {
  const limit = options.limit ?? 100
  if (!options.endpoint) {
    return { picked: 0, sent: 0, failed: 0, skipped: true }
  }
  const fetchImpl = options.fetchImpl ?? fetch
  const client = await pool.connect()
  let claimed: OutboxRow[]
  try {
    await client.query("BEGIN")
    const result = await client.query<OutboxRow>(
      `UPDATE app.sync_outbox SET status = 'sending'
        WHERE id IN (
          SELECT id FROM app.sync_outbox
           WHERE status IN ('pending', 'failed')
             AND (next_retry_at IS NULL OR next_retry_at <= now())
           ORDER BY created_at, id
           LIMIT $1
           FOR UPDATE SKIP LOCKED
        )
        RETURNING *`,
      [limit],
    )
    claimed = result.rows
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }

  if (claimed.length === 0) {
    return { picked: 0, sent: 0, failed: 0, skipped: false }
  }

  const events = claimed.map(buildEnvelope)
  const body = JSON.stringify({ events })
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (options.accessKey && options.secret) {
    const timestamp = String(options.now?.() ?? Date.now())
    const nonce = options.nonce?.() ?? randomUUID()
    const signature = createHmac("sha256", options.secret)
      .update(`${options.accessKey}.${timestamp}.${nonce}.${body}`)
      .digest("hex")
    headers["X-YYC3-Access-Key"] = options.accessKey
    headers["X-YYC3-Timestamp"] = timestamp
    headers["X-YYC3-Nonce"] = nonce
    headers["X-YYC3-Signature"] = signature
  }
  let response: Response
  try {
    response = await fetchImpl(options.endpoint, { method: "POST", headers, body })
  } catch (error) {
    await markRelayFailure(pool, claimed, error instanceof Error ? error.message : "network_error")
    return { picked: claimed.length, sent: 0, failed: claimed.length, skipped: false }
  }

  if (!response.ok) {
    await markRelayFailure(pool, claimed, `http_${response.status}`)
    return { picked: claimed.length, sent: 0, failed: claimed.length, skipped: false }
  }

  const sentIds = claimed.map((row) => row.id)
  await pool.query(
    `UPDATE app.sync_outbox SET status = 'sent', sent_at = now(), last_error = NULL
      WHERE id = ANY($1::uuid[])`,
    [sentIds],
  )
  return { picked: claimed.length, sent: sentIds.length, failed: 0, skipped: false }
}

async function markRelayFailure(
  pool: Pick<Pool, "query">,
  rows: OutboxRow[],
  message: string,
): Promise<void> {
  const deadIds = rows.filter((row) => Number(row.attempts ?? 0) + 1 >= RELAY_MAX_ATTEMPTS)
  const retryIds = rows.filter((row) => Number(row.attempts ?? 0) + 1 < RELAY_MAX_ATTEMPTS)
  if (retryIds.length > 0) {
    await pool.query(
      `UPDATE app.sync_outbox
          SET status = 'failed', attempts = attempts + 1, last_error = $2,
              next_retry_at = now() + make_interval(secs => $3::int)
        WHERE id = ANY($1::uuid[])`,
      [retryIds.map((row) => row.id), message, nextRetrySeconds(Number(retryIds[0].attempts ?? 0))],
    )
  }
  if (deadIds.length > 0) {
    await pool.query(
      `UPDATE app.sync_outbox
          SET status = 'dead', attempts = attempts + 1, last_error = $2
        WHERE id = ANY($1::uuid[])`,
      [deadIds.map((row) => row.id), message],
    )
  }
}

/** 供 Memory 仓储等使用的纯内存记录（单测断言 master.* 事件用）。 */
export interface SyncEventRecord {
  eventId: string
  eventType: string
  aggregateType: string
  aggregateId: string
  sequence: number
  idempotencyKey: string
  actorId?: string
  payload: Record<string, unknown>
  occurredAt: string
}

export function newEventId(): string {
  return `evt_${randomUUID()}`
}
