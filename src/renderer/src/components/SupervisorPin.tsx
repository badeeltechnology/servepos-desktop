import { useEffect, useRef, useState } from 'react'
import { Btn, Dialog, Keypad, PinDots, Cap, pinKey } from '../ui'
import { cn } from '../lib/utils'
import { useT } from '../stores/i18n'

// A supervisor approves an action with their PIN, inline (same pad and auto-check as VoidDialog).
export default function SupervisorPin({ title, body, onApproved, onCancel }: {
  title: string
  body?: string
  onApproved: (approver: { id: string; name: string }) => void
  onCancel: () => void
}) {
  const t = useT()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const seq = useRef(0)

  // Auto-check from 6 digits (PINs are 6-8 digits), like sign-in.
  useEffect(() => {
    if (pin.length < 6) return
    const mine = ++seq.current
    ;(async () => {
      try {
        const u = await window.api.users.verifyPin(pin)
        if (mine !== seq.current) return
        if (u && u.role === 'supervisor') onApproved({ id: u.id, name: u.name })
        else if (u) { setError(t('{name} is not a supervisor', { name: u.name })); setPin('') }
        else if (pin.length >= 8) { setError(t('Invalid PIN')); setPin('') }
      } catch { /* keep typing */ }
    })()
  }, [pin])

  return (
    <Dialog onClose={onCancel} className="w-[400px] max-w-[94vw]" label={title}>
      <div className="flex flex-col gap-2.5 bg-n-deep px-5 py-[18px] text-white">
        <span className="cond text-[26px] font-bold leading-none">{title}</span>
        {body && <span className="text-[13px] text-n-frost">{body}</span>}
        <Cap className="mt-1 text-n-mist">{t('Supervisor PIN')}</Cap>
        <span className={cn('text-[13px]', error ? 'font-semibold text-n-coral' : 'text-n-frost')}>{error || t('A supervisor enters their PIN to approve.')}</span>
        <PinDots count={Math.max(6, pin.length)} filled={pin.length} size={14} />
        <Keypad className="h-[248px]" onKey={(k) => { setError(''); setPin(pinKey(pin, k)) }} keyClass="text-[28px]" />
      </div>
      <div className="flex bg-white px-4 py-3">
        <Btn size="lg" variant="outline" onClick={onCancel}>{t('Cancel')}</Btn>
      </div>
    </Dialog>
  )
}
