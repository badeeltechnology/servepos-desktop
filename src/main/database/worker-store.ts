// Only the database worker imports this module. No Electron or renderer access.
import SQLite from 'better-sqlite3'

export type Row = Record<string, any>
export class NativeStore {
  constructor(readonly native: SQLite.Database) {}
  run(sql: string, params?: any[]): void {
    if (params) this.native.prepare(sql).run(...params.map(value => value === undefined ? null : value))
    else this.native.exec(sql)
  }
  prepare(sql: string) {
    const statement = this.native.prepare(sql)
    let params: any[] = []
    let rows: Row[] | undefined
    let index = -1
    return {
      bind(values: any[]) { params = values.map(value => value === undefined ? null : value); rows = undefined; index = -1 },
      step() { rows ??= statement.all(...params) as Row[]; return ++index < rows.length },
      getAsObject() { if (!rows || index < 0 || index >= rows.length) throw new Error('No current row'); return rows[index] },
      free() { rows = undefined }
    }
  }
}
let store: NativeStore | undefined
export function setDb(database?: SQLite.Database): void { store = database ? new NativeStore(database) : undefined }
export function getDb(): NativeStore { if (!store) throw new Error('Database is not open'); return store }
// Compatibility for existing query functions: each worker command commits before
// replying. There is no in-memory database or deferred snapshot left to save.
export function saveDatabase(): void {}
export function saveDatabaseSync(): void {}
