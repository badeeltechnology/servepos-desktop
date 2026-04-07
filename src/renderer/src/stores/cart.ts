import { create } from 'zustand'

export interface CartModifier {
  id: string
  name: string
  group: string
  price: number
}

export interface CartItem {
  id: string // unique cart line id
  dbId?: string // DB row id (when resumed from placed order)
  itemCode: string
  itemName: string
  qty: number
  rate: number
  discountAmount: number
  discountPercent: number
  modifiers: CartModifier[]
  modifierTotal: number
  specialInstructions: string
  amount: number // computed: (rate * qty) - discounts + modifierTotal
}

interface CartState {
  items: CartItem[]
  orderType: 'Dine In' | 'Takeaway' | 'Delivery'
  tableName: string | null
  room: string | null
  guests: number
  waiterId: string | null
  waiterName: string | null
  orderDiscountPercent: number
  orderDiscountAmount: number
  orderDiscountReason: string
  promoName: string | null
  orderNotes: string

  // Actions
  addItem: (item: Omit<CartItem, 'id' | 'amount' | 'discountAmount' | 'discountPercent' | 'modifierTotal' | 'specialInstructions'> & { modifiers?: CartModifier[]; specialInstructions?: string }) => void
  updateItemQty: (id: string, qty: number) => void
  removeItem: (id: string) => void
  updateItemModifiers: (id: string, modifiers: CartModifier[]) => void
  updateItemDiscount: (id: string, discountPercent: number, discountAmount: number) => void
  updateItemInstructions: (id: string, instructions: string) => void
  setOrderType: (type: 'Dine In' | 'Takeaway' | 'Delivery') => void
  setTable: (tableName: string | null, room?: string | null) => void
  setGuests: (guests: number) => void
  setWaiter: (waiterId: string | null, waiterName?: string | null) => void
  setOrderDiscount: (percent: number, amount: number, reason: string) => void
  setPromo: (promoName: string | null, discountType?: string, discountValue?: number) => void
  setOrderNotes: (notes: string) => void
  clearCart: () => void
  getSubtotal: () => number
  getModifierTotal: () => number
  getItemDiscountTotal: () => number
  getOrderDiscountValue: () => number
  getTaxTotal: (taxRate: number) => number
  getGrandTotal: (taxRate: number) => number
}

function calcItemAmount(item: { rate: number; qty: number; discountPercent: number; discountAmount: number; modifiers?: CartModifier[] }): number {
  const modTotal = (item.modifiers || []).reduce((sum, m) => sum + m.price, 0)
  const lineTotal = (item.rate + modTotal) * item.qty
  const discPct = lineTotal * (item.discountPercent / 100)
  return Math.max(0, lineTotal - discPct - item.discountAmount)
}

let cartIdCounter = 0

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  orderType: 'Dine In',
  tableName: null,
  room: null,
  guests: 1,
  waiterId: null,
  waiterName: null,
  orderDiscountPercent: 0,
  orderDiscountAmount: 0,
  orderDiscountReason: '',
  promoName: null,
  orderNotes: '',

  addItem: (item) => {
    const id = `cart-${++cartIdCounter}`
    const modifiers = item.modifiers || []
    const modifierTotal = modifiers.reduce((sum, m) => sum + m.price, 0)
    const newItem: CartItem = {
      id,
      dbId: (item as any).dbId,
      itemCode: item.itemCode,
      itemName: item.itemName,
      qty: item.qty,
      rate: item.rate,
      discountAmount: 0,
      discountPercent: 0,
      modifiers,
      modifierTotal,
      specialInstructions: item.specialInstructions || '',
      amount: calcItemAmount({ rate: item.rate, qty: item.qty, discountPercent: 0, discountAmount: 0, modifiers })
    }
    set((state) => ({ items: [...state.items, newItem] }))
  },

  updateItemQty: (id, qty) => {
    if (qty <= 0) {
      get().removeItem(id)
      return
    }
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id
          ? { ...item, qty, amount: calcItemAmount({ ...item, qty }) }
          : item
      )
    }))
  },

  removeItem: (id) => {
    set((state) => ({ items: state.items.filter((item) => item.id !== id) }))
  },

  updateItemModifiers: (id, modifiers) => {
    set((state) => ({
      items: state.items.map((item) => {
        if (item.id !== id) return item
        const modifierTotal = modifiers.reduce((sum, m) => sum + m.price, 0)
        return {
          ...item,
          modifiers,
          modifierTotal,
          amount: calcItemAmount({ ...item, modifiers })
        }
      })
    }))
  },

  updateItemDiscount: (id, discountPercent, discountAmount) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id
          ? { ...item, discountPercent, discountAmount, amount: calcItemAmount({ ...item, discountPercent, discountAmount }) }
          : item
      )
    }))
  },

  updateItemInstructions: (id, instructions) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, specialInstructions: instructions } : item
      )
    }))
  },

  setOrderType: (orderType) => set({ orderType }),
  setTable: (tableName, room) => set({ tableName, room: room ?? null }),
  setGuests: (guests) => set({ guests }),
  setWaiter: (waiterId, waiterName) => set({ waiterId, waiterName: waiterName ?? null }),
  setOrderDiscount: (percent, amount, reason) =>
    set({ orderDiscountPercent: percent, orderDiscountAmount: amount, orderDiscountReason: reason, promoName: null }),

  setOrderNotes: (orderNotes) => set({ orderNotes }),

  setPromo: (promoName, discountType, discountValue) => {
    if (!promoName) {
      set({ promoName: null, orderDiscountPercent: 0, orderDiscountAmount: 0, orderDiscountReason: '' })
    } else {
      const percent = discountType === 'Percentage' ? (discountValue || 0) : 0
      const amount = discountType === 'Amount' ? (discountValue || 0) : 0
      set({
        promoName,
        orderDiscountPercent: percent,
        orderDiscountAmount: amount,
        orderDiscountReason: `Promo: ${promoName}`
      })
    }
  },

  clearCart: () =>
    set({
      items: [],
      orderType: 'Dine In',
      tableName: null,
      room: null,
      guests: 1,
      waiterId: null,
      waiterName: null,
      orderDiscountPercent: 0,
      orderDiscountAmount: 0,
      orderDiscountReason: '',
      promoName: null,
      orderNotes: ''
    }),

  getSubtotal: () => get().items.reduce((sum, item) => sum + item.amount, 0),
  getModifierTotal: () => get().items.reduce((sum, item) => sum + item.modifierTotal * item.qty, 0),
  getItemDiscountTotal: () => {
    return get().items.reduce((sum, item) => {
      const modTotal = item.modifiers.reduce((s, m) => s + m.price, 0)
      const lineTotal = (item.rate + modTotal) * item.qty
      return sum + (lineTotal - item.amount)
    }, 0)
  },
  getOrderDiscountValue: () => {
    const subtotal = get().getSubtotal()
    const pctDiscount = subtotal * (get().orderDiscountPercent / 100)
    return pctDiscount + get().orderDiscountAmount
  },
  getTaxTotal: (taxRate) => {
    const afterDiscount = get().getSubtotal() - get().getOrderDiscountValue()
    return Math.max(0, afterDiscount) * (taxRate / 100)
  },
  getGrandTotal: (taxRate) => {
    const afterDiscount = get().getSubtotal() - get().getOrderDiscountValue()
    const tax = Math.max(0, afterDiscount) * (taxRate / 100)
    return Math.max(0, afterDiscount + tax)
  }
}))
