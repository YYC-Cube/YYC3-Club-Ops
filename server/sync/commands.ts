/**
 * CMS 纠正命令拉取与应用（协同规范 02 §6 通道 C；C10/C11 反向通道闭环）。
 * 流程：HMAC GET 拉取 → 逐条应用（App 第一写入方路径，含 master.* 回执事件）
 *      → 逐条 ACK（applied/rejected）。
 * 命令生命周期：issued → delivered（CMS 标记）→ applied/rejected（本侧应用后 ACK）。
 */
import { createHmac, randomUUID } from "node:crypto"
import type { AppRepository } from "../ports"
import type { StoreContext } from "../ports"

export interface CommandCredentials {
  accessKey: string
  secret: string
}

export interface SyncCommand {
  commandId: string
  commandType: string
  aggregateType: string
  aggregateId: string | null
  version: number
  payload: Record<string, unknown>
  reason: string | null
  operatorId: string
}

export interface PollOptions {
  endpoint: string
  tenantId: string
  storeId: string
  credentials: CommandCredentials
  since?: number
  fetchImpl?: typeof fetch
  now?: () => number
}

export interface PollResult {
  fetched: number
  applied: number
  rejected: number
  details: Array<{ commandId: string; outcome: "applied" | "rejected"; code?: string }>
}

function signHeaders(creds: CommandCredentials, body: string, now: () => number): Record<string, string> {
  const timestamp = String(now())
  const nonce = randomUUID()
  const signature = createHmac("sha256", creds.secret)
    .update(`${creds.accessKey}.${timestamp}.${nonce}.${body}`)
    .digest("hex")
  return {
    "X-YYC3-Access-Key": creds.accessKey,
    "X-YYC3-Timestamp": timestamp,
    "X-YYC3-Nonce": nonce,
    "X-YYC3-Signature": signature,
  }
}

export async function fetchPendingCommands(
  options: PollOptions,
): Promise<SyncCommand[]> {
  const fetchImpl = options.fetchImpl ?? fetch
  const query = `storeId=${encodeURIComponent(options.storeId)}&since=${options.since ?? 0}`
  const response = await fetchImpl(`${options.endpoint}?${query}`, {
    method: "GET",
    headers: { ...signHeaders(options.credentials, "", options.now ?? Date.now) },
  })
  if (!response.ok) {
    throw new Error(`拉取命令失败：http_${response.status}`)
  }
  const body = (await response.json()) as { success: boolean; data?: { commands?: SyncCommand[] } }
  if (!body.success || !body.data?.commands) {
    throw new Error("拉取命令失败：响应格式非法")
  }
  return body.data.commands
}

export async function ackCommand(
  endpoint: string,
  creds: CommandCredentials,
  commandId: string,
  outcome: { status: "applied" | "rejected"; errorCode?: string; resultEventId?: string },
  fetchImpl?: typeof fetch,
  now?: () => number,
): Promise<void> {
  const fetcher = fetchImpl ?? fetch
  const body = JSON.stringify({
    status: outcome.status,
    ...(outcome.errorCode ? { errorCode: outcome.errorCode } : {}),
    ...(outcome.resultEventId ? { resultEventId: outcome.resultEventId } : {}),
  })
  const response = await fetcher(`${endpoint}/${encodeURIComponent(commandId)}/ack`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...signHeaders(creds, body, now ?? Date.now) },
    body,
  })
  if (!response.ok) {
    throw new Error(`ACK 失败：http_${response.status}`)
  }
}

/**
 * 应用单条命令（02 §6.2 命令类型 → App 行为）。
 * MVP 支持 record.upsert @ product：走 App 第一写入方路径，
 * 应用即产生 master.product.updated 回执事件（与业务同事务）。
 */
