import { app, dialog } from 'electron'
import { DatabaseClient } from './client'
import type { RecoveryCandidate } from './native-storage'

let client: DatabaseClient | undefined
export function getDb(): DatabaseClient {
  if (!client) throw new Error('Database not initialized')
  return client
}
export async function initDatabase(): Promise<void> {
  if (client) return
  const next = new DatabaseClient()
  try {
    let result = await next.request('open', app.getPath('userData'))
    if (result.candidates) {
      const candidates: RecoveryCandidate[] = result.candidates
      const {response} = await dialog.showMessageBox({
        type: 'warning', title: 'Choose the database to migrate',
        message: 'Existing database copies need review before upgrading',
        detail: 'File timestamps cannot reliably identify the latest transactions. All originals will be preserved. Compare the counts below with your last shift. If unsure, cancel and ask support to inspect the files.\n\n' +
          candidates.map(candidate => `${candidate.label}: ${candidate.orders} orders, ${candidate.completed} completed, ${candidate.sessions} shifts`).join('\n'),
        buttons: ['Cancel upgrade', ...candidates.map(candidate => `Use ${candidate.label}`)],
        defaultId: 0, cancelId: 0, noLink: true
      })
      if (response === 0) throw new Error('Database migration cancelled. Existing data was not changed.')
      result = await next.request('open', app.getPath('userData'), candidates[response - 1])
    }
    client = next
    if (result.archive) console.log('[Database] Original files preserved at', result.archive)
  } catch (error) { await next.terminate(); throw error }
}
// Legacy callers await a barrier; writes already commit with synchronous=FULL.
// There is no snapshot timer, export, copy, or deferred disk write.
export async function saveDatabase(): Promise<void> { await getDb().request('barrier') }
export const saveDatabaseSync = saveDatabase
export async function closeDatabase(): Promise<void> {
  if (!client) return
  const closing = client
  await closing.request('close')
  client = undefined
  await closing.terminate()
}
export async function deleteDatabase(): Promise<boolean> {
  const current = getDb()
  await current.request('reset')
  client = undefined
  await current.terminate()
  return true
}
