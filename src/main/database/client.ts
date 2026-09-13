import { Worker } from 'node:worker_threads'
import { join } from 'node:path'

export class DatabaseClient {
  private worker: Worker
  private sequence = 0
  private pending = new Map<number, {resolve: (value: any) => void; reject: (error: Error) => void}>()
  private failure?: Error
  config: Record<string, string> = {}
  receiptConfig: Record<string, string> = {}
  constructor(workerPath = join(__dirname, 'database-worker.js')) {
    this.worker = new Worker(workerPath)
    this.worker.on('message', message => {
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.error) pending.reject(Object.assign(new Error(message.error.message), {code: message.error.code}))
      else {
        this.config = message.config
        this.receiptConfig = message.receiptConfig
        pending.resolve(message.value)
      }
    })
    this.worker.on('error', error => this.fail(error))
    this.worker.on('exit', code => this.fail(new Error(`Database worker stopped (${code}). Restart the application before taking further sales.`)))
  }
  private fail(error: Error): void {
    this.failure = error
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }
  request<T = any>(method: string, ...args: any[]): Promise<T> {
    if (this.failure) return Promise.reject(this.failure)
    const id = ++this.sequence
    return new Promise((resolve, reject) => {
      this.pending.set(id, {resolve, reject})
      try { this.worker.postMessage({id, method, args}) }
      catch (error) { this.pending.delete(id); reject(error) }
    })
  }
  async terminate(): Promise<void> { this.fail(new Error('Database connection closed')); await this.worker.terminate() }
  async run(sql: string, params?: any[]): Promise<void> { await this.request('run', sql, params) }
  async all(sql: string, params: any[] = []): Promise<Record<string, any>[]> { return this.request('all', sql, params) }
  async batch(statements: {sql: string; params?: any[]}[]): Promise<void> { await this.request('batch', statements) }
  prepare(sql: string): AsyncStatement { return new AsyncStatement(this, sql) }
}

// Compatibility cursor for the existing reporting/sync code. Rows are copied out
// in one worker query; no SQLite cursor or lock lives across a network await.
export class AsyncStatement {
  private params: any[] = []
  private rows?: Record<string, any>[]
  private index = -1
  constructor(private client: DatabaseClient, private sql: string) {}
  bind(params: any[]): void { this.params = params.map(value => value === undefined ? null : value); this.rows = undefined; this.index = -1 }
  async step(): Promise<boolean> { this.rows ??= await this.client.all(this.sql, this.params); return ++this.index < this.rows.length }
  getAsObject(): Record<string, any> {
    if (!this.rows || this.index < 0 || this.index >= this.rows.length) throw new Error('No current row')
    return this.rows[this.index]
  }
  free(): void { this.rows = undefined }
}
