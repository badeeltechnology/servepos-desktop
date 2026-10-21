import { useEffect, useRef, useState } from 'react'
import { useStatus } from '../stores/status'
import { Btn, Dialog, Option, Keypad, PinDots, Stepper, Cap, Field, pinKey, money, C } from '../ui'
import { cn } from '../lib/utils'

// One void flow for everything: a sent line on the ticket, a held/open order, a paid sale.
// Reason → was it made (waste / return) → optional remarks, with the supervisor PIN inline
// instead of a fourth step. Same data as before: reason, disposition, remarks.

export interface VoidResult {
  reason: string
  disposition: 'Waste' | 'Return to Inventory'
  remarks: string
  qty: number
  approver: { id: string; name: string } | null
}

export interface VoidTarget {
  kind: 'line' | 'order'
  title: string
  subtitle?: string
  itemName?: string
  itemColor?: string
  detail?: string
  maxQty?: number
  unitPrice?: number
  amount?: number
}

export default function VoidDialog({ target, requirePin, onCancel, onConfirm }: {
  target: VoidTarget
  requirePin: boolean
  onCancel: () => void
  onConfirm: (r: VoidResult) => Promise<void> | void
}) {
  const cur = useStatus((s) => s.currency)
  const [reasons, setReasons] = useState<{ name: string; reason_name: string }[]>([])
  const [reason, setReason] = useState('')
  const [other, setOther] = useState(false)
  const [otherText, setOtherText] = useState('')
  const [disposition, setDisposition] = useState<VoidResult['disposition'] | ''>('')
  const [remarks, setRemarks] = useState('')
  const [showRemarks, setShowRemarks] = useState(false)
  const [qty, setQty] = useState(target.maxQty || 1)
  const [pin, setPin] = useState('')
  const [approver, setApprover] = useState<{ id: string; name: string } | null>(null)
  const [pinError, setPinError] = useState('')
  const [busy, setBusy] = useState(false)
  const verifySeq = useRef(0)

  useEffect(() => {
    window.api.voidReasons.list().then((r: any) => {
      setReasons(r || [])
      if (!r || r.length === 0) setOther(true)
    }).catch(() => setOther(true))
  }, [])

  // Auto-check the PIN from 6 digits (PINs are 6–8 digits), like sign-in.
  useEffect(() => {
    if (!requirePin || approver || pin.length < 6) return
    const mySeq = ++verifySeq.current
    ;(async () => {
      try {
        const u = await window.api.users.verifyPin(pin)
        if (mySeq !== verifySeq.current) return
        if (u && u.role === 'supervisor') { setApprover({ id: u.id, name: u.name }); setPinError('') }
        else if (u) { setPinError(`${u.name} is not a supervisor`); setPin('') }
        else if (pin.length >= 8) { setPinError('Invalid PIN'); setPin('') }
      } catch { /* keep typing */ }
    })()
  }, [pin, requirePin, approver])

  const finalReason = other ? otherText.trim() : reason
  const lineAmount = target.kind === 'line' ? (target.unitPrice || 0) * qty : target.amount || 0
  const pinOk = !requirePin || !!approver
  const ready = !!finalReason && !!disposition && pinOk && !busy

  let label: string
  if (!finalReason) label = 'Choose why'
  else if (!disposition) label = 'Was it made?'
  else if (!pinOk) label = 'Needs the supervisor PIN'
  else label = target.kind === 'line' ? `Void ${qty} · ${cur} ${money(lineAmount)}` : `Void order${target.amount ? ` · ${cur} ${money(target.amount)}` : ''}`

  async function submit() {
    if (!ready || !disposition) return
    setBusy(true)
    try {
      await onConfirm({ reason: finalReason, disposition, remarks: remarks.trim(), qty, approver })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog onClose={onCancel} className={cn('flex-row', requirePin ? 'h-[min(600px,calc(100vh-32px))] w-[800px]' : 'h-[min(600px,calc(100vh-32px))] w-[540px]')} label={target.title}>
      <div className="flex min-w-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-[18px]">
        <div className="flex flex-col gap-[3px]">
          <span className="cond text-[28px] font-bold leading-none text-n-red">{target.title}</span>
          {target.subtitle && <span className="text-[13px] text-n-muted">{target.subtitle}</span>}
        </div>

        {target.kind === 'line' && (
          <div className="flex items-center gap-2.5 rounded-md bg-white px-3 py-2.5" style={{ boxShadow: `inset 4px 0 0 ${target.itemColor || C.muted}` }}>
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-base font-semibold">{target.itemName}</span>
              {target.detail && <span className="truncate text-xs text-n-muted">{target.detail}</span>}
            </span>
            {(target.maxQty || 1) > 1 && (
              <Stepper value={qty} onDec={() => setQty(Math.max(1, qty - 1))} onInc={() => setQty(Math.min(target.maxQty || 1, qty + 1))} valueClass="min-w-[32px]" />
            )}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Why</span>
          <div className="grid grid-cols-2 gap-1.5">
            {reasons.map((r) => (
              <Option key={r.name} active={!other && reason === r.reason_name} onClick={() => { setReason(r.reason_name); setOther(false) }}>
                <span className="truncate">{r.reason_name}</span>
              </Option>
            ))}
            <Option active={other} onClick={() => setOther(true)}>Other</Option>
          </div>
          {other && (
            <Field data-keyboard="full" autoFocus={reasons.length > 0} value={otherText} onChange={(e) => setOtherText(e.target.value)} placeholder="Type the reason" />
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Was it made?</span>
          <div className="grid grid-cols-2 gap-1.5">
            <Option active={disposition === 'Waste'} onClick={() => setDisposition('Waste')}>Yes, record as waste</Option>
            <Option active={disposition === 'Return to Inventory'} onClick={() => setDisposition('Return to Inventory')}>No, return the stock</Option>
          </div>
        </div>

        {showRemarks ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Remarks <span className="font-normal text-n-muted">(optional)</span></span>
            <Field data-keyboard="full" autoFocus value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Anything the supervisor should know" />
          </div>
        ) : (
          <button type="button" onClick={() => setShowRemarks(true)} className="self-start text-sm font-semibold text-n-teal">+ Add a remark</button>
        )}

        <span className="flex-1" />
        <div className="flex gap-2">
          <Btn size="lg" variant="outline" onClick={onCancel}>Keep it</Btn>
          <span className="flex-1" />
          <Btn size="lg" variant="danger" disabled={!ready} onClick={submit} className="px-[22px] text-base font-bold">{busy ? 'Voiding…' : label}</Btn>
        </div>
      </div>

      {requirePin && (
        <div className="flex w-[270px] flex-shrink-0 flex-col gap-2.5 bg-n-deep px-4 py-[18px] text-white">
          <Cap className="text-n-mist">Supervisor PIN</Cap>
          {approver ? (
            <span className="text-[13px] font-semibold text-n-lamp">Approved by {approver.name}</span>
          ) : (
            <span className={cn('text-[13px]', pinError ? 'font-semibold text-n-coral' : 'text-n-frost')}>{pinError || 'A supervisor enters their PIN to approve.'}</span>
          )}
          <PinDots count={Math.max(6, pin.length)} filled={approver ? Math.max(6, pin.length) : pin.length} size={14} />
          <Keypad className="flex-1" onKey={(k) => { if (approver) { setApprover(null); setPin(pinKey('', k)); return } setPinError(''); setPin(pinKey(pin, k)) }} keyClass="text-[28px]" />
        </div>
      )}
    </Dialog>
  )
}
