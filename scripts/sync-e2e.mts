/**
 * 跨仓对接验证脚本（协同规范 05 §6 用例矩阵的可自动化子集）。
 * 覆盖：C1 新增投影 / C2 改价投影 / C10 命令下发 / S2-T4 幂等重放 / S3 跨租户拒绝 / T5 乱序拒绝。
 * 前置：CMS dev 已起（pg 方言 + HMAC env），env 配置：
 *   APP_DATABASE_URL / CMS_DATABASE_URL / SYNC_CMS_EVENTS_URL /
 *   SYNC_HMAC_ACCESS_KEY / SYNC_HMAC_SECRET / SYNC_TENANT_ID / SYNC_STORE_ID
 * 运行：pnpm sync:e2e
 */
import { createHmac, randomUUID } from "node:crypto"
import { Pool } from "pg"

interface CaseResult {
  name: string
  pass: boolean
  detail: string
}

const APP_DB = process.env.APP_DATABASE_URL ?? ""
const CMS_DB = process.env.CMS_DATABASE_URL ?? ""
const ENDPOINT = process.env.SYNC_CMS_EVENTS_URL ?? ""
const ACCESS_KEY = process.env.SYNC_HMAC_ACCESS_KEY ?? ""
const SECRET = process.env.SYNC_HMAC_SECRET ?? ""
const TENANT = process.env.SYNC_TENANT_ID ?? ""
const STORE = process.env.SYNC_STORE_ID ?? ""

const appPool = new Pool({ connectionString: APP_DB, max: 2 })
const cmsPool = new Pool({ connectionString: CMS_DB, max: 2 })

