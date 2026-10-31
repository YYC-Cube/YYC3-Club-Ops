import { Pool } from "pg"
import { PREVIEW_STORES, PREVIEW_TENANT, createPreviewRooms } from "../../lib/mocks/preview-session"
import { createSeedUsers } from "../domain"
import { isTestMode, loadLocalEnv, resolveDatabaseUrl } from "../env"

export async function seedDatabase(
  connectionString: string,
  demoPassword: string,
): Promise<void> {
  const users = createSeedUsers(demoPassword)
  const pool = new Pool({ connectionString, max: 1 })
  const client = await pool.connect()

  try {
    await client.query("BEGIN")
    // 002 起 tenant/store 为 FORCE RLS：种子写入前需先建立租户作用域。
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [PREVIEW_TENANT.id])

    await client.query(
      `INSERT INTO app.tenant (id, name, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [PREVIEW_TENANT.id, PREVIEW_TENANT.name, PREVIEW_TENANT.status, PREVIEW_TENANT.createdAt, PREVIEW_TENANT.updatedAt],
    )

    for (const store of PREVIEW_STORES) {
      await client.query(
        `INSERT INTO app.store (id, tenant_id, code, name, timezone, currency, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO NOTHING`,
        [
          store.id,
          store.tenantId,
          store.code,
          store.name,
          store.timezone,
          store.currency,
          store.status,
          store.createdAt,
          store.updatedAt,
        ],
      )
    }

    for (const user of users) {
      await client.query(
        `INSERT INTO app.app_user
           (id, tenant_id, name, phone, role, password_salt, password_hash, permissions, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO NOTHING`,
        [
          user.id,
          user.tenantId,
          user.name,
          user.phone,
          user.role,
          user.passwordSalt,
          user.passwordHash,
          user.permissions,
          "active",
          user.createdAt,
          user.updatedAt,
        ],
      )

      for (const storeId of user.storeIds) {
        await client.query(
          `INSERT INTO app.user_store (user_id, tenant_id, store_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, store_id) DO NOTHING`,
          [user.id, user.tenantId, storeId],
        )
      }
    }

    for (const store of PREVIEW_STORES) {
      // FORCE RLS：即使 owner 也需要显式门店作用域
      await client.query(
        "SELECT set_config('app.tenant_id', $1, true), set_config('app.store_id', $2, true)",
        [PREVIEW_TENANT.id, store.id],
      )
      for (const room of createPreviewRooms(store.id)) {
        await client.query(
          `INSERT INTO app.room
             (id, tenant_id, store_id, name, type, status, price_cents, floor, capacity)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO NOTHING`,
          [
            room.id,
            PREVIEW_TENANT.id,
            room.storeId,
            room.name,
            room.type,
            room.status,
            room.priceCents,
            room.floor ?? null,
            room.capacity ?? null,
          ],
        )
      }
    }

    await client.query("COMMIT")
    console.log(`[db] seeded tenant=${PREVIEW_TENANT.id} stores=${PREVIEW_STORES.length} users=${users.length}`)
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

async function main(): Promise<void> {
  loadLocalEnv()
  const test = isTestMode()
  const connectionString = resolveDatabaseUrl("owner", test)
  const demoPassword = process.env.DEMO_ADMIN_PASSWORD?.trim()
  if (!demoPassword) {
    throw new Error("缺少 DEMO_ADMIN_PASSWORD")
  }
  await seedDatabase(connectionString, demoPassword)
}

main().catch((error) => {
  console.error("[db] seed failed:", error)
  process.exitCode = 1
})
