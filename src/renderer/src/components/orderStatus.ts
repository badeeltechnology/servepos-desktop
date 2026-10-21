// Shared vocabulary for order states on the rail, the open-orders board and the coordinator.

export interface ActiveOrderRow {
  id: string
  order_number: string
  status: string
  table_name: string | null
  room?: string | null
  order_type: string
  guests?: number
  waiter_name: string | null
  cashier_name?: string | null
  grand_total: number
  created_at: string
  kot_printed?: number
  order_notes?: string | null
}

export type Stage = 'draft' | 'kitchen' | 'ready' | 'hold' | 'invoiced'

export const STAGE: Record<Stage, { label: string; color: string }> = {
  draft: { label: 'Not sent', color: '#9A958A' },
  kitchen: { label: 'In kitchen', color: '#F4A52A' },
  ready: { label: 'Ready', color: '#2E8B57' },
  hold: { label: 'On hold', color: '#8B6F5C' },
  invoiced: { label: 'Bill printed', color: '#7C5CBF' }
}

export function stageOf(o: { status: string; kot_printed?: number }): Stage {
  if (o.status === 'Hold') return 'hold'
  if (o.status === 'Ready to Serve') return 'ready'
  if (o.status === 'Invoiced') return 'invoiced'
  if (o.status === 'Preparing') return 'kitchen'
  return o.kot_printed ? 'kitchen' : 'draft'
}

/** Short label: table, or TA 142 / D 142 / #142. */
export function orderLabel(o: { table_name: string | null; order_type: string; order_number: string }) {
  if (o.table_name) return o.table_name
  const n = (o.order_number || '').split('-').pop()
  return `${o.order_type === 'Takeaway' ? 'TA' : o.order_type === 'Delivery' ? 'D' : '#'} ${n}`
}

export function typeShort(t: string) {
  return t === 'Dine In' ? 'Dine in' : t
}
