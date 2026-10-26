import { useEffect, useState } from 'react'
import { Btn, Dialog } from '../ui'
import { useFloor } from '../stores/floor'
import { useT } from '../stores/i18n'
import FloorGrid from './FloorGrid'
import { ActiveOrderRow } from './orderStatus'

// Choose (or change) the table for a ticket. Same floor as the Tables screen: room tabs, search,
// big tiles. Occupied tables show their bill but cannot be picked (there is no merge in the POS API).

interface Props {
  onSelect: (tableName: string, room: string | null) => void
  onCancel: () => void
  currentTable?: string | null
  /** Shown under the title, e.g. "Send needs a table" */
  hint?: string | null
  /** Offer "Takeaway instead" (dine-in ticket without a table) */
  onTakeaway?: () => void
  title?: string
}

export default function TablePicker({ onSelect, onCancel, currentTable, hint, onTakeaway, title }: Props) {
  const t = useT()
  const [orders, setOrders] = useState<ActiveOrderRow[]>([])
  const tables = useFloor((s) => s.tables)

  useEffect(() => {
    useFloor.getState().load()
    window.api.orders.getActive().then((l: any) => setOrders(l || [])).catch(() => {})
  }, [])

  const free = tables.filter((x) => x.status === 'Available').length

  return (
    <Dialog onClose={onCancel} className="h-[calc(100vh-32px)] w-[calc(100vw-32px)] max-w-[1200px]" label={title || t('Choose a table')}>
      <div className="flex h-16 flex-shrink-0 items-center gap-3 bg-n-deep px-4 text-white">
        <span className="flex min-w-0 flex-col">
          <span className="cond text-[26px] font-bold leading-none">{title || t('Choose a table')}</span>
          {hint && <span className="mt-0.5 truncate text-[13px] text-n-amber">{hint}</span>}
        </span>
        <span className="text-[13px] text-n-mist">{t('{n} free of {total}', { n: free, total: tables.length })}</span>
        <span className="flex-1" />
        {onTakeaway && (
          <Btn size="lg" variant="ghostDark" onClick={onTakeaway}>{t('Takeaway instead')}</Btn>
        )}
        <Btn size="lg" variant="ghostDark" onClick={onCancel}>{t('Cancel')}</Btn>
      </div>
      <div className="flex min-h-0 flex-1 flex-col bg-n-cream">
        <FloorGrid mode="pick" orders={orders} currentTable={currentTable}
          onFree={(tb) => onSelect(tb.name, tb.room)}
          onOccupied={(i) => { if (i.table.name === currentTable) onCancel() }} />
      </div>
    </Dialog>
  )
}
