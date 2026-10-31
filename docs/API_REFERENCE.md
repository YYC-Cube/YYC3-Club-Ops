# API 参考

> 契约事实源：`contracts/openapi.yaml`；前端路径事实源：`lib/api/routes.ts`。
> 真实 API 默认运行于 `http://127.0.0.1:3032/api`。

## 客户端实例

```typescript
import { apiClient } from "@/lib/api/client"
```

## 认证与会话

### `apiClient.getSession(): Promise<ApiResponse<Session>>`
获取当前会话（tenant/user/stores/currentStoreId/expiresAt/csrfToken）。真实模式依赖 HttpOnly Cookie。

### `apiClient.login(username, password)`
登录；真实模式由服务端下发 `yyc3_session` HttpOnly Cookie，不在前端保存 Token。响应中的 `session.csrfToken` 会写入客户端内存。

### `apiClient.refreshSession(): Promise<ApiResponse<Session>>`
滑动续期；返回新的 `expiresAt` 并刷新 Cookie。受 `SESSION_MAX_LIFETIME_SECONDS` 绝对上限约束，超限返回 401 `session_expired`。

### `apiClient.logout()`
登出；真实模式会撤销服务端会话并清除 Cookie。

### CSRF 约定

- 所有 `POST/PUT/PATCH/DELETE` 请求必须携带 `X-CSRF-Token`；
- 令牌来自登录/会话/续期响应，绑定当前会话；
- 缺失、过期或伪造返回 `403 csrf_invalid`；
- `GET/HEAD/OPTIONS` 不要求。

## 包厢管理（全部按门店作用域）

### `apiClient.getRooms(storeId): Promise<ApiResponse<Room[]>>`
获取门店包厢列表。

### `apiClient.getRoomById(storeId, id): Promise<ApiResponse<Room>>`
获取单个包厢详情。

### `apiClient.updateRoomStatus(storeId, id, status, data?): Promise<ApiResponse<Room>>`
更新包厢状态。`status` 可选值：`available | occupied | reserved | cleaning | maintenance`

### `apiClient.startRoom(storeId, roomId, customerId?, packageId?): Promise<ApiResponse<{ room, orderId }>>`
开房：`available/reserved → occupied`，创建进行中订单。

### `apiClient.checkoutRoom(storeId, roomId, idempotencyKey?): Promise<ApiResponse<{ room, orderId, totalCents, billableHours }>>`
结账：`occupied → cleaning`，按门店计费规则计算；建议携带幂等键。

### `apiClient.cleanRoom(storeId, roomId): Promise<ApiResponse<Room>>`
清台：`cleaning → available`。

## 真实 API 端点（本地）

| 方法 | 路径 | CSRF | 说明 |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | 否 | 登录；限流可返回 429 |
| GET | `/api/auth/session` | 否 | 会话 + CSRF Token |
| POST | `/api/auth/refresh` | 是 | 滑动续期（绝对上限） |
| POST | `/api/auth/logout` | 是 | 撤销服务端会话 |
| GET | `/api/stores` | 否 | 授权门店 |
| GET | `/api/stores/{storeId}/rooms` | 否 | 门店包厢 |
| POST | `/api/stores/{storeId}/rooms/{roomId}/start` | 是 | 开房 |
| POST | `/api/stores/{storeId}/rooms/{roomId}/checkout` | 是 | 结账（建议 `Idempotency-Key`） |
| POST | `/api/stores/{storeId}/rooms/{roomId}/clean` | 是 | 清台 |
| PUT | `/api/stores/{storeId}/rooms/{roomId}/status` | 是 | 维修/恢复 |
| GET | `/api/stores/{storeId}/products` | 否 | 门店价目表（仅上架） |
| GET | `/api/stores/{storeId}/rooms/{roomId}/bill` | 否 | 进行中账单（房费实时估算 + 明细） |
| POST | `/api/stores/{storeId}/rooms/{roomId}/items` | 是 | 点单（校验并扣减库存） |
| DELETE | `/api/stores/{storeId}/rooms/{roomId}/items/{itemId}` | 是 | 退单（回补库存） |
| GET | `/api/admin/auth-audit?limit=` | 否 | 登录/会话审计（店长及以上，1–200 条倒序） |
| POST | `/api/admin/users/{userId}/force-logout` | 是 | 强制下线目标用户全部会话（店长及以上） |

### POS 点单与结账

