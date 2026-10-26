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
  invoice_printed?: number
  /** Lines the kitchen has not had yet (held rounds) */
  unsent_items?: number
  order_notes?: string | null
  cashier_id?: string | null
  session_id?: string | null
}

export type Stage = 'draft' | 'kitchen' | 'ready' | 'hold' | 'invoiced'

export const STAGE: Record<Stage, { label: string; color: string }> = {
  draft: { label: 'Not sent', color: '#9A958A' },
  kitchen: { label: 'In kitchen', color: '#F4A52A' },
  ready: { label: 'Ready', color: '#2E8B57' },
  hold: { label: 'On hold', color: '#8B6F5C' },
  invoiced: { label: 'Bill printed', color: '#7C5CBF' }
}

/** One name per state, everywhere (rail, floor, open orders, close shift):
 *  anything the kitchen never got is "Not sent", held or not; a printed bill is "Bill printed". */
export function stageOf(o: { status: string; kot_printed?: number; invoice_printed?: number; unsent_items?: number }): Stage {
  if ((o.status === 'Hold' || o.status === 'Open') && (!o.kot_printed || (o.unsent_items || 0) > 0)) return 'draft'
  if (o.status === 'Ready to Serve') return 'ready'
  if (o.status === 'Invoiced' || o.invoice_printed) return 'invoiced'
  if (o.status === 'Hold') return 'hold'
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

export interface Round<L> { key: string; n: number; sentAt: string | null; sent: boolean; lines: L[] }
/** Group ticket lines into kitchen rounds: one per send time (to the minute), oldest first; lines the
 *  kitchen never got come last as "not sent yet". Lines sent before sent_at existed form round 1. */
export function groupRounds<L>(lines: L[], get: (l: L) => { sent: boolean; sentAt?: string | null }): Round<L>[] {
  const sent = new Map<string, L[]>()
  const unsent: L[] = []
  for (const l of lines) {
    const g = get(l)
    if (!g.sent) { unsent.push(l); continue }
    const k = g.sentAt ? String(g.sentAt).replace('T', ' ').slice(0, 16) : ''
    if (!sent.has(k)) sent.set(k, [])
    sent.get(k)!.push(l)
  }
  const keys = Array.from(sent.keys()).sort() // '' (unknown, oldest) sorts first
  const rounds: Round<L>[] = keys.map((k, i) => ({ key: k || 'sent', n: i + 1, sentAt: k || null, sent: true, lines: sent.get(k)! }))
  if (unsent.length) rounds.push({ key: 'new', n: rounds.length + 1, sentAt: null, sent: false, lines: unsent })
  return rounds
}