export async function applyCommand(
  repository: AppRepository,
  ctx: StoreContext,
  command: SyncCommand,
): Promise<{ status: "applied" | "rejected"; errorCode?: string }> {
  if (command.commandType === "settings.update") {
    const domain = command.payload.domain
    const config = command.payload.config
    if (domain !== "store_settings" || typeof config !== "object" || config === null) {
      return { status: "rejected", errorCode: "invalid_settings_payload" }
    }
    try {
      await repository.applySettings(
        ctx,
        config as Record<string, unknown>,
        command.operatorId || ctx.userId,
      )
      return { status: "applied" }
    } catch (error) {
      const message = error instanceof Error ? error.message : "apply_failed"
      console.error(`[sync/commands] 设置应用失败 commandId=${command.commandId}: ${message}`)
      return { status: "rejected", errorCode: "apply_failed" }
    }
  }

  // record.archive：封存/停用（02 §6.2）——产品域复用第一写入方路径，status 置 inactive
  if (command.commandType === "record.archive" && command.aggregateType === "product") {
    try {
      await repository.archiveProduct(
        { ...ctx, userId: command.operatorId || ctx.userId },
        String(command.aggregateId),
        command.operatorId || ctx.userId,
      )
      return { status: "applied" }
    } catch (error) {
      const message = error instanceof Error ? error.message : "apply_failed"
      console.error(`[sync/commands] 封存失败 commandId=${command.commandId}: ${message}`)
      return { status: "rejected", errorCode: message.includes("不存在") ? "not_found" : "apply_failed" }
    }
  }

  // price.override：强制价格（02 §6.2）——产品域价格覆写
  if (command.commandType === "price.override" && command.aggregateType === "product") {
    const overridePrice = command.payload.priceCents
    if (typeof overridePrice !== "number" || !Number.isInteger(overridePrice) || overridePrice < 0) {
      return { status: "rejected", errorCode: "invalid_price" }
    }
    try {
      await repository.updateProduct(
        { ...ctx, userId: command.operatorId || ctx.userId },
        String(command.aggregateId),
        { priceCents: overridePrice },
      )
      return { status: "applied" }
    } catch (error) {
      const message = error instanceof Error ? error.message : "apply_failed"
      console.error(`[sync/commands] 价格覆写失败 commandId=${command.commandId}: ${message}`)
      return { status: "rejected", errorCode: message.includes("不存在") ? "not_found" : "apply_failed" }
    }
  }

  if (command.commandType === "device.update") {
    const payload = command.payload
    const deviceType = payload.deviceType
    const deviceId = typeof payload.deviceId === "string" ? payload.deviceId : command.aggregateId
    const name = typeof payload.name === "string" ? payload.name : ""
    const config = (typeof payload.config === "object" && payload.config !== null ? payload.config : {}) as Record<string, unknown>
    const status = payload.status === "inactive" || payload.status === "offline" ? payload.status : "active"
    if ((deviceType !== "cashier" && deviceType !== "printer") || !deviceId || !name) {
      return { status: "rejected", errorCode: "invalid_device_payload" }
    }
    try {
      await repository.applyDevice(
        ctx,
        { deviceId, deviceType, name, config, status },
        command.operatorId || ctx.userId,
      )
      return { status: "applied" }
    } catch (error) {
      const message = error instanceof Error ? error.message : "apply_failed"
      console.error(`[sync/commands] 设备应用失败 commandId=${command.commandId}: ${message}`)
      return { status: "rejected", errorCode: "apply_failed" }
    }
  }

  if (command.commandType === "record.upsert" && command.aggregateType === "product") {
    const fields = (command.payload.fields ?? {}) as Record<string, unknown>
    const patch: UpdateProductPatch = {}
    if (fields.name !== undefined) patch.name = String(fields.name)
    if (fields.category !== undefined) patch.category = String(fields.category)
    if (fields.unit !== undefined) patch.unit = String(fields.unit)
    if (fields.priceCents !== undefined) patch.priceCents = Number(fields.priceCents)
    if (fields.memberPriceCents !== undefined) {
      patch.memberPriceCents = fields.memberPriceCents === null ? null : Number(fields.memberPriceCents)
    }
    if (fields.stock !== undefined) patch.stock = Number(fields.stock)
    if (fields.status === "active" || fields.status === "inactive") patch.status = fields.status
    if (Object.keys(patch).length === 0) {
      return { status: "rejected", errorCode: "empty_patch" }
    }
    try {
      await repository.updateProduct(
        { ...ctx, userId: command.operatorId || ctx.userId },
        String(command.aggregateId),
        patch,
      )
      return { status: "applied" }
    } catch (error) {
      const message = error instanceof Error ? error.message : "apply_failed"
      console.error(`[sync/commands] 应用失败 commandId=${command.commandId}: ${message}`)
      const code = message.includes("不存在") ? "not_found" : "apply_failed"
      return { status: "rejected", errorCode: code }
    }
  }
  return { status: "rejected", errorCode: "unsupported_command" }
}

interface UpdateProductPatch {
  name?: string
  category?: string
  unit?: string
  priceCents?: number
  memberPriceCents?: number | null
  stock?: number
  status?: "active" | "inactive"
}

/** 轮询一轮：拉取 → 应用 → ACK。 */
export async function pollCommands(
  repository: AppRepository,
  ctx: StoreContext,
  options: PollOptions,
): Promise<PollResult> {
  const commands = await fetchPendingCommands(options)
  const result: PollResult = { fetched: commands.length, applied: 0, rejected: 0, details: [] }
  for (const command of commands) {
    const outcome = await applyCommand(repository, ctx, command)
    await ackCommand(
      `${options.endpoint}/`,
      options.credentials,
      command.commandId,
      outcome,
      options.fetchImpl,
      options.now,
    )
    if (outcome.status === "applied") result.applied += 1
    else result.rejected += 1
    result.details.push({ commandId: command.commandId, outcome: outcome.status, code: outcome.errorCode })
  }
  return result
}
