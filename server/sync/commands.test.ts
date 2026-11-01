import { randomBytes, randomUUID } from "node:crypto"
import { beforeEach, describe, expect, it } from "vitest"
import { MemoryRepository } from "../repositories/memory"
import { createSeedUsers } from "../domain"
import { STORE_FLAGSHIP_ID } from "../../lib/mocks/preview-session"
import { PREVIEW_TENANT } from "../../lib/mocks/preview-session"
import {
  applyCommand,
  fetchPendingCommands,
  pollCommands,
  type SyncCommand,
} from "./commands"

const CTX = {
  tenantId: PREVIEW_TENANT.id,
  storeId: STORE_FLAGSHIP_ID,
  userId: "cmd-tester",
}

const buildCommand = (overrides: Partial<SyncCommand> = {}): SyncCommand => ({
  commandId: `cmd_${randomUUID()}`,
  commandType: "record.upsert",
  aggregateType: "product",
  aggregateId: `prd_${randomUUID()}`,
  version: 3,
  payload: { fields: { priceCents: 1999, status: "active" }, reason: "集团价格纠偏" },
  reason: "集团价格纠偏",
  operatorId: "usr_cms_op",
  ...overrides,
})

describe("sync/commands", () => {
  let repository: MemoryRepository

  beforeEach(() => {
    repository = new MemoryRepository(createSeedUsers(randomBytes(12).toString("hex")))
  })

  it("record.upsert @ product：应用走第一写入方路径并回传 master.product.updated", async () => {
    const product = await repository.createProduct(CTX, {
      name: "命令测试商品",
      category: "酒水",
      unit: "瓶",
      priceCents: 1500,
      stock: 10,
    })
    const command = buildCommand({ aggregateId: product.id })

    const outcome = await applyCommand(repository, CTX, command)

    expect(outcome.status).toBe("applied")
    const updated = await repository.listProducts(CTX)
    const target = updated.find((item) => item.id === product.id)
    expect(target?.priceCents).toBe(1999)
    const events = await repository.read((state) => state.syncEvents)
    const receipt = events.find(
      (event) =>
        event.eventType === "master.product.updated" && event.aggregateId === product.id,
    )
    expect(receipt).toBeDefined()
    // 商品本就 active：changedFields 只含实际变化的字段
    expect(receipt?.payload.changedFields).toEqual(["priceCents"])
  })

  it("目标不存在 → rejected not_found；未知命令类型 → rejected unsupported", async () => {
    const missing = await applyCommand(repository, CTX, buildCommand())
    expect(missing).toMatchObject({ status: "rejected", errorCode: "not_found" })

    const unknown = await applyCommand(
      repository,
      CTX,
      buildCommand({ commandType: "time.travel" }),
    )
    expect(unknown).toMatchObject({ status: "rejected", errorCode: "unsupported_command" })
  })

  it("record.archive：封存商品（status=inactive）+ price.override：强制价格", async () => {
    const product = await repository.createProduct(CTX, {
      name: "封存测试商品",
      category: "酒水",
      unit: "瓶",
      priceCents: 2000,
      stock: 10,
    })

    const archive = await applyCommand(repository, CTX, {
      ...buildCommand({ commandType: "record.archive", aggregateId: product.id }),
      payload: { operation: "archive" },
    })
    expect(archive.status).toBe("applied")
    const archived = (await repository.listProducts(CTX)).find((item) => item.id === product.id)
    expect(archived).toBeUndefined()

    const override = await applyCommand(repository, CTX, {
      ...buildCommand({ commandType: "price.override", aggregateId: product.id }),
      payload: { priceCents: 999 },
    })
    expect(override.status).toBe("applied")

    const invalid = await applyCommand(repository, CTX, {
      ...buildCommand({ commandType: "price.override", aggregateId: product.id }),
      payload: { priceCents: -5 },
    })
    expect(invalid).toMatchObject({ status: "rejected", errorCode: "invalid_price" })
  })

  it("空 fields → rejected empty_patch", async () => {
    const product = await repository.createProduct(CTX, {
      name: "空补丁商品",
      category: "小食",
      unit: "份",
      priceCents: 800,
      stock: 5,
    })
    const outcome = await applyCommand(
      repository,
      CTX,
      buildCommand({ aggregateId: product.id, payload: { fields: {} } }),
    )
    expect(outcome).toMatchObject({ status: "rejected", errorCode: "empty_patch" })
  })

  it("pollCommands：拉取 → 应用 → ACK（HMAC 头 + applied 状态体）", async () => {
    const product = await repository.createProduct(CTX, {
      name: "轮询商品",
      category: "饮品",
      unit: "杯",
      priceCents: 1000,
      stock: 9,
    })
    const command = buildCommand({ aggregateId: product.id })
    const ackBodies: Array<{ status?: string; errorCode?: string }> = []
    const fetchImpl = (async (input: unknown, init?: { method?: string; body?: string }) => {
      const url = String(input)
      if (init?.method === "GET" || init?.method === undefined) {
        return new Response(JSON.stringify({ success: true, data: { commands: [command] } }), {
          status: 200,
        })
      }
      if (url.endsWith("/ack")) {
        ackBodies.push(JSON.parse(init?.body ?? "{}") as { status?: string })
        return new Response(JSON.stringify({ success: true }), { status: 200 })
      }
      return new Response("not found", { status: 404 })
    }) as typeof fetch

    const result = await pollCommands(repository, CTX, {
      endpoint: "https://cms.example.test/api/v1/sync/commands",
      tenantId: CTX.tenantId,
      storeId: CTX.storeId,
      credentials: { accessKey: "k", secret: "s" },
      fetchImpl,
    })

    expect(result).toMatchObject({ fetched: 1, applied: 1, rejected: 0 })
    expect(ackBodies).toEqual([{ status: "applied" }])
    const updated = await repository.listProducts(CTX)
    expect(updated.find((item) => item.id === product.id)?.priceCents).toBe(1999)
  })

  it("fetchPendingCommands 非 200 抛错", async () => {
    const fetchImpl = (async () => new Response("boom", { status: 500 })) as typeof fetch
    await expect(
      fetchPendingCommands({
        endpoint: "https://cms.example.test/api/v1/sync/commands",
        tenantId: CTX.tenantId,
        storeId: CTX.storeId,
        credentials: { accessKey: "k", secret: "s" },
        fetchImpl,
      }),
    ).rejects.toThrow("http_500")
  })
})
