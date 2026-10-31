import { beforeEach, describe, expect, it } from "vitest"
import { useOrderStore } from "@/lib/stores/useOrderStore"

beforeEach(() => {
  useOrderStore.setState({ orders: [], loading: false })
})

describe("useOrderStore/fetchOrders", () => {
  it("加载订单列表并结束 loading", async () => {
    await useOrderStore.getState().fetchOrders()
    expect(useOrderStore.getState().loading).toBe(false)
    expect(useOrderStore.getState().orders).toEqual([])
  })
})

describe("useOrderStore/createOrder", () => {
  it("创建订单时补齐默认字段", async () => {
    await useOrderStore.getState().createOrder({ roomId: "room-1", total: 368 })

    const [order] = useOrderStore.getState().orders
    expect(order.id).toEqual(expect.any(String))
    expect(order.roomId).toBe("room-1")
    expect(order.total).toBe(368)
    expect(order.status).toBe("pending")
    expect(order.createdAt).toEqual(expect.any(String))
    expect(order.items).toEqual([])
  })

  it("保留调用方传入的字段", async () => {
    await useOrderStore.getState().createOrder({
      id: "order-fixed",
      roomId: "room-2",
      total: 580,
      status: "active",
    })

    const [order] = useOrderStore.getState().orders
    expect(order.id).toBe("order-fixed")
    expect(order.status).toBe("active")
  })

  it("多次创建按顺序追加", async () => {
    await useOrderStore.getState().createOrder({ roomId: "room-1", total: 100 })
    await useOrderStore.getState().createOrder({ roomId: "room-2", total: 200 })

    expect(useOrderStore.getState().orders).toHaveLength(2)
    expect(useOrderStore.getState().orders[1].roomId).toBe("room-2")
  })
})
