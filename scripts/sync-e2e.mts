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
  const aggregateType = eventType.startsWith("master.")
    ? (eventType.split(".")[1] ?? "room_order")
    : "room_order"
  return {
    eventId: `evt_${randomUUID()}`,
    eventType,
    eventVersion: 1,
    aggregateType,
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

  // C10 命令下发：CMS issued → 脚本内调用 poller 应用 → ACK applied → 回执事件
  {
    const { Pool: AppPool } = await import("pg")
    const { PostgresRepository } = await import("../server/repositories/postgres")
    const { pollCommands } = await import("../server/sync/commands")
    const appRepositoryPool = new AppPool({ connectionString: APP_DB, max: 2 })
    const repository = new PostgresRepository(appRepositoryPool)
    try {
      // 命令的应用走 App 库：先确保目标商品在 App 侧存在（命令纠偏的前提是数据已建）
      await appRepositoryPool.query(
        `INSERT INTO app.product (id, tenant_id, store_id, name, category, unit, price_cents, stock, status, version)
         VALUES ($1, $2, $3, $4, '饮品', '杯', 1900, 20, 'active', 3)
         ON CONFLICT (id) DO UPDATE SET price_cents = 1900, version = 3`,
        [productId, TENANT, STORE, `E2E 对接商品-${productId.slice(-6)}`],
      )
      const commandId = `cmd_e2e_${randomUUID().slice(0, 8)}`
      await cmsPool.query(
        `INSERT INTO public.command_log
           (command_id, command_type, aggregate_type, aggregate_id, tenant_id, store_id,
            command_version, idempotency_key, payload, reason, operator_id, status)
         VALUES ($1, 'record.upsert', 'product', $2, $3, $4, 1, $5, $6::jsonb, 'E2E C10', 'usr_cms_op', 'issued')`,
        [commandId, productId, TENANT, STORE, `e2e_${commandId}`, JSON.stringify({ fields: { priceCents: 2600 } })],
      )
      const poll = await pollCommands(repository, { tenantId: TENANT, storeId: STORE, userId: "e2e-c10" }, {
        endpoint: ENDPOINT.replace(/\/events$/, "/commands"),
        tenantId: TENANT,
        storeId: STORE,
        credentials: { accessKey: ACCESS_KEY, secret: SECRET },
      })
      const ack = await cmsPool.query<{ status: string }>(
        "SELECT status FROM public.command_log WHERE command_id = $1",
        [commandId],
      )
      const receipt = await appPool.query<{ status: string }>(
        `SELECT status FROM app.sync_outbox WHERE aggregate_id = $1 AND event_type = 'master.product.updated'
          ORDER BY created_at DESC LIMIT 1`,
        [productId],
      )
      results.push({
        name: "C10 命令完整闭环（poller 应用→ACK applied→回执）",
        pass: poll.applied === 1 && ack.rows[0]?.status === "applied" && receipt.rows[0]?.status === "pending",
        detail: `applied=${poll.applied} ack=${ack.rows[0]?.status} receipt=${receipt.rows[0]?.status ?? "none"}`,
      })
    } finally {
      await repository.close()
    }
  }

  // ---- 四域投影场景（CMS 投影器已就绪；事件由脚本构造模拟 App 侧产出）----

  // 第 12 场景：record.archive 完整闭环——命令 → poller 应用 → master.product.deleted 回执 → relay → CMS 墓碑
  {
    const { Pool: AppPool } = await import("pg")
    const { PostgresRepository } = await import("../server/repositories/postgres")
    const { pollCommands } = await import("../server/sync/commands")
    const appRepositoryPool = new AppPool({ connectionString: APP_DB, max: 2 })
    const repository = new PostgresRepository(appRepositoryPool)
    try {
      const archiveId = `prd_arch_${randomUUID().slice(0, 8)}`
      // App 库先建商品（archive 前提）
      await appRepositoryPool.query(
        `INSERT INTO app.product (id, tenant_id, store_id, name, category, unit, price_cents, stock, status, version)
         VALUES ($1, $2, $3, $4, '饮品', '杯', 1500, 10, 'active', 1)
         ON CONFLICT (id) DO NOTHING`,
        [archiveId, TENANT, STORE, `E2E 封存-${archiveId.slice(-4)}`],
      )
      // CMS 投影先建行（墓碑 UPDATE 需命中既有行）：直插投影表，不占事件序列空间
      {
        await cmsPool.query(
          `INSERT INTO public.operational_product
             (id, tenant_id, store_id, code, name, category_id, unit, price_cents, stock, status, record_version, payload, deleted)
           VALUES ($1, $2, $3, $4, $5, '饮品', '杯', 1500, 10, 'active', 1, '{}'::jsonb, false)
           ON CONFLICT (id) DO NOTHING`,
          [archiveId, TENANT, STORE, archiveId, `E2E 封存-${archiveId.slice(-4)}`],
        )
      }
      const commandId = `cmd_e2e_arch_${randomUUID().slice(0, 8)}`
      await cmsPool.query(
        `INSERT INTO public.command_log
           (command_id, command_type, aggregate_type, aggregate_id, tenant_id, store_id,
            command_version, idempotency_key, payload, reason, operator_id, status)
         VALUES ($1, 'record.archive', 'product', $2, $3, $4, 1, $5, $6::jsonb, 'E2E archive', 'usr_cms_op', 'issued')`,
        [commandId, archiveId, TENANT, STORE, `e2e_${commandId}`, JSON.stringify({ operation: "archive" })],
      )
      const poll = await pollCommands(repository, { tenantId: TENANT, storeId: STORE, userId: "e2e-arch" }, {
        endpoint: ENDPOINT.replace(/\/events$/, "/commands"),
        tenantId: TENANT,
        storeId: STORE,
        credentials: { accessKey: ACCESS_KEY, secret: SECRET },
      })
      const ack = await cmsPool.query<{ status: string }>(
        "SELECT status FROM public.command_log WHERE command_id = $1",
        [commandId],
      )
      // App 回执事件（master.product.deleted）→ relay → CMS 投影墓碑
      const receipt = await appPool.query<{ status: string }>(
        `SELECT status FROM app.sync_outbox
          WHERE aggregate_type = 'product' AND aggregate_id = $1 AND event_type = 'master.product.deleted'
          ORDER BY created_at DESC LIMIT 1`,
        [archiveId],
      )
      let deleted: boolean | null = null
      if (receipt.rows[0]) {
        const { relayPendingEvents } = await import("../server/sync/outbox")
        await relayPendingEvents(appRepositoryPool, {
          endpoint: ENDPOINT,
          accessKey: ACCESS_KEY,
          secret: SECRET,
          limit: 10,
        })
        const proj = await cmsPool.query<{ deleted: boolean }>(
          "SELECT deleted FROM public.operational_product WHERE id = $1",
          [archiveId],
        )
        deleted = proj.rows[0]?.deleted ?? null
      }
      results.push({
        name: "record.archive 完整闭环（命令→封存→deleted 回执→CMS 墓碑）",
        pass: poll.applied === 1 && ack.rows[0]?.status === "applied" && deleted === true,
        detail: `applied=${poll.applied} ack=${ack.rows[0]?.status} deleted=${deleted}`,
      })
    } finally {
      await repository.close()
    }
  }

  // room 域：C4
  {
    const roomId = `room_e2e_${randomUUID().slice(0, 8)}`
    const payload = { operation: "create", writer: "app", recordVersion: 1, roomId, roomNo: `E2E-${roomId.slice(-4)}`, name: "E2E 总统包厢", roomTypeId: "rt_vip", floor: 8, capacity: 12, priceCents: 88000, businessStatus: "available" }
    const { body } = await postEvents([envelope("master.room.created", roomId, seq++, payload)])
    const row = await cmsPool.query<{ room_no: string; price_cents: string; business_status: string }>(
      "SELECT room_no, price_cents, business_status FROM public.operational_room WHERE id = $1",
      [roomId],
    )
    results.push({
      name: "room 域投影（C4）",
      pass: (body.data?.accepted ?? 0) === 1 && row.rows[0]?.room_no === payload.roomNo && Number(row.rows[0]?.price_cents) === 88000,
      detail: `row=${JSON.stringify(row.rows[0] ?? null)}`,
    })
  }

  // staff 域：C6
  {
    const staffId = `staff_e2e_${randomUUID().slice(0, 8)}`
    const payload = { operation: "create", writer: "app", recordVersion: 1, staffId, userId: "usr_e2e_staff", name: "E2E 员工", groupId: "grp_service", role: "captain", quotaCents: 500000, status: "active" }
    const { body } = await postEvents([envelope("master.staff.created", staffId, seq++, payload)])
    const row = await cmsPool.query<{ name: string; role: string }>(
      "SELECT name, role FROM public.operational_staff WHERE id = $1",
      [staffId],
    )
    results.push({
      name: "staff 域投影（C6）",
      pass: (body.data?.accepted ?? 0) === 1 && row.rows[0]?.name === "E2E 员工" && row.rows[0]?.role === "captain",
      detail: `row=${JSON.stringify(row.rows[0] ?? null)}`,
    })
  }

  // artist 域：C7（App 写、CMS 投影）
  {
    const artistId = `art_e2e_${randomUUID().slice(0, 8)}`
    const payload = { operation: "create", writer: "app", recordVersion: 1, artistId, artistNo: "A-E2E-01", name: "E2E 艺人", groupId: "grp_art", levelId: "首席", badgeNo: "B01", stageFeeRule: { rechargeCents: 100000, feeCents: 20000 }, status: "active" }
    const { body } = await postEvents([envelope("master.artist.created", artistId, seq++, payload)])
    const row = await cmsPool.query<{ name: string; level_id: string }>(
      "SELECT name, level_id FROM public.operational_artist WHERE id = $1",
      [artistId],
    )
    results.push({
      name: "artist 域投影（C7）",
      pass: (body.data?.accepted ?? 0) === 1 && row.rows[0]?.name === "E2E 艺人" && row.rows[0]?.level_id === "首席",
      detail: `row=${JSON.stringify(row.rows[0] ?? null)}`,
    })
  }

  // settings 域：C5 命令完整闭环——CMS settings.update 命令 → poller 应用 → 回执事件 → relay → CMS 投影
  {
    const { Pool: AppPool } = await import("pg")
    const { PostgresRepository } = await import("../server/repositories/postgres")
    const { pollCommands } = await import("../server/sync/commands")
    const appRepositoryPool = new AppPool({ connectionString: APP_DB, max: 2 })
    const repository = new PostgresRepository(appRepositoryPool)
    try {
      const commandId = `cmd_e2e_set_${randomUUID().slice(0, 8)}`
      const config = { booking: { enabled: true }, payment: { methods: ["cash", "wechat"] }, e2eMarker: `set_${randomUUID().slice(0, 6)}` }
      await cmsPool.query(
        `INSERT INTO public.command_log
           (command_id, command_type, aggregate_type, aggregate_id, tenant_id, store_id,
            command_version, idempotency_key, payload, reason, operator_id, status)
         VALUES ($1, 'settings.update', 'settings', $2, $3, $4, 1, $5, $6::jsonb, 'E2E C5', 'usr_cms_op', 'issued')`,
        [commandId, STORE, TENANT, STORE, `e2e_${commandId}`, JSON.stringify({ domain: "store_settings", config })],
      )
      const poll = await pollCommands(repository, { tenantId: TENANT, storeId: STORE, userId: "e2e-c5" }, {
        endpoint: ENDPOINT.replace(/\/events$/, "/commands"),
        tenantId: TENANT,
        storeId: STORE,
        credentials: { accessKey: ACCESS_KEY, secret: SECRET },
      })
      const ack = await cmsPool.query<{ status: string }>(
        "SELECT status FROM public.command_log WHERE command_id = $1",
        [commandId],
      )
      // App 侧回执事件 → relay → CMS 投影
      const receipt = await appPool.query<{ id: string; status: string }>(
        `SELECT id, status FROM app.sync_outbox
          WHERE aggregate_type = 'settings' AND event_type = 'master.settings.updated'
          ORDER BY created_at DESC LIMIT 1`,
      )
      let projected: { config: Record<string, unknown>; record_version: string } | null = null
      if (receipt.rows[0]) {
        const { relayPendingEvents } = await import("../server/sync/outbox")
        await relayPendingEvents(appRepositoryPool, {
          endpoint: ENDPOINT,
          accessKey: ACCESS_KEY,
          secret: SECRET,
          limit: 10,
        })
        const projectedResult = await cmsPool.query<{ config: Record<string, unknown>; record_version: string }>(
          "SELECT config, record_version::text AS record_version FROM public.operational_settings WHERE store_id = $1 AND domain = 'store_settings'",
          [STORE],
        )
        projected = projectedResult.rows[0] ?? null
      }
      const projectedConfig = projected?.config as { e2eMarker?: string } | null
      results.push({
        name: "settings 命令完整闭环（C5：命令→应用→回执→relay→投影）",
        pass:
          poll.applied === 1 &&
          ack.rows[0]?.status === "applied" &&
          projectedConfig?.e2eMarker === config.e2eMarker,
        detail: `applied=${poll.applied} ack=${ack.rows[0]?.status} 投影=${JSON.stringify(projected)}`,
      })
    } finally {
      await repository.close()
    }
  }

  // 第 13 场景：price.override 审计链路——命令 → poller 应用（override 三元组入事件）
  //   → relay → CMS price_override_audit 审计行 + 投影价格更新
  {
    const { Pool: AppPool } = await import("pg")
    const { PostgresRepository } = await import("../server/repositories/postgres")
    const { pollCommands } = await import("../server/sync/commands")
    const appRepositoryPool = new AppPool({ connectionString: APP_DB, max: 2 })
    const repository = new PostgresRepository(appRepositoryPool)
    try {
      const overrideId = `prd_ovr_${randomUUID().slice(0, 8)}`
      // App 库建商品 + CMS 投影先建行（覆写 UPDATE 需命中既有行）
      await appRepositoryPool.query(
        `INSERT INTO app.product (id, tenant_id, store_id, name, category, unit, price_cents, stock, status, version)
         VALUES ($1, $2, $3, $4, '饮品', '杯', 500, 20, 'active', 1)
         ON CONFLICT (id) DO NOTHING`,
        [overrideId, TENANT, STORE, `E2E 覆写-${overrideId.slice(-4)}`],
      )
      await cmsPool.query(
        `INSERT INTO public.operational_product
           (id, tenant_id, store_id, code, name, category_id, unit, price_cents, stock, status, record_version, payload, deleted)
         VALUES ($1, $2, $3, $4, $5, '饮品', '杯', 500, 20, 'active', 1, '{}'::jsonb, false)
         ON CONFLICT (id) DO NOTHING`,
        [overrideId, TENANT, STORE, overrideId, `E2E 覆写-${overrideId.slice(-4)}`],
      )
      const commandId = `cmd_e2e_ovr_${randomUUID().slice(0, 8)}`
      await cmsPool.query(
        `INSERT INTO public.command_log
           (command_id, command_type, aggregate_type, aggregate_id, tenant_id, store_id,
            command_version, idempotency_key, payload, reason, operator_id, status)
         VALUES ($1, 'price.override', 'product', $2, $3, $4, 1, $5, $6::jsonb, 'E2E 价格覆写审计', 'usr_cms_op', 'issued')`,
        [commandId, overrideId, TENANT, STORE, `e2e_${commandId}`, JSON.stringify({ priceCents: 1234 })],
      )
      const poll = await pollCommands(repository, { tenantId: TENANT, storeId: STORE, userId: "e2e-ovr" }, {
        endpoint: ENDPOINT.replace(/\/events$/, "/commands"),
        tenantId: TENANT,
        storeId: STORE,
        credentials: { accessKey: ACCESS_KEY, secret: SECRET },
      })
      const ack = await cmsPool.query<{ status: string }>(
        "SELECT status FROM public.command_log WHERE command_id = $1",
        [commandId],
      )
      // App 回执（含 override 三元组）→ relay → CMS 审计行 + 投影
      const receipt = await appPool.query<{ status: string }>(
        `SELECT status FROM app.sync_outbox
          WHERE aggregate_id = $1 AND event_type = 'master.product.updated'
          ORDER BY created_at DESC LIMIT 1`,
        [overrideId],
      )
      const { relayPendingEvents } = await import("../server/sync/outbox")
      const relay = await relayPendingEvents(appRepositoryPool, {
        endpoint: ENDPOINT,
        accessKey: ACCESS_KEY,
        secret: SECRET,
        limit: 10,
      })
      const audit = await cmsPool.query<{ override_cents: string; override_reason: string; override_operator_id: string }>(
        "SELECT override_cents::text AS override_cents, override_reason, override_operator_id FROM public.price_override_audit WHERE product_id = $1 ORDER BY created_at DESC LIMIT 1",
        [overrideId],
      )
      const projected = await cmsPool.query<{ price_cents: string }>(
        "SELECT price_cents::text AS price_cents FROM public.operational_product WHERE id = $1",
        [overrideId],
      )
      results.push({
        name: "price.override 审计链路（第 13 场景：命令→三元组→审计行→投影）",
        pass:
          poll.applied === 1 &&
          ack.rows[0]?.status === "applied" &&
          audit.rows[0]?.override_cents === "1234" &&
          audit.rows[0]?.override_operator_id === "usr_cms_op" &&
          projected.rows[0]?.price_cents === "1234",
        detail: `applied=${poll.applied} ack=${ack.rows[0]?.status} 审计=${JSON.stringify(audit.rows[0] ?? null)} 投影=${projected.rows[0]?.price_cents ?? "none"} relay=${relay.sent}`,
      })
    } finally {
      await repository.close()
    }
  }

  await appPool.end()
  await cmsPool.end()

  // 第 11 场景：五域只读端点可见性（CMS 页面 mock→真数据迁移的验收口径）
  try {
    const response = await fetch(
      `http://127.0.0.1:3030/api/v1/read-model/product?tenantId=${encodeURIComponent(TENANT)}&storeId=${encodeURIComponent(STORE)}`,
    )
    const body = (await response.json()) as { success?: boolean; data?: Array<{ name?: string }> }
    const visible = response.status === 200 && body.success === true && Array.isArray(body.data)
    results.push({
      name: "read-model 五域端点（PC mock→真数据验收口径）",
      pass: visible,
      detail: `http=${response.status} rows=${Array.isArray(body.data) ? body.data.length : "n/a"}`,
    })
  } catch (error) {
    results.push({
      name: "read-model 五域端点（PC mock→真数据验收口径）",
      pass: false,
      detail: error instanceof Error ? error.message : "unknown",
    })
  }

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
