// In-app updates. Wraps electron-updater with no native dialogs: the renderer shows the state
// (Supervisor settings → Updates, and a chip on the sign-in screen) and decides when to download
// and when to restart. Nothing downloads or installs by itself, because outlets are rolled out
// one at a time and a till must never restart in the middle of service.
//
// Channel (local config `update_channel`):
//   stable  latest full release only (default)
//   pilot   also pre-releases, for the pilot outlet
//   off     never check, not even at start-up
import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater'
import * as db from './database/queries'
import { getDb } from './database/schema'
import type { UpdateChannel, UpdateState, UpdateActionResult } from '../preload/index'

const FIRST_CHECK_MS = 60 * 1000
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000

let state: UpdateState = { status: 'idle', channel: 'stable', currentVersion: app.getVersion() }
let firstTimer: NodeJS.Timeout | null = null
let everyTimer: NodeJS.Timeout | null = null
let prepareForInstall: () => Promise<void> = async () => {}
let installing = false

function readChannel(): UpdateChannel {
  const v = (db.getConfig('update_channel') || '').trim().toLowerCase()
  return v === 'pilot' || v === 'off' ? v : 'stable'
}

function setState(patch: Partial<UpdateState>, replace = false): void {
  state = replace
    ? { channel: state.channel, currentVersion: state.currentVersion, ...patch } as UpdateState
    : { ...state, ...patch }
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('updates:state', state)
  }
}

/** GitHub release notes arrive as HTML (or a list per version): keep them as plain text. */
function notesText(notes: UpdateInfo['releaseNotes']): string {
  if (!notes) return ''
  const raw = Array.isArray(notes) ? notes.map((n) => `${n.version}\n${n.note || ''}`).join('\n\n') : String(notes)
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h\d|div)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function applyChannel(ch: UpdateChannel): void {
  autoUpdater.allowPrerelease = ch === 'pilot'
}

function clearSchedule(): void {
  if (firstTimer) clearTimeout(firstTimer)
  if (everyTimer) clearInterval(everyTimer)
  firstTimer = everyTimer = null
}

function schedule(): void {
  clearSchedule()
  if (state.channel === 'off' || !app.isPackaged) return
  const scheduled = (): void => {
    // Never re-check over a download in progress or a ready update.
    if (state.status === 'downloading' || state.status === 'downloaded') return
    void check()
  }
  firstTimer = setTimeout(scheduled, FIRST_CHECK_MS)
  everyTimer = setInterval(scheduled, CHECK_EVERY_MS)
}

function onError(e: any): void {
  // A failed download goes back to "available" so it can be retried; the message stays visible.
  const status = state.status === 'downloading' && state.version ? 'available' : 'error'
  setState({ status, error: e?.message || String(e), lastCheckedAt: new Date().toISOString() })
}

export async function check(): Promise<UpdateActionResult> {
  if (state.channel === 'off') return { ok: false, error: 'Updates are turned off on this till.', state }
  if (!app.isPackaged) {
    setState({ status: 'error', error: 'Updates only work in the installed app.', lastCheckedAt: new Date().toISOString() })
    return { ok: false, error: state.error, state }
  }
  if (state.status === 'checking' || state.status === 'downloading') return { ok: true, state }
  if (state.status === 'downloaded') return { ok: true, state }
  try {
    applyChannel(state.channel)
    await autoUpdater.checkForUpdates()
    return { ok: true, state }
  } catch (e: any) {
    setState({ status: 'error', error: e?.message || String(e), lastCheckedAt: new Date().toISOString() })
    return { ok: false, error: state.error, state }
  }
}

export async function download(): Promise<UpdateActionResult> {
  if (state.status === 'downloading' || state.status === 'downloaded') return { ok: true, state }
  if (state.status !== 'available') return { ok: false, error: 'There is no update to download. Check for updates first.', state }
  setState({ status: 'downloading', percent: 0, bytesPerSecond: 0, transferred: 0, error: undefined })
  // Progress and completion arrive as events; the promise only reports a failure.
  autoUpdater.downloadUpdate().catch((e: any) => onError(e))
  return { ok: true, state }
}

export async function install(): Promise<UpdateActionResult> {
  if (state.status !== 'downloaded') return { ok: false, error: 'The update has not finished downloading.', state }
  if (installing) return { ok: true, state }
  installing = true
  try {
    // Finish in-flight work, stop sync and close the database before the installer takes over.
    await prepareForInstall()
  } catch (e: any) {
    installing = false
    return { ok: false, error: e?.message || String(e), state }
  }
  // Silent install, then start ServePOS again.
  setImmediate(() => autoUpdater.quitAndInstall(true, true))
  // If the installer could not start, do not leave a till running with a closed database.
  setTimeout(() => { app.relaunch(); app.exit(0) }, 15000).unref()
  return { ok: true, state }
}

export async function setChannel(ch: UpdateChannel): Promise<UpdateActionResult> {
  if (ch !== 'stable' && ch !== 'pilot' && ch !== 'off') return { ok: false, error: 'Unknown channel', state }
  await db.setConfig('update_channel', ch)
  applyChannel(ch)
  // Keep a download in progress or an update ready to install; otherwise start fresh.
  if (state.status === 'downloading' || state.status === 'downloaded') setState({ channel: ch })
  else setState({ channel: ch, status: ch === 'off' ? 'disabled' : 'idle' }, true)
  schedule()
  return { ok: true, state }
}

/** Completed sales not yet in ERPNext (pending or failed). */
export async function pendingSync(): Promise<number> {
  try {
    const rows = await getDb().all("SELECT COUNT(*) AS n FROM orders WHERE status = 'Completed' AND sync_status IN ('pending', 'failed')")
    return Number(rows[0]?.n || 0)
  } catch {
    return 0
  }
}

export function initUpdater(opts: { prepareForInstall: () => Promise<void> }): void {
  prepareForInstall = opts.prepareForInstall
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  const channel = readChannel()
  state = { status: channel === 'off' ? 'disabled' : 'idle', channel, currentVersion: app.getVersion() }
  applyChannel(channel)

  autoUpdater.on('checking-for-update', () => setState({ status: 'checking', error: undefined }))
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    setState({
      status: 'available', version: info.version, notes: notesText(info.releaseNotes), date: info.releaseDate,
      percent: undefined, bytesPerSecond: undefined, total: undefined, transferred: undefined, error: undefined,
      lastCheckedAt: new Date().toISOString()
    })
  })
  autoUpdater.on('update-not-available', () => {
    setState({ status: 'not-available', lastCheckedAt: new Date().toISOString() }, true)
  })
  autoUpdater.on('download-progress', (p: ProgressInfo) => {
    setState({ status: 'downloading', percent: Math.round(p.percent * 10) / 10, bytesPerSecond: p.bytesPerSecond, total: p.total, transferred: p.transferred })
  })
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    setState({ status: 'downloaded', version: info.version, notes: notesText(info.releaseNotes) || state.notes, date: info.releaseDate || state.date, percent: 100, error: undefined })
  })
  autoUpdater.on('error', (e: Error) => onError(e))

  ipcMain.handle('updates:getState', () => state)
  ipcMain.handle('updates:check', () => check())
  ipcMain.handle('updates:download', () => download())
  ipcMain.handle('updates:install', () => install())
  ipcMain.handle('updates:setChannel', (_e, ch: UpdateChannel) => setChannel(ch))
  ipcMain.handle('updates:pendingSync', () => pendingSync())

  schedule()
}
