import { parentPort } from 'node:worker_threads'
import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import SQLite from 'better-sqlite3'
import { openStorage, backupStorage } from './native-storage'
import { setDb, getDb } from './worker-store'
import * as queries from './worker-queries'

let database: SQLite.Database | undefined
let directory = ''
const port = parentPort!

async function handle(message: {method: string; args: any[]}): Promise<any> {
  const {method, args} = message
  if (method === 'open') {
    if (database) throw new Error('Database already open')
    directory = args[0]
    const result = await openStorage(directory, args[1])
    database = result.database
    if (database) setDb(database)
    return {candidates: result.candidates, archive: result.archive}
  }
  if (!database) throw new Error('Database is not open')
  if (method === 'query') {
    const fn = queries[args[0] as keyof typeof queries]
    if (typeof fn !== 'function') throw new Error('Unknown database operation')
    // Password comparisons are asynchronous and read-only. All synchronous
    // query commands (including shift close and order numbering) are atomic.
    if (args[0] === 'verifyPin' || args[0] === 'verifyAdmin') return (fn as Function)(...args[1])
    return database.transaction(() => (fn as Function)(...args[1]))()
  }
  if (method === 'all') return database.prepare(args[0]).all(...(args[1] || []))
  if (method === 'run') { getDb().run(args[0], args[1]); return }
  if (method === 'batch') {
    return database.transaction(() => {
      for (const {sql, params} of args[0]) getDb().run(sql, params)
    })()
  }
  if (method === 'restoreSettings') {
    const backup = args[0]
    const allowed = ['config', 'receipt_config', 'admin', 'users', 'printers', 'print_routes', 'payment_methods', 'waiters', 'modifier_groups', 'modifiers', 'item_modifier_groups']
    // Preserve a full transaction-inclusive backup before changing settings.
    await backupStorage(database, join(directory, `before-settings-restore-${Date.now()}.db`))
    database.pragma('foreign_keys = OFF')
    try {
      database.transaction(() => {
        for (const table of allowed) {
          if (!Array.isArray(backup[table]) || !backup[table].length) continue
          const valid = new Set((database!.pragma(`table_info("${table}")`) as {name:string}[]).map(column => column.name))
          const columns = Object.keys(backup[table][0])
          if (columns.some(column => !valid.has(column))) throw new Error('Invalid backup columns for ' + table)
          database!.exec(`DELETE FROM "${table}"`)
          const insert = database!.prepare(`INSERT INTO "${table}" (${columns.map(column => '"' + column + '"').join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
          for (const row of backup[table]) insert.run(...columns.map(column => row[column] ?? null))
        }
        const missingCashier = database!.prepare("SELECT 1 FROM orders o LEFT JOIN users u ON u.id = o.cashier_id WHERE o.cashier_id IS NOT NULL AND u.id IS NULL LIMIT 1").get()
        const missingShiftUser = database!.prepare("SELECT 1 FROM sessions s LEFT JOIN users u ON u.id = s.user_id WHERE s.user_id IS NOT NULL AND u.id IS NULL LIMIT 1").get()
        if (missingCashier || missingShiftUser || (database!.pragma('foreign_key_check') as unknown[]).length) throw new Error('Settings would break existing transaction references; restore cancelled')
      })()
    } finally { database.pragma('foreign_keys = ON') }
    return
  }
  if (method === 'nextKotNumber') {
    return database.transaction(() => {
      const today = new Date().toISOString().slice(0, 10)
      const number = queries.getConfig('kot_seq_date') === today ? Number(queries.getConfig('kot_seq_number') || 0) + 1 : 1
      queries.setConfig('kot_seq_date', today); queries.setConfig('kot_seq_number', String(number))
      return number
    })()
  }
  if (method === 'barrier') return // Previous commands have already committed.
  if (method === 'backup') { await backupStorage(database, args[0]); return }
  if (method === 'close' || method === 'reset') {
    // A checkpoint is not required for durability: committed WAL survives close
    // and crashes. Do not delete WAL/SHM manually or mask a close exception.
    database.close(); database = undefined; setDb(undefined)
    if (method === 'reset') {
      const archive = join(directory, `before-reset-${Date.now()}`)
      mkdirSync(archive)
      for (const file of ['servepos-native.db','servepos-native.db-wal','servepos-native.db-shm','servepos-native.adopted','servepos-native.migrating','servepos.db','servepos.db.bak','servepos.db.tmp']) {
        if (existsSync(join(directory,file))) renameSync(join(directory,file),join(archive,file))
      }
    }
    return
  }
  throw new Error('Unknown database request')
}

// Serialize even asynchronous backup/auth/open operations. Requests cannot
// interleave with a migration, restore, or the steps of a transaction.
let queue = Promise.resolve()
port.on('message', message => {
  queue = queue.then(async () => {
    try {
      const value = await handle(message)
      const config = database ? queries.getAllConfig() : {}
      const receiptConfig = database ? queries.getAllReceiptConfig() : {}
      port.postMessage({id: message.id, value, config, receiptConfig})
    } catch (error: any) {
      port.postMessage({id: message.id, error: {message: error.message, code: error.code}})
    }
  })
})
