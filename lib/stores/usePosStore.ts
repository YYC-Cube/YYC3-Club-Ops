import { create } from "zustand"
import type { CheckoutReceipt, PaymentMethod, PosProduct, RoomBill } from "@/lib/types"
import {
  addItem,
  checkout as checkoutService,
  getRoomBill,
  listPosProducts,
  removeItem,
} from "@/lib/services/pos"

/** POS 依赖注入点：默认走真实服务层，测试可替换。 */
export interface PosDeps {
  listProducts: (storeId: string) => Promise<PosProduct[]>
  getBill: (storeId: string, roomId: string) => Promise<RoomBill>
  addItem: (storeId: string, roomId: string, productId: string, quantity: number) => Promise<RoomBill>
  removeItem: (storeId: string, roomId: string, itemId: string) => Promise<RoomBill>
  checkout: (
    storeId: string,
    roomId: string,
    paymentMethod: PaymentMethod,
    idempotencyKey?: string,
  ) => Promise<CheckoutReceipt>
}

export const defaultPosDeps: PosDeps = {
  listProducts: listPosProducts,
  getBill: getRoomBill,
  addItem,
  removeItem,
  checkout: checkoutService,
}

interface PosState {
  storeId: string | null
  roomId: string | null
  products: PosProduct[]
  bill: RoomBill | null
  loading: boolean
  submitting: boolean
  error: string | null
  receipt: CheckoutReceipt | null
  load: (storeId: string, roomId: string, deps?: PosDeps) => Promise<void>
  refresh: (deps?: PosDeps) => Promise<void>
  addProduct: (productId: string, quantity?: number, deps?: PosDeps) => Promise<void>
  removeLine: (itemId: string, deps?: PosDeps) => Promise<void>
  settle: (paymentMethod: PaymentMethod, deps?: PosDeps) => Promise<CheckoutReceipt>
  clearReceipt: () => void
  reset: () => void
}

const initialState = {
  storeId: null,
  roomId: null,
  products: [],
  bill: null,
  loading: false,
  submitting: false,
  error: null,
  receipt: null,
}

export const usePosStore = create<PosState>((set, get) => ({
  ...initialState,

  load: async (storeId, roomId, deps = defaultPosDeps) => {
    set({ ...initialState, storeId, roomId, loading: true })
    try {
      const [products, bill] = await Promise.all([
        deps.listProducts(storeId),
        deps.getBill(storeId, roomId),
      ])
      set({ products, bill, loading: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : "加载 POS 数据失败"
      set({ loading: false, error: message, products: [], bill: null })
      throw error
    }
  },

  refresh: async (deps = defaultPosDeps) => {
    const { storeId, roomId } = get()
    if (!storeId || !roomId) return
    try {
      const [products, bill] = await Promise.all([
        deps.listProducts(storeId),
        deps.getBill(storeId, roomId),
      ])
      set({ products, bill, error: null })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "刷新账单失败" })
    }
  },

  addProduct: async (productId, quantity = 1, deps = defaultPosDeps) => {
    const { storeId, roomId } = get()
    if (!storeId || !roomId) {
      set({ error: "未选择包厢，无法点单" })
      return
    }
    set({ submitting: true, error: null })
    try {
      const bill = await deps.addItem(storeId, roomId, productId, quantity)
      set({ bill, submitting: false })
    } catch (error) {
      set({ submitting: false, error: error instanceof Error ? error.message : "点单失败" })
      throw error
    }
  },

  removeLine: async (itemId, deps = defaultPosDeps) => {
    const { storeId, roomId } = get()
    if (!storeId || !roomId) return
    set({ submitting: true, error: null })
    try {
      const bill = await deps.removeItem(storeId, roomId, itemId)
      set({ bill, submitting: false })
    } catch (error) {
      set({ submitting: false, error: error instanceof Error ? error.message : "退单失败" })
      throw error
    }
  },

  settle: async (paymentMethod, deps = defaultPosDeps) => {
    const { storeId, roomId } = get()
    if (!storeId || !roomId) {
      throw new Error("未选择包厢，无法结账")
    }
    set({ submitting: true, error: null })
    try {
      const receipt = await deps.checkout(storeId, roomId, paymentMethod)
      set({ submitting: false, receipt, bill: null })
      return receipt
    } catch (error) {
      set({ submitting: false, error: error instanceof Error ? error.message : "结账失败" })
      throw error
    }
  },

  clearReceipt: () => set({ receipt: null }),
  reset: () => set({ ...initialState }),
}))
