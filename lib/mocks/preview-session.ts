import {
  Permission,
  RoomStatus,
  RoomType,
  UserRole,
  type Room,
  type Session,
  type Store,
  type Tenant,
  type User,
} from "../types"

/**
 * 开发预览数据：仅在 NEXT_PUBLIC_USE_MOCK=true 时使用。
 * 这些数据用于验证门店上下文与契约层，不代表真实业务数据。
 */

export const PREVIEW_TENANT: Tenant = {
  id: "tenant-demo-001",
  name: "YYC³ 演示品牌",
  status: "active",
  createdAt: "2026-01-01T00:00:00.000+08:00",
  updatedAt: "2026-10-31T00:00:00.000+08:00",
}

export const STORE_FLAGSHIP_ID = "store-demo-001"
export const STORE_RIVER_ID = "store-demo-002"

export const PREVIEW_STORES: Store[] = [
  {
    id: STORE_FLAGSHIP_ID,
    tenantId: PREVIEW_TENANT.id,
    code: "FLAGSHIP",
    name: "云枢旗舰店",
    timezone: "Asia/Shanghai",
    currency: "CNY",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000+08:00",
    updatedAt: "2026-10-31T00:00:00.000+08:00",
  },
  {
    id: STORE_RIVER_ID,
    tenantId: PREVIEW_TENANT.id,
    code: "RIVER",
    name: "滨江店",
    timezone: "Asia/Shanghai",
    currency: "CNY",
    status: "active",
    createdAt: "2026-02-01T00:00:00.000+08:00",
    updatedAt: "2026-10-31T00:00:00.000+08:00",
  },
]

export const PREVIEW_USER: User = {
  id: "user-demo-manager",
  tenantId: PREVIEW_TENANT.id,
  name: "演示店长",
  phone: "13800138000",
  role: UserRole.MANAGER,
  storeIds: PREVIEW_STORES.map((store) => store.id),
  permissions: Object.values(Permission),
  createdAt: "2026-01-01T00:00:00.000+08:00",
  updatedAt: "2026-10-31T00:00:00.000+08:00",
}

export const PREVIEW_SESSION: Session = {
  user: PREVIEW_USER,
  tenant: PREVIEW_TENANT,
  stores: PREVIEW_STORES,
  currentStoreId: STORE_FLAGSHIP_ID,
  expiresAt: "2027-10-31T00:00:00.000+08:00",
}

const ROOMS_BY_STORE: Record<string, Room[]> = {
  [STORE_FLAGSHIP_ID]: [
    {
      id: "room-fs-vip-01",
      name: "VIP-01",
      type: RoomType.VIP,
      status: RoomStatus.AVAILABLE,
      storeId: STORE_FLAGSHIP_ID,
      priceCents: 58000,
      floor: 2,
      capacity: 10,
    },
    {
      id: "room-fs-vip-02",
      name: "VIP-02",
      type: RoomType.VIP,
      status: RoomStatus.OCCUPIED,
      storeId: STORE_FLAGSHIP_ID,
      priceCents: 58000,
      floor: 2,
      capacity: 10,
    },
    {
      id: "room-fs-std-01",
      name: "STD-01",
      type: RoomType.MEDIUM,
      status: RoomStatus.AVAILABLE,
      storeId: STORE_FLAGSHIP_ID,
      priceCents: 28000,
      floor: 1,
      capacity: 6,
    },
    {
      id: "room-fs-std-02",
      name: "STD-02",
      type: RoomType.MEDIUM,
      status: RoomStatus.MAINTENANCE,
      storeId: STORE_FLAGSHIP_ID,
      priceCents: 28000,
      floor: 1,
      capacity: 6,
    },
  ],
  [STORE_RIVER_ID]: [
    {
      id: "room-rv-vip-01",
      name: "滨江-VIP",
      type: RoomType.LUXURY,
      status: RoomStatus.AVAILABLE,
      storeId: STORE_RIVER_ID,
      priceCents: 68000,
      floor: 3,
      capacity: 12,
    },
    {
      id: "room-rv-01",
      name: "滨江-01",
      type: RoomType.LARGE,
      status: RoomStatus.OCCUPIED,
      storeId: STORE_RIVER_ID,
      priceCents: 38000,
      floor: 1,
      capacity: 8,
    },
    {
      id: "room-rv-02",
      name: "滨江-02",
      type: RoomType.MEDIUM,
      status: RoomStatus.AVAILABLE,
      storeId: STORE_RIVER_ID,
      priceCents: 38000,
      floor: 1,
      capacity: 6,
    },
    {
      id: "room-rv-03",
      name: "滨江-03",
      type: RoomType.MEDIUM,
      status: RoomStatus.CLEANING,
      storeId: STORE_RIVER_ID,
      priceCents: 28000,
      floor: 1,
      capacity: 6,
    },
  ],
}

export function createPreviewRooms(storeId: string): Room[] {
  return (ROOMS_BY_STORE[storeId] ?? []).map((room) => ({ ...room }))
}

export function previewStoreExists(storeId: string): boolean {
  return PREVIEW_STORES.some((store) => store.id === storeId)
}