- 结账请求体可选 `{ paymentMethod }`：`cash | wechat | alipay | member_card | card`，缺省 `cash`；
- 账单结构 `RoomBill`：`billableHours`、`roomCents`、`itemsCents`、`totalCents`、`items[]`；
- `totalCents = roomCents + itemsCents`；结账返回 `CheckoutReceipt`（含 `room`、`paymentMethod`、`paidAt`）；
- 幂等：携带 `Idempotency-Key`，重放返回首次账单与支付方式，不重复扣库存；
- 错误：库存不足 `409 insufficient_stock`、商品不存在/跨店 `404 not_found`、数量越界 `400 validation_error`。

### 安全审计与强制下线

- 审计事件（追加写，不可更新/删除）：`login_success`、`login_failure`、`logout`、`session_refresh`、`force_logout`；
- 每条记录含 `tenantId`、`userId`、`actorId`（强制下线的操作者）、`phone`、`ip`、`userAgent`、`createdAt`；
- 登录失败且手机号不存在时 `tenantId` 为 `null`，仅平台侧（owner）可见，租户查询不到；
- 查询受 RLS 租户作用域约束，跨租户不可见；非 manager/admin 返回 `403 forbidden_role`；
- 强制下线撤销目标用户在租户内的全部有效会话（返回 `revokedSessions`），被下线用户旧 Cookie 立即 `401`，需重新登录；
- 审计写入失败只记录服务端日志，不阻断登录主流程（可用性优先）。

### 错误码

| HTTP | code | 含义 |
| --- | --- | --- |
| 400 | `validation_error` | 参数不合法 |
| 401 | `unauthorized` / `session_expired` | 未登录 / 会话过期 |
| 403 | `forbidden_store` / `forbidden_role` / `csrf_invalid` / `no_store` | 越权 / 权限不足 / CSRF 失败 / 无门店 |
| 404 | `not_found` | 资源不存在 |
| 409 | `room_state_conflict` / `idempotency_conflict` / `insufficient_stock` | 状态冲突 / 幂等冲突 / 库存不足 |
| 429 | `rate_limited` | 登录限流（含 `Retry-After`） |

完整契约见 `contracts/openapi.yaml`；本地运行 `pnpm api:dev`（3032）。

## 订单管理

### `apiClient.getOrders(params?): Promise<ApiResponse<{ orders: Order[]; total: number }>>`
获取订单列表（POS 模块实现中）。

### `apiClient.createOrder(orderData): Promise<ApiResponse<Order>>`
创建新订单。

### `apiClient.updateOrder(id, orderData): Promise<ApiResponse<Order>>`
更新订单信息。

### `apiClient.addOrderItem(orderId, item): Promise<ApiResponse<OrderItem>>`
添加订单项。

## 商品管理

### `apiClient.getProducts(params?): Promise<ApiResponse<{ products: Product[]; total: number }>>`
获取商品列表。

### `apiClient.createProduct(productData): Promise<ApiResponse<Product>>`
创建商品。

### `apiClient.updateProduct(id, productData): Promise<ApiResponse<Product>>`
更新商品。

## 会员管理

### `apiClient.getMembers(params?): Promise<ApiResponse<{ members: Member[]; total: number }>>`
获取会员列表。

### `apiClient.getMemberByPhone(phone): Promise<ApiResponse<Member>>`
按手机号查询会员。

## 库存管理

### `apiClient.getInventory(warehouseId?): Promise<ApiResponse>`
获取库存列表。

### `apiClient.updateInventory(productId, warehouseId, quantity): Promise<ApiResponse>`
更新库存数量。

## 报表

### `apiClient.getSalesReport(startDate, endDate): Promise<ApiResponse>`
获取销售报表。

### `apiClient.getRoomUtilizationReport(startDate, endDate): Promise<ApiResponse>`
获取包厢利用率报表。

## 系统设置

### `apiClient.getSettings(): Promise<ApiResponse>`
获取系统设置。

### `apiClient.updateSettings(settings): Promise<ApiResponse>`
更新系统设置。

## Mock 数据

仅当显式设置 `NEXT_PUBLIC_USE_MOCK=true` 时使用 Mock 数据；默认关闭，接口失败会抛出 `ApiError`，不会静默降级。预览数据包含：

- 1 个租户 / 2 个门店（云枢旗舰店、滨江店）
- 每店 4 个包厢（共 8 个，覆盖 available/occupied/cleaning/maintenance）
- 2 个商品（青岛啤酒、果盘）
- 2 个会员（张三 VIP、李四 Gold）
- 1 个员工（王经理 manager）

Mock 模式不校验 CSRF（无真实网络请求）；真实模式由 `apiClient` 自动注入。