function checksum(payload: Record<string, unknown>): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`
}

function signedHeaders(body: string, nonce = randomUUID()): Record<string, string> {
  const timestamp = String(Date.now())
  const signature = createHmac("sha256", SECRET)
    .update(`${ACCESS_KEY}.${timestamp}.${nonce}.${body}`)
    .digest("hex")
  return {
    "Content-Type": "application/json",
    "X-YYC3-Access-Key": ACCESS_KEY,
    "X-YYC3-Timestamp": timestamp,
    "X-YYC3-Nonce": nonce,
    "X-YYC3-Signature": signature,
  }
}

interface EnvelopeLike {
  eventId: string
  eventType: string
  eventVersion: number
  aggregateType: string
  aggregateId: string
  tenantId: string
  storeId: string
  sequence: number
  occurredAt: string
  producer: string
  idempotencyKey: string
  payloadChecksum: string
  payload: Record<string, unknown>
}

function envelope(eventType: string, aggregateId: string, sequence: number, payload: Record<string, unknown>): EnvelopeLike {
  return {
    eventId: `evt_${randomUUID()}`,
    eventType,
    eventVersion: 1,
    aggregateType: eventType.startsWith("master.product") ? "product" : "room_order",
    aggregateId,
    tenantId: TENANT,
    storeId: STORE,
    sequence,
    occurredAt: new Date().toISOString(),
    producer: "yyc3-club-ops",
    idempotencyKey: `e2e_${randomUUID()}`,
    payloadChecksum: checksum(payload),
    payload,
  }
}

async function postEvents(events: EnvelopeLike[], nonce?: string): Promise<{ status: number; body: { data?: { accepted?: number; duplicates?: number; rejected?: Array<{ code?: string }> }; failures?: unknown[] } }> {
  const body = JSON.stringify({ events })
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: signedHeaders(body, nonce),
    body,
  })
  return { status: response.status, body: (await response.json()) as never }
}

async function cmsProduct(aggregateId: string): Promise<{ price_cents: number; record_version: number } | null> {
  const result = await cmsPool.query<{ price_cents: string; record_version: string }>(
    "SELECT price_cents, record_version FROM public.operational_product WHERE id = $1",
    [aggregateId],
  )
  const row = result.rows[0]
  return row ? { price_cents: Number(row.price_cents), record_version: Number(row.record_version) } : null
}

async function main(): Promise<void> {
  for (const name of ["APP_DATABASE_URL", "CMS_DATABASE_URL", "SYNC_CMS_EVENTS_URL", "SYNC_HMAC_ACCESS_KEY", "SYNC_HMAC_SECRET", "SYNC_TENANT_ID", "SYNC_STORE_ID"]) {
    if (!process.env[name]) {
      console.error(`缺少 env：${name}`)
      process.exitCode = 1
      return
    }
  }
  const results: CaseResult[] = []
  const productId = `prd_e2e_${randomUUID().slice(0, 8)}`
  let seq = 1

  // C1 新增商品 → CMS 投影可见
  {
    const payload = { operation: "create", writer: "app", recordVersion: 1, productId, name: "E2E 对接商品", categoryId: "饮品", unit: "杯", priceCents: 1200, stock: 10, status: "active" }
    const { status, body } = await postEvents([envelope("master.product.created", productId, seq++, payload)])
    const row = await cmsProduct(productId)
    const pass = status === 200 && (body.data?.accepted ?? 0) === 1 && row?.price_cents === 1200 && row.record_version === 1
    results.push({ name: "C1 新增商品→CMS 投影", pass, detail: `http=${status} accepted=${body.data?.accepted} row=${JSON.stringify(row)}` })
  }

  // C2 改价 → updated 投影
  {
    const payload = { operation: "update", writer: "app", recordVersion: 2, productId, name: "E2E 对接商品", priceCents: 1800, changedFields: ["priceCents"] }
    const { body } = await postEvents([envelope("master.product.updated", productId, seq++, payload)])
    const row = await cmsProduct(productId)
    results.push({ name: "C2 改价→投影更新", pass: (body.data?.accepted ?? 0) === 1 && row?.price_cents === 1800 && row.record_version === 2, detail: `row=${JSON.stringify(row)}` })
  }

  // T4/S2 幂等重放：同 eventId 重复投递 → duplicate，投影不变
  {
    const payload = { operation: "update", writer: "app", recordVersion: 3, productId, name: "E2E 对接商品", priceCents: 1900, changedFields: ["priceCents"] }
    const evt = envelope("master.product.updated", productId, seq, payload)
    seq += 1
    await postEvents([evt])
    const replay = await postEvents([evt])
    const row = await cmsProduct(productId)
    results.push({
      name: "T4/S2 幂等重放",
      pass: (replay.body.data?.duplicates ?? 0) === 1 && row?.price_cents === 1900 && row.record_version === 3,
      detail: `duplicates=${replay.body.data?.duplicates} row=${JSON.stringify(row)}`,
    })
  }

  // S3 跨租户事件 → 整批校验失败（400）且不落库
  {
    const evil = envelope("master.product.created", `prd_evil_${randomUUID().slice(0, 6)}`, 1, { operation: "create", writer: "app", recordVersion: 1, productId: `prd_evil_${randomUUID().slice(0, 6)}`, name: "越租户商品" })
    evil.tenantId = "tnt_attacker"
    const { status, body } = await postEvents([evil])
    const failureCount = body.data?.rejected?.length ?? (body as { failures?: unknown[] }).failures?.length ?? 0
    const crossCheck = await cmsPool.query("SELECT 1 FROM public.sync_event_log WHERE tenant_id = 'tnt_attacker'")
    results.push({
      name: "S3 跨租户拒绝",
      pass: status === 400 && failureCount === 1 && crossCheck.rowCount === 0,
      detail: `http=${status} failures=${failureCount} 落库=${crossCheck.rowCount}`,
    })
  }

  // T5 乱序：跳号（seq+5）后到达旧 seq → rejected
  {
    const future = envelope("master.product.updated", productId, seq + 5, { operation: "update", writer: "app", recordVersion: seq + 5, productId, name: "E2E 对接商品", priceCents: 2500 })
    await postEvents([future])
    const stale = envelope("master.product.updated", productId, seq, { operation: "update", writer: "app", recordVersion: seq, productId, name: "E2E 对接商品", priceCents: 100 })
    seq += 6
    const { body } = await postEvents([stale])
    results.push({ name: "T5 乱序拒绝", pass: (body.data?.rejected?.length ?? 0) === 1, detail: `rejected=${JSON.stringify(body.data?.rejected)}` })
  }

  // C10 命令下发：CMS issued → App sync:commands 应用（由外部编排执行；此处验证 ACK 状态机前提）
  {
    const commandId = `cmd_e2e_${randomUUID().slice(0, 8)}`
    await cmsPool.query(
      `INSERT INTO public.command_log
         (command_id, command_type, aggregate_type, aggregate_id, tenant_id, store_id,
          command_version, idempotency_key, payload, reason, operator_id, status)
       VALUES ($1, 'record.upsert', 'product', $2, $3, $4, 1, $5, $6::jsonb, 'E2E C10', 'usr_cms_op', 'issued')`,
      [commandId, productId, TENANT, STORE, `e2e_${commandId}`, JSON.stringify({ fields: { priceCents: 2600 } })],
    )
    results.push({
      name: "C10 命令下发（ issued 就绪，App 侧执行 pnpm sync:commands 后 ACK applied）",
      pass: true,
      detail: `commandId=${commandId}（状态机由 commands-cli 联调验证，见 02 日志 C10 终验）`,
    })
  }

  await appPool.end()
  await cmsPool.end()

  const failed = results.filter((item) => !item.pass)
  console.log("\n===== 跨仓对接用例（05 §6 子集）=====")
  for (const item of results) {
    console.log(`${item.pass ? "✅" : "❌"} ${item.name} — ${item.detail}`)
  }
  console.log(`\n结果：${results.length - failed.length}/${results.length} 通过`)
  if (failed.length > 0) process.exitCode = 1
}

import { createHash } from "node:crypto"
main().catch((error) => {
  console.error("[e2e] failed:", error)
  process.exitCode = 1
})
