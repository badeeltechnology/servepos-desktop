import { useMemo } from 'react'
import { ActiveOrderRow, STAGE, stageOf, orderLabel } from './orderStatus'
import { minutesSince, ageLabel, useTick } from '../ui/hosts'
import { useTier } from '../ui'
import { cn } from '../lib/utils'

// The rail: open orders you touched recently, one tap to switch. "All open" opens the board.

interface Props {
  orders: ActiveOrderRow[]
  recent: string[]
  activeOrderId: string | null
  onSelectOrder: (orderId: string) => void
  onNewOrder: () => void
  onAllOpen: () => void
}

export default function OrdersBar({ orders, recent, activeOrderId, onSelectOrder, onNewOrder, onAllOpen }: Props) {
  useTick(30000)
  const { w, wide } = useTier()
  const chipW = wide ? 126 : 118
  const room = Math.max(0, w - 16 - 120 - 120 - 12)
  const max = Math.max(1, Math.floor(room / (chipW + 6)))

  const shown = useMemo(() => {
    const byId = new Map(orders.map((o) => [o.id, o]))
    const first: ActiveOrderRow[] = []
    if (activeOrderId && byId.has(activeOrderId)) first.push(byId.get(activeOrderId)!)
    for (const id of recent) { const o = byId.get(id); if (o && !first.includes(o)) first.push(o) }
    const rest = orders.filter((o) => !first.includes(o)).sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
    return [...first, ...rest].slice(0, max)
  }, [orders, recent, activeOrderId, max])

  return (
    <nav aria-label="Open orders" className="flex h-14 flex-shrink-0 items-center gap-1.5 bg-n-rail px-2">
      {shown.map((o) => {
        const st = stageOf(o)
        const age = minutesSince(o.created_at)
        const late = age >= 30 && st !== 'hold'
        const active = o.id === activeOrderId
        return (
          <button key={o.id} type="button" aria-pressed={active} onClick={() => onSelectOrder(o.id)}
            className={cn('press flex h-11 flex-shrink-0 items-center gap-2 overflow-hidden rounded-md pr-2 text-left', active ? 'bg-white text-n-deep' : 'bg-n-deep text-white')}
            style={{ width: chipW }}>
            <span className="h-full w-[5px] flex-shrink-0" style={{ background: STAGE[st].color }} />
            <span className="cond whitespace-nowrap text-[19px] font-bold leading-none">{orderLabel(o)}</span>
            <span className="flex min-w-0 flex-col leading-[1.1]">
              <span className={cn('num text-xs font-bold', late && (active ? 'text-n-red' : 'text-n-coral'))}>{ageLabel(age)}</span>
              <span className="truncate text-[11px] opacity-75">{late && st === 'kitchen' ? 'Late' : STAGE[st].label}</span>
            </span>
          </button>
        )
      })}
      <span className="flex-1" />
      <button type="button" onClick={onAllOpen}
        className="press flex h-11 items-center gap-2 whitespace-nowrap rounded-md bg-white px-3.5 text-sm font-semibold text-n-deep">
        All open <span className="cond num text-lg font-bold">{orders.length}</span>
      </button>
      <button type="button" onClick={onNewOrder}
        className="press h-11 whitespace-nowrap rounded-md border-[1.5px] border-n-steel bg-transparent px-3.5 text-sm font-semibold text-white">
        New order
      </button>
    </nav>
  )
}
