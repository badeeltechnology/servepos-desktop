import { useEffect, useState } from 'react'
import { Btn, Card, Cap } from '../ui'
import { cn } from '../lib/utils'
import { askConfirm, busyReason, toast } from '../stores/ui'
import { useUpdates, fmtBytes, type UpdateChannel } from '../stores/updates'

// Supervisor settings → Updates (also on the admin panel and from the sign-in chip).
// Check → Update now (download, sales carry on) → Restart to install. The restart is refused
// while a payment, close shift or void is open, and warns about sales not yet in ERPNext.

const CHANNELS: { key: UpdateChannel; label: string; hint: string }[] = [
  { key: 'stable', label: 'Stable', hint: 'Full releases only. Right for most outlets.' },
  { key: 'pilot', label: 'Pilot', hint: 'Gets new versions first, before other outlets. For the pilot outlet only.' },
  { key: 'off', label: 'Off', hint: 'Never checks. Keeps this till on its current version.' }
]

function when(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function day(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function UpdatesPanel({ compact = false }: { compact?: boolean }) {
  const { state, pending, actionError, init, check, download, install, setChannel } = useUpdates()
  const [guard, setGuard] = useState<null | { blocked: string } | { unsynced: number } | { syncing: true }>(null)

  useEffect(() => { init() }, [init])

  if (!state) {
    return <div className="text-sm text-n-muted">Loading update status…</div>
  }

  const s = state
  const off = s.channel === 'off'
  const checking = s.status === 'checking' || pending === 'check'

  async function restart(skipSyncCheck = false) {
    const blocked = busyReason()
    if (blocked) { setGuard({ blocked }); return }
    if (!skipSyncCheck) {
      const n = await window.api.updates.pendingSync().catch(() => 0)
      if (n > 0) { setGuard({ unsynced: n }); return }
    }
    setGuard(null)
    const ok = await askConfirm({
      title: `Restart to install v${s.version}?`,
      body: 'ServePOS closes, installs the update and opens again. The till is unavailable for about a minute.',
      ok: 'Restart now'
    })
    if (!ok) return
    const done = await install()
    if (!done) toast.error(useUpdates.getState().actionError || 'Could not start the install')
  }

  async function syncFirst() {
    setGuard({ syncing: true })
    try { await window.api.sync.run() } catch { /* counted below */ }
    const n = await window.api.updates.pendingSync().catch(() => 0)
    if (n > 0) { setGuard({ unsynced: n }); toast.error(`${n} sale${n === 1 ? ' is' : 's are'} still not synced`); return }
    toast.success('All sales synced')
    await restart(true)
  }

  const statusLine = (() => {
    switch (s.status) {
      case 'disabled': return 'Updates are off on this till.'
      case 'checking': return 'Checking for updates…'
      case 'not-available': return `You're on the latest version${s.lastCheckedAt ? ` · checked ${when(s.lastCheckedAt)}` : ''}.`
      case 'available': return `Version ${s.version} is available.`
      case 'downloading': return `Downloading version ${s.version}…`
      case 'downloaded': return `Version ${s.version} is downloaded and ready to install.`
      case 'error': return 'The last check did not finish.'
      default: return off ? 'Updates are off on this till.' : 'Not checked yet. ServePOS checks a minute after start, then every 6 hours.'
    }
  })()

  return (
    <div className={cn('flex flex-col gap-4', !compact && 'max-w-2xl')} aria-label="Updates">
      {!compact && <h2 className="cond text-[30px] font-bold leading-none text-n-deep">Updates</h2>}

      <Card className="flex items-center justify-between gap-4 p-5">
        <span className="flex flex-col">
          <Cap className="text-n-muted">This till</Cap>
          <span className="cond text-[26px] font-bold leading-tight text-n-deep">ServePOS v{s.currentVersion}</span>
          <span className="text-sm text-n-muted" role="status">{statusLine}</span>
        </span>
        {(s.status !== 'downloading' && s.status !== 'downloaded') && (
          <Btn size="lg" variant="outline" disabled={off || checking} onClick={() => check()}>
            {checking ? 'Checking…' : 'Check for updates'}
          </Btn>
        )}
      </Card>

      {(s.status === 'available' || s.status === 'downloading' || s.status === 'downloaded') && (
        <Card className="flex flex-col gap-3 p-5">
          <span className="flex items-baseline justify-between gap-3">
            <span className="cond text-[24px] font-bold leading-none text-n-deep">Version {s.version}</span>
            {s.date && <span className="text-sm text-n-muted">Released {day(s.date)}</span>}
          </span>

          {s.status === 'downloading' && (
            <div className="flex flex-col gap-1.5">
              <div className="h-3 overflow-hidden rounded-full bg-n-sand" role="progressbar" aria-label="Download progress"
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(s.percent || 0)}>
                <div className="h-full rounded-full bg-n-teal transition-[width] duration-300" style={{ width: `${Math.max(2, s.percent || 0)}%` }} />
              </div>
              <span className="num flex justify-between text-[13px] text-n-muted">
                <span>{Math.round(s.percent || 0)}%{s.total ? ` · ${fmtBytes(s.transferred)} of ${fmtBytes(s.total)}` : ''}</span>
                <span>{s.bytesPerSecond ? `${fmtBytes(s.bytesPerSecond)}/s` : ''}</span>
              </span>
              <span className="text-[13px] text-n-muted">Sales carry on while it downloads.</span>
            </div>
          )}

          {s.notes ? (
            <div className="flex flex-col gap-1">
              <Cap className="text-n-muted">What's new</Cap>
              <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-n-cream p-3 text-sm leading-relaxed text-n-ink">{s.notes}</div>
            </div>
          ) : (
            <span className="text-sm text-n-muted">No release notes for this version.</span>
          )}

          {s.status === 'available' && (
            <span className="flex items-center gap-3">
              <Btn size="lg" variant="teal" disabled={pending === 'download'} onClick={() => download()}>Update now</Btn>
              <span className="text-[13px] text-n-muted">Downloads in the background. Nothing restarts until you say so.</span>
            </span>
          )}

          {s.status === 'downloaded' && !guard && (
            <span className="flex items-center gap-3">
              <Btn size="lg" variant="amber" disabled={pending === 'install'} onClick={() => restart()}>Restart to install</Btn>
              <span className="text-[13px] text-n-muted">Pick a quiet moment: the till is unavailable for about a minute.</span>
            </span>
          )}

          {guard && 'blocked' in guard && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-n-red bg-white p-3" role="alert">
              <span className="text-sm font-semibold text-n-red">Not now. {guard.blocked}</span>
              <Btn variant="outline" onClick={() => setGuard(null)}>OK</Btn>
            </div>
          )}
          {guard && ('unsynced' in guard || 'syncing' in guard) && (
            <div className="flex flex-col gap-2.5 rounded-md border border-n-amber bg-white p-3" role="alert">
              <span className="text-sm text-n-ink">
                {'unsynced' in guard
                  ? <><b>{guard.unsynced} sale{guard.unsynced === 1 ? '' : 's'} not synced to ERPNext yet.</b> They stay saved on this till and sync after the restart, but syncing first is safer.</>
                  : <b>Syncing sales…</b>}
              </span>
              <span className="flex gap-2">
                <Btn variant="teal" disabled={'syncing' in guard} onClick={syncFirst}>{'syncing' in guard ? 'Syncing…' : 'Sync first'}</Btn>
                <Btn variant="outline" disabled={'syncing' in guard} onClick={() => restart(true)}>Restart anyway</Btn>
                <span className="flex-1" />
                <Btn variant="plain" disabled={'syncing' in guard} onClick={() => setGuard(null)}>Cancel</Btn>
              </span>
            </div>
          )}
        </Card>
      )}

      {(actionError || (s.status === 'error' || s.error) && s.error) && (
        <div className="rounded-md border border-n-red bg-white p-3 text-sm text-n-red" role="alert">
          {actionError || s.error}
        </div>
      )}

      <Card className="flex flex-col gap-2.5 p-5">
        <Cap className="text-n-muted">Update channel</Cap>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Update channel">
          {CHANNELS.map((c) => {
            const on = s.channel === c.key
            return (
              <button key={c.key} type="button" role="radio" aria-checked={on} disabled={pending === 'channel'}
                onClick={() => { if (!on) setChannel(c.key) }}
                className={cn('press flex flex-col items-start gap-1 rounded-md bg-white p-3 text-start', on ? 'border-2 border-n-deep' : 'border border-n-edge')}>
                <span className={cn('text-[15px]', on ? 'font-bold text-n-deep' : 'font-semibold text-n-ink')}>{c.label}</span>
                <span className="text-[12.5px] leading-snug text-n-muted">{c.hint}</span>
              </button>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
