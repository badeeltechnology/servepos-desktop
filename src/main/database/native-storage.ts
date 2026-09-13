import SQLite from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, mkdirSync, mkdtempSync, copyFileSync, renameSync, openSync, closeSync, fsyncSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createTables, runMigrations } from './migrations'
import { setDb } from './worker-store'

const SCHEMA_VERSION = 1
export interface RecoveryCandidate {
  label: string
  hash: string
  orders: number
  completed: number
  sessions: number
}
export interface RecoveryChoice { label: string; hash: string }
const legacyFiles = ['servepos.db', 'servepos.db.bak', 'servepos.db.tmp']

function validate(db: SQLite.Database): void {
  const rows = db.pragma('integrity_check') as {integrity_check: string}[]
  if (rows.length !== 1 || rows[0].integrity_check !== 'ok') throw new Error('Database integrity check failed')
}
function validatePos(db: SQLite.Database): void {
  validate(db)
  for (const table of ['config', 'orders', 'order_items', 'sessions']) {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) {
      throw new Error('Not a ServePOS database: missing ' + table)
    }
  }
}
function flushFile(path: string): void { const fd = openSync(path, 'r+'); try { fsyncSync(fd) } finally { closeSync(fd) } }
function flushDirectory(path: string): void {
  // Windows cannot fsync directory descriptors through this API. The completed
  // staging database and adoption marker are retained for interrupted promotion.
  if (process.platform === 'win32') return
  const fd = openSync(path, 'r'); try { fsyncSync(fd) } finally { closeSync(fd) }
}
function markAdoption(path: string): void {
  if (!existsSync(path)) { writeFileSync(path, 'native-sqlite-v1\n', { flag: 'wx', mode: 0o600 }); flushFile(path) }
}

export async function openStorage(directory: string, choice?: RecoveryChoice): Promise<{
  database?: SQLite.Database; candidates?: RecoveryCandidate[]; archive?: string
}> {
  mkdirSync(directory, {recursive: true})
  const target = join(directory, 'servepos-native.db')
  const stage = join(directory, 'servepos-native.migrating')
  const marker = join(directory, 'servepos-native.adopted')
  if (existsSync(target)) {
    const database = new SQLite(target, {fileMustExist: true})
    try {
      validatePos(database)
      const version = database.pragma('user_version', {simple: true}) as number
      if (version !== SCHEMA_VERSION) throw new Error(`Unsupported native database version ${version}; upgrade/restore required`)
      configure(database)
      markAdoption(marker)
      return {database}
    } catch (error) { database.close(); throw error }
  }
  // Never fall back to an old sql.js copy once native sales may have been made.
  if (existsSync(marker)) {
    if (!existsSync(stage)) throw new Error('Native database is missing. Original files were preserved; restore is required. No empty database was created.')
    const staged = new SQLite(stage, {readonly: true, fileMustExist: true})
    try {
      validatePos(staged)
      if (staged.pragma('user_version', {simple: true}) !== SCHEMA_VERSION) throw new Error('Incomplete migration; restore required')
    } finally { staged.close() }
    renameSync(stage, target); flushDirectory(directory)
    return openStorage(directory)
  }

  const candidates: RecoveryCandidate[] = []
  for (const label of legacyFiles) {
    const path = join(directory, label)
    if (!existsSync(path)) continue
    const bytes = readFileSync(path)
    let db: SQLite.Database | undefined
    try {
      // Buffer opens an isolated in-memory connection: never changes legacy files.
      db = new SQLite(bytes)
      validatePos(db)
      candidates.push({label, hash: createHash('sha256').update(bytes).digest('hex'),
        orders: (db.prepare('SELECT count(*) AS n FROM orders').get() as {n:number}).n,
        completed: (db.prepare("SELECT count(*) AS n FROM orders WHERE status='Completed'").get() as {n:number}).n,
        sessions: (db.prepare('SELECT count(*) AS n FROM sessions').get() as {n:number}).n})
    } catch { /* Invalid candidates remain untouched for manual recovery. */ }
    finally { db?.close() }
  }
  const hasLegacy = legacyFiles.some(label => existsSync(join(directory, label)))
  if (hasLegacy && !candidates.length) throw new Error('Existing ServePOS files are invalid. Restore is required; no empty database was created.')
  let selected = candidates[0]
  if (choice) {
    selected = candidates.find(candidate => candidate.label === choice.label && candidate.hash === choice.hash)!
    if (!selected) throw new Error('Recovery files changed; inspect them again before selecting a copy')
  } else if (new Set(candidates.map(candidate => candidate.hash)).size > 1 || (selected && selected.label !== 'servepos.db')) {
    return {candidates}
  }
  // Do not overwrite unfinished staging files. Preserve them alongside originals.
  const archive = mkdtempSync(join(directory, 'pre-native-migration-'))
  for (const label of [...legacyFiles, 'servepos-native.migrating']) {
    const from = join(directory, label)
    if (existsSync(from)) { const copy = join(archive, label); copyFileSync(from, copy); flushFile(copy) }
  }
  flushDirectory(archive)
  if (existsSync(stage)) renameSync(stage, join(archive, 'unfinished-staging-original'))
  const migration = selected ? new SQLite(readFileSync(join(directory, selected.label))) : new SQLite(':memory:')
  try {
    // All legacy DDL runs in one transaction. Foreign keys must be disabled BEFORE
    // it starts when rebuilding CHECK constraints, then validated before commit.
    migration.pragma('foreign_keys = OFF')
    setDb(migration)
    migration.transaction(() => {
      createTables(); runMigrations(); createTables()
      const violations = migration.pragma('foreign_key_check') as unknown[]
      if (violations.length) throw new Error(`Migration found ${violations.length} foreign-key violations; original files preserved`)
      migration.pragma(`user_version = ${SCHEMA_VERSION}`)
    })()
    validatePos(migration)
    await migration.backup(stage)
  } finally { setDb(undefined); migration.close() }
  const check = new SQLite(stage, {readonly: true})
  try { validatePos(check) } finally { check.close() }
  flushFile(stage)
  // Write marker before publishing: a crash between these steps resumes staging.
  markAdoption(marker); flushDirectory(directory)
  renameSync(stage, target); flushDirectory(directory)
  const opened = await openStorage(directory)
  return {...opened, archive}
}

function configure(db: SQLite.Database): void {
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = FULL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  if (db.pragma('journal_mode', {simple:true}) !== 'wal' || db.pragma('synchronous', {simple:true}) !== 2) {
    throw new Error('Cannot enable durable SQLite configuration')
  }
}

export async function backupStorage(db: SQLite.Database, destination: string): Promise<void> {
  if (resolve(destination) === resolve(db.name)) throw new Error('Choose a backup path different from the live database')
  await db.backup(destination)
  const check = new SQLite(destination, {readonly: true, fileMustExist: true})
  try { validatePos(check) } finally { check.close() }
  flushFile(destination)
}
