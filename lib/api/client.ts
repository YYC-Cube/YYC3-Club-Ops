// API 客户端：显式 Mock + 门店作用域契约
import type {
  ApiResponse,
  Session,
  User as Employee,
  CheckoutReceipt,
  OrderBillItem,
  Order,
  OrderItem,
  PaymentMethod,
  PosProduct,
  Product,
  Member,
  Room,
  RoomBill,
} from "@/lib/types"
import { RoomStatus } from "@/lib/types"
import { apiRoutes, API_PATHS } from "@/lib/api/routes"
import { runtimeConfig } from "@/lib/config/runtime"
import { PREVIEW_SESSION, createPreviewRooms } from "@/lib/mocks/preview-session"

// 模拟数据（仅非门店实体保留；包厢统一走 preview-session 的门店作用域数据）
const mockData = {
  products: [
    {
      id: "prod-001",
      name: "青岛啤酒",
      category: "酒水",
      price: 15,
      memberPrice: 12,
      cost: 8,
      stock: 100,
      unit: "瓶",
      barcode: "123456789",
      isActive: true,
      canDiscount: true,
      image: "/placeholder.svg?height=100&width=100&text=青岛啤酒",
    },
    {
      id: "prod-002",
      name: "果盘",
      category: "小食",
      price: 68,
      memberPrice: 58,
      cost: 30,
      stock: 50,
      unit: "份",
      barcode: "987654321",
      isActive: true,
      canDiscount: true,
      image: "/placeholder.svg?height=100&width=100&text=果盘",
    },
  ] as any[],

  members: [
    {
      id: "member-001",
      name: "张三",
      phone: "13800138000",
      level: "VIP",
      points: 1500,
      balance: 500,
      totalSpent: 5000,
      joinDate: "2024-01-15",
      lastVisit: "2024-12-08",
      isActive: true,
    },
    {
      id: "member-002",
      name: "李四",
      phone: "13900139000",
      level: "Gold",
      points: 800,
      balance: 200,
      totalSpent: 2000,
      joinDate: "2024-03-20",
      lastVisit: "2024-12-07",
      isActive: true,
    },
  ] as any[],

  employees: [
    {
      id: "emp-001",
      name: "王经理",
      phone: "13700137000",
      role: "manager",
      department: "管理部",
      isActive: true,
      permissions: ["all"],
    },
  ] as any[],
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status = 0,
    public readonly code = "api_error",
  ) {
    super(message)
    this.name = "ApiError"
  }
}

/** 会话绑定的 CSRF 令牌：仅保存在内存，随登录/会话/刷新响应更新。 */
let csrfToken: string | null = null

/** Mock 模式的 POS 购物车（按 门店:包厢 归档），仅用于本地预览。 */
const mockPosCart = new Map<string, OrderBillItem[]>()

function mockProducts(storeId: string): PosProduct[] {
  const base = [
    { name: "矿泉水", category: "酒水", unit: "瓶", priceCents: 800, stock: 100 },
    { name: "百威啤酒", category: "酒水", unit: "瓶", priceCents: 1800, stock: 80 },
    { name: "果盘", category: "小食", unit: "份", priceCents: 6800, stock: 30 },
    { name: "瓜子拼盘", category: "小食", unit: "份", priceCents: 2800, stock: 40 },
  ]
  return base.map((item, index) => ({
    id: `${storeId}-prod-${index + 1}`,
    storeId,
    name: item.name,
    category: item.category,
    unit: item.unit,
    priceCents: item.priceCents,
    stock: item.stock,
    status: "active" as const,
  }))
}

