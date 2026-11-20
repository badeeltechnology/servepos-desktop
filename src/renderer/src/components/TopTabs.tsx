import { useTier } from '../ui'
import { cn } from '../lib/utils'
import { useT } from '../stores/i18n'

// The till's top level, under the status band: Floor | the ticket you are on | Takeaway & delivery |
// All open | Waiter app, and quick starts on the right. Replaces the 8-chip order rail: every open
// order is one tap away through a tab with a count, and "where am I" is always the active tab.

export type TopTab = 'floor' | 'ticket' | 'ta' | 'all' | 'waiter'

export default function TopTabs({ current, floorCount, ticket, taCount, allCount, waiterCount, hasTables, onTab, onNewTakeaway, onNewDelivery, onNewOrder }: {
  current: TopTab | null
  floorCount: number
  /** The ticket on the till: "A12" + "order open · 22m"; null when the till is empty */
  ticket: { label: string; sub: string; late?: boolean } | null
  taCount: number
  allCount: number
  waiterCount: number
  hasTables: boolean
  onTab: (t: TopTab) => void
  onNewTakeaway: () => void
  onNewDelivery: () => void
  onNewOrder: () => void
}) {
  const t = useT()
  const { wide } = useTier()
  const tab = (on: boolean) => cn('press flex h-11 flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3.5 text-[15px] font-semibold',
    on ? 'bg-white text-n-deep' : 'border-[1.5px] border-n-steel bg-transparent text-white')
  const count = 'cond num text-xl font-bold leading-none'
  return (
    <nav aria-label="POS" className="scroll-none flex h-14 flex-shrink-0 items-center gap-1.5 overflow-x-auto bg-n-rail px-2">
      {hasTables && (
        <button type="button" aria-pressed={current === 'floor'} onClick={() => onTab('floor')} className={tab(current === 'floor')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></svg>
          {t('Floor')} <span className={count}>{floorCount}</span>
        </button>
      )}
      {ticket && (
        <button type="button" aria-pressed={current === 'ticket'} aria-label={`${t('Current ticket')}: ${ticket.label}`} onClick={() => onTab('ticket')}
          className={cn(tab(current === 'ticket'), 'max-w-[240px] gap-2.5')}>
          <span className="cond truncate text-[22px] font-bold leading-none">{ticket.label}</span>
          <span className={cn('truncate text-[13px] font-medium', current === 'ticket' ? 'text-n-muted' : 'text-n-frost', ticket.late && 'font-semibold text-n-coral')}>{ticket.sub}</span>
        </button>
      )}
      <button type="button" aria-pressed={current === 'ta'} onClick={() => onTab('ta')} className={tab(current === 'ta')}>
        {wide ? t('Takeaway & delivery') : t('Takeaway')} <span className={count}>{taCount}</span>
      </button>
      <button type="button" aria-pressed={current === 'all'} onClick={() => onTab('all')} className={tab(current === 'all')}>
        {t('All open')} <span className={count}>{allCount}</span>
      </button>
      <button type="button" aria-pressed={current === 'waiter'} onClick={() => onTab('waiter')}
        className={cn(tab(current === 'waiter'), waiterCount > 0 && current !== 'waiter' && 'border-n-amber text-n-amber')}>
        {waiterCount > 0 && <span className="h-2 w-2 animate-pulse rounded-full bg-n-amber" aria-hidden="true" />}
        {t('Waiter app')} {waiterCount > 0 && <span className={count}>{waiterCount}</span>}
      </button>
      <span className="min-w-2 flex-1" />
      {hasTables ? (
        <>
          <button type="button" onClick={onNewTakeaway} className="press h-11 flex-shrink-0 whitespace-nowrap rounded-md bg-n-teal px-3.5 text-[15px] font-bold text-white">+ {t('Takeaway')}</button>
          {wide && <button type="button" onClick={onNewDelivery} className="press h-11 flex-shrink-0 whitespace-nowrap rounded-md bg-n-teal px-3.5 text-[15px] font-bold text-white">+ {t('Delivery')}</button>}
        </>
      ) : (
        <button type="button" onClick={onNewOrder} className="press h-11 flex-shrink-0 whitespace-nowrap rounded-md bg-n-teal px-3.5 text-[15px] font-bold text-white">{t('New order')}</button>
      )}
    </nav>
  )
}
