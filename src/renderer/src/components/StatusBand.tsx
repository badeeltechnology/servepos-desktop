import { useT, useLang } from '../stores/i18n'
import { ReactNode, useState } from 'react'
import { useStatus } from '../stores/status'
import { useAppStore } from '../stores/app'
import { Lamp, Chevron } from '../ui'
import { Clock } from '../ui/hosts'
import { toast } from '../stores/ui'

function countdown(s: number | null | undefined) {
  if (s === null || s === undefined) return ''
  if (s >= 60) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
  return `${s}s`
}

/** The 40px status band: brand, health lamps, clock, who is signed in. Nothing decorative. */
export default function StatusBand({ userName, onUser, onWaiter, showWaiter = true, subtitle, right }: {
  userName?: string
  onUser?: () => void
  onWaiter?: () => void
  showWaiter?: boolean
  subtitle?: string
  right?: ReactNode
}) {
  const { sync, pendingSync, failedSync, printers, waiterPending, erpConfigured, brand } = useStatus()
  const online = useAppStore((s) => s.isOnline)
  const [running, setRunning] = useState(false)
  const t = useT()
  const { lang, setLang } = useLang()

  const erpOk = sync?.lastResult ? !(sync.lastResult.down && sync.lastResult.down.success === false) && !(sync.lastResult.up && sync.lastResult.up.success === false) : true
  const erpTone = !erpConfigured ? 'off' : !online ? 'bad' : erpOk ? 'ok' : 'warn'
  const erpLabel = !erpConfigured ? t('ERPNext not set up') : !online ? t('Offline') : erpOk ? 'ERPNext' : t('ERPNext error')
  const erpTitle = sync?.lastResult?.down?.error || sync?.lastResult?.up?.errors?.[0] || (sync?.lastSyncAt ? `Last sync ${new Date(sync.lastSyncAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : '')

  const syncing = running || !!sync?.isSyncing
  const next = countdown(sync?.nextSyncIn)
  let syncLamp: ReactNode
  if (syncing) syncLamp = <Lamp tone="info" label={t('Syncing…')} />
  else if (failedSync > 0) syncLamp = <Lamp tone="bad" label={t('{n} failed to sync', { n: failedSync })} onClick={runSync} title="Tap to sync now" />
  else if (pendingSync > 0) syncLamp = <Lamp tone="warn" strong label={`${t('{n} to sync', { n: pendingSync })}${next ? ` · ${next}` : ''}`} onClick={runSync} title="Tap to sync now" />
  else syncLamp = <Lamp tone="ok" label={next ? `${t('All synced')} · ${next}` : t('All synced')} onClick={runSync} title="Tap to sync now" />

  async function runSync() {
    if (syncing) return
    setRunning(true)
    try {
      const r: any = await window.api.sync.run()
      if (r?.up && r.up.success === false) toast.error(`Sync finished with errors: ${r.up.errors?.[0] || ''}`)
      else toast.success(t('Sync complete'))
    } catch (e: any) {
      toast.error(`Sync failed: ${e?.message || e}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <header className="flex h-10 flex-shrink-0 items-center gap-[18px] bg-n-deep px-3.5 text-[13px] text-n-frost">
      <span className="flex min-w-0 items-baseline gap-2 text-white">
        <span className="cond truncate text-[19px] font-bold uppercase tracking-[.03em]">{brand.name}</span>
        <span className="truncate text-xs text-n-mist">{subtitle ?? brand.sub}</span>
      </span>
      <span className="flex-1" />
      <span className="hidden items-center gap-[18px] min-[900px]:flex">
        <Lamp tone={erpTone} label={erpLabel} title={erpTitle} />
        <Lamp tone={printers > 0 ? 'ok' : 'warn'} strong={printers === 0} label={printers > 0 ? t('Printers {n}', { n: printers }) : t('No printer set up')} />
      </span>
      {syncLamp}
      {showWaiter && (
        <Lamp tone={waiterPending > 0 ? 'ok' : 'off'} strong={waiterPending > 0} label={waiterPending > 0 ? t('Waiter app · {n} new', { n: waiterPending }) : t('Waiter app')} onClick={onWaiter} />
      )}
      {right}
      {onUser && (
        <button type="button" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} title="Language" aria-label={lang === 'ar' ? 'English' : 'العربية'}
          className="flex h-8 min-w-[40px] items-center justify-center rounded-full border border-n-steel px-2.5 text-[13px] font-semibold text-white">
          {lang === 'ar' ? 'EN' : 'ع'}
        </button>
      )}
      <Clock className="cond num text-[17px] font-semibold text-white" />
      {userName && (
        onUser ? (
          <button type="button" onClick={onUser} className="flex h-10 items-center gap-2 pl-2.5 pr-0.5 text-[13px] font-semibold text-white" aria-haspopup="menu">
            {userName}
            <Chevron className="text-n-mist" />
          </button>
        ) : <span className="font-semibold text-white">{userName}</span>
      )}
    </header>
  )
}