function mockBill(storeId: string, roomId: string, asOf = new Date()): RoomBill {
  const key = `${storeId}:${roomId}`
  const items = mockPosCart.get(key) ?? []
  const itemsCents = items.reduce((sum, item) => sum + item.totalCents, 0)
  const room = createPreviewRooms(storeId).find((item) => item.id === roomId)
  const roomCents = (room?.priceCents ?? 0) * 2
  return {
    roomId,
    orderId: `order-${roomId}`,
    orderNo: `RO${roomId}`,
    startedAt: new Date(asOf.getTime() - 90 * 60_000).toISOString(),
    billableHours: 2,
    roomCents,
    itemsCents,
    totalCents: roomCents + itemsCents,
    items,
  }
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

class ApiClient {
  private baseUrl: string
  private useMock: boolean
  private timeoutMs: number

  constructor(baseUrl: string, options: { useMock?: boolean; timeoutMs?: number } = {}) {
    this.baseUrl = baseUrl
    this.useMock = options.useMock ?? false
    this.timeoutMs = options.timeoutMs ?? 10_000
  }

  private async mockRequest<T>(data: T, delay = 500): Promise<ApiResponse<T>> {
    // 模拟网络延迟
    await new Promise((resolve) => setTimeout(resolve, delay))

    return {
      success: true,
      data,
      message: "操作成功",
    }
  }

  private rememberSession(session: Session | undefined | null): void {
    if (session?.csrfToken) {
      csrfToken = session.csrfToken
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    // 仅显式开启 Mock 时使用模拟数据，避免生产环境把失败当成功。
    if (this.useMock) {
      return this.handleMockRequest<T>(endpoint, options)
    }

    if (!this.baseUrl) {
      throw new ApiError("API 地址未配置：请设置 NEXT_PUBLIC_API_BASE_URL", 0, "missing_base_url")
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    options.signal?.addEventListener("abort", () => controller.abort(), { once: true })

    const url = `${this.baseUrl}${endpoint}`
    const method = (options.method ?? "GET").toUpperCase()
    const headers = new Headers(options.headers)
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json")
    }
    if (UNSAFE_METHODS.has(method) && csrfToken && !headers.has("X-CSRF-Token")) {
      headers.set("X-CSRF-Token", csrfToken)
    }

    let response: Response
    try {
      response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
        credentials: "include",
      })
    } catch {
      if (controller.signal.aborted) {
        throw new ApiError("请求超时，请检查网络后重试", 0, "timeout")
      }
      throw new ApiError("网络请求失败，请检查网络后重试", 0, "network_error")
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      let message = `接口返回异常（HTTP ${response.status}）`
      let code = "http_error"
      try {
        const body = (await response.json()) as ApiResponse<unknown>
        message = body.error ?? body.message ?? message
        code = body.code ?? code
      } catch {
        // 非 JSON 错误体保留默认信息
      }
      throw new ApiError(message, response.status, code)
    }

    try {
      return (await response.json()) as ApiResponse<T>
    } catch {
      throw new ApiError("接口响应不是合法 JSON", response.status, "invalid_json")
    }
  }

  private async handleMockRequest<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    console.log(`🔄 使用模拟数据: ${options.method || "GET"} ${endpoint}`)

    if (endpoint === API_PATHS.session) {
      return this.mockRequest(PREVIEW_SESSION as T)
    }

    const storeRoomsMatch = endpoint.match(/^\/stores\/([^/]+)\/rooms$/)
    if (storeRoomsMatch) {
      const storeId = decodeURIComponent(storeRoomsMatch[1])
      return this.mockRequest(createPreviewRooms(storeId) as T)
    }

    const storeRoomMatch = endpoint.match(/^\/stores\/([^/]+)\/rooms\/([^/]+)$/)
    if (storeRoomMatch) {
      const storeId = decodeURIComponent(storeRoomMatch[1])
      const roomId = decodeURIComponent(storeRoomMatch[2])
      const room = createPreviewRooms(storeId).find((item) => item.id === roomId)
      return this.mockRequest(room as T)
    }

    if (endpoint === "/products") {
      return this.mockRequest({ products: mockData.products, total: mockData.products.length } as T)
    }

    if (endpoint === "/members") {
      return this.mockRequest({ members: mockData.members, total: mockData.members.length } as T)
    }

    if (endpoint === "/employees") {
      return this.mockRequest(mockData.employees as T)
    }

    if (endpoint === "/inventory") {
      const inventory = mockData.products.map((p) => ({
        id: `inv-${p.id}`,
        productId: p.id,
        productName: p.name,
        warehouseId: "warehouse-001",
        warehouseName: "主仓库",
        quantity: p.stock,
        minStock: 10,
        maxStock: 200,
        lastUpdated: new Date().toISOString(),
      }))
      return this.mockRequest(inventory as T)
    }

    // 默认返回成功响应
    return this.mockRequest({ success: true } as T)
  }

  // 会话与门店上下文
  async getSession(): Promise<ApiResponse<Session>> {
    const response = await this.request<Session>(apiRoutes.session())
    this.rememberSession(response.data)
    return response
  }

  // 认证相关（真实模式使用 HttpOnly Cookie，不在前端保存 Token）
  async login(username: string, password: string) {
    if (!this.useMock) {
      const response = await this.request<{ session: Session }>(apiRoutes.login(), {
        method: "POST",
        body: JSON.stringify({ username, password }),
      })
      this.rememberSession(response.data?.session)
      return response
    }

    return this.mockRequest({ session: PREVIEW_SESSION })
  }

  /** 滑动续期：返回新的过期时间，并刷新 Cookie。 */
  async refreshSession(): Promise<ApiResponse<Session>> {
    if (!this.useMock) {
      const response = await this.request<{ session: Session }>(apiRoutes.refresh(), {
        method: "POST",
      })
      const session = response.data?.session
      this.rememberSession(session)
      return { ...response, data: session }
    }
    return this.mockRequest(PREVIEW_SESSION)
  }

  async logout() {
    if (!this.useMock) {
      try {
        return await this.request<{ success: boolean }>(apiRoutes.logout(), { method: "POST" })
      } finally {
        csrfToken = null
      }
    }
    return this.mockRequest({ success: true })
  }

  // 包厢管理 API（全部按门店作用域）
  async getRooms(storeId: string): Promise<ApiResponse<Room[]>> {
    return this.request(apiRoutes.rooms(storeId))
  }

  async getRoomById(storeId: string, id: string): Promise<ApiResponse<Room>> {
    return this.request(apiRoutes.room(storeId, id))
  }

  async updateRoomStatus(
    storeId: string,
    id: string,
    status: RoomStatus,
    data?: Record<string, unknown>,
  ): Promise<ApiResponse<Room>> {
    if (!this.useMock) {
      return this.request(apiRoutes.roomStatus(storeId, id), {
        method: "PUT",
        body: JSON.stringify({ status, ...data }),
      })
    }

    const room = createPreviewRooms(storeId).find((item) => item.id === id)
    return this.mockRequest({ ...room, status } as Room)
  }

  async startRoom(
    storeId: string,
    roomId: string,
    customerId?: string,
    packageId?: string,
  ): Promise<ApiResponse<{ room: Room; orderId: string }>> {
    if (!this.useMock) {
      return this.request(apiRoutes.startRoom(storeId, roomId), {
        method: "POST",
        body: JSON.stringify({ customerId, packageId }),
      })
    }

    const room = createPreviewRooms(storeId).find((item) => item.id === roomId)
    return this.mockRequest({
      room: room ? { ...room, status: RoomStatus.OCCUPIED } : null,
      orderId: `order-${Date.now()}`,
    } as { room: Room; orderId: string })
  }

  async checkoutRoom(
    storeId: string,
    roomId: string,
    idempotencyKey?: string,
    paymentMethod: PaymentMethod = "cash",
  ): Promise<ApiResponse<CheckoutReceipt>> {
    if (!this.useMock) {
      const headers: Record<string, string> = {}
      if (idempotencyKey) {
        headers["Idempotency-Key"] = idempotencyKey
      }
      return this.request(apiRoutes.checkoutRoom(storeId, roomId), {
        method: "POST",
        headers,
        body: JSON.stringify({ paymentMethod }),
      })
    }

    const room = createPreviewRooms(storeId).find((item) => item.id === roomId)
    const bill = mockBill(storeId, roomId)
    const receipt: CheckoutReceipt = {
      ...bill,
      room: room ? { ...room, status: RoomStatus.CLEANING } : ({} as Room),
      paymentMethod,
      paidAt: new Date().toISOString(),
    }
    mockPosCart.delete(`${storeId}:${roomId}`)
    return this.mockRequest(receipt)
  }

  // POS 价目表与点单
  async getProductsForStore(storeId: string): Promise<ApiResponse<PosProduct[]>> {
    if (this.useMock) {
      return this.mockRequest(mockProducts(storeId))
    }
    return this.request(apiRoutes.products(storeId))
  }

  async getRoomBill(storeId: string, roomId: string): Promise<ApiResponse<RoomBill>> {
    if (this.useMock) {
      return this.mockRequest(mockBill(storeId, roomId))
    }
    return this.request(apiRoutes.roomBill(storeId, roomId))
  }

  async addRoomItem(
    storeId: string,
    roomId: string,
    productId: string,
    quantity: number,
  ): Promise<ApiResponse<RoomBill>> {
    if (this.useMock) {
      const product = mockProducts(storeId).find((item) => item.id === productId)
      if (!product) throw new ApiError("商品不存在或已下架", 404, "not_found")
      const key = `${storeId}:${roomId}`
      const items = mockPosCart.get(key) ?? []
      items.push({
        id: `item-${items.length + 1}`,
        productId,
        name: product.name,
        unitPriceCents: product.priceCents,
        quantity,
        totalCents: product.priceCents * quantity,
        isGift: false,
        createdAt: new Date().toISOString(),
      })
      mockPosCart.set(key, items)
      return this.mockRequest(mockBill(storeId, roomId))
    }
    return this.request(apiRoutes.roomItems(storeId, roomId), {
      method: "POST",
      body: JSON.stringify({ productId, quantity }),
    })
  }

  async removeRoomItem(
    storeId: string,
    roomId: string,
    itemId: string,
  ): Promise<ApiResponse<RoomBill>> {
    if (this.useMock) {
      const key = `${storeId}:${roomId}`
      const items = (mockPosCart.get(key) ?? []).filter((item) => item.id !== itemId)
      mockPosCart.set(key, items)
      return this.mockRequest(mockBill(storeId, roomId))
    }
    return this.request(apiRoutes.roomItem(storeId, roomId, itemId), { method: "DELETE" })
  }

  async cleanRoom(storeId: string, roomId: string): Promise<ApiResponse<Room>> {
    if (!this.useMock) {
      return this.request(apiRoutes.cleanRoom(storeId, roomId), { method: "POST" })
    }

    const room = createPreviewRooms(storeId).find((item) => item.id === roomId)
    return this.mockRequest({ ...room, status: RoomStatus.AVAILABLE } as Room)
  }

  // 订单管理 API
  async getOrders(_params?: any): Promise<ApiResponse<{ orders: Order[]; total: number }>> {
    return this.request("/orders")
  }

  async createOrder(orderData: Partial<Order>): Promise<ApiResponse<Order>> {
    return this.request("/orders", {
      method: "POST",
      body: JSON.stringify(orderData),
    })
  }

  async updateOrder(id: string, orderData: Partial<Order>): Promise<ApiResponse<Order>> {
    return this.request(`/orders/${id}`, {
      method: "PUT",
      body: JSON.stringify(orderData),
    })
  }

  async addOrderItem(orderId: string, item: Omit<OrderItem, "id">): Promise<ApiResponse<OrderItem>> {
    return this.request(`/orders/${orderId}/items`, {
      method: "POST",
      body: JSON.stringify(item),
    })
  }

  // 商品管理 API
  async getProducts(_params?: any): Promise<ApiResponse<{ products: Product[]; total: number }>> {
    return this.request("/products")
  }

  async getProductById(id: string): Promise<ApiResponse<Product>> {
    return this.request(`/products/${id}`)
  }

  async createProduct(productData: Omit<Product, "id">): Promise<ApiResponse<Product>> {
    return this.request("/products", {
      method: "POST",
      body: JSON.stringify(productData),
    })
  }

  async updateProduct(id: string, productData: Partial<Product>): Promise<ApiResponse<Product>> {
    return this.request(`/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(productData),
    })
  }

  // 员工管理 API
  async getEmployees(): Promise<ApiResponse<Employee[]>> {
    return this.request("/employees")
  }

  async createEmployee(employeeData: Omit<Employee, "id">): Promise<ApiResponse<Employee>> {
    return this.request("/employees", {
      method: "POST",
      body: JSON.stringify(employeeData),
    })
  }

  async updateEmployee(id: string, employeeData: Partial<Employee>): Promise<ApiResponse<Employee>> {
    return this.request(`/employees/${id}`, {
      method: "PUT",
      body: JSON.stringify(employeeData),
    })
  }

  // 会员管理 API
  async getMembers(_params?: any): Promise<ApiResponse<{ members: Member[]; total: number }>> {
    return this.request("/members")
  }

  async getMemberByPhone(phone: string): Promise<ApiResponse<Member>> {
    if (!this.useMock) {
      return this.request(`/members/by-phone/${encodeURIComponent(phone)}`)
    }
    const member = mockData.members.find((m) => m.phone === phone)
    return this.mockRequest(member)
  }

  // 库存管理 API
  async getInventory(_warehouseId?: string): Promise<ApiResponse<any[]>> {
    return this.request("/inventory")
  }

  async updateInventory(_productId: string, _warehouseId: string, _quantity: number): Promise<ApiResponse<any>> {
    return this.request("/inventory/update", {
      method: "POST",
      body: JSON.stringify({ productId: _productId, warehouseId: _warehouseId, quantity: _quantity }),
    })
  }

  // 报表 API
  async getSalesReport(startDate: string, endDate: string): Promise<ApiResponse<any>> {
    if (!this.useMock) {
      return this.request(`/reports/sales?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`)
    }
    const mockReport = {
      totalSales: 15680.5,
      totalOrders: 45,
      averageOrderValue: 348.5,
      topProducts: mockData.products.slice(0, 3),
      salesByCategory: [
        { category: "酒水", amount: 8500, percentage: 54.2 },
        { category: "小食", amount: 4200, percentage: 26.8 },
        { category: "套餐", amount: 2980.5, percentage: 19.0 },
      ],
    }
    return this.mockRequest(mockReport)
  }

  async getRoomUtilizationReport(startDate: string, endDate: string): Promise<ApiResponse<any>> {
    if (!this.useMock) {
      return this.request(`/reports/rooms?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`)
    }
    return this.mockRequest({
      totalRooms: createPreviewRooms(PREVIEW_SESSION.currentStoreId).length,
      occupancyRate: 75.5,
      averageSessionDuration: 3.2,
    })
  }

  // 系统设置 API
  async getSettings(): Promise<ApiResponse<any>> {
    if (!this.useMock) {
      return this.request("/settings")
    }
    return this.mockRequest({
      storeName: "智慧商家KTV",
      currency: "CNY",
      timezone: "Asia/Shanghai",
      language: "zh-CN",
    })
  }

  async updateSettings(settings: any): Promise<ApiResponse<any>> {
    return this.request("/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    })
  }
}

// 创建 API 客户端实例
export const apiClient = new ApiClient(runtimeConfig.apiBaseUrl, {
  useMock: runtimeConfig.useMock,
})

export default ApiClient
