const {Worker} = require('node:worker_threads')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'servepos-packaged-test-'))
const worker = new Worker(path.resolve(process.argv[2], 'out/main/database-worker.js'))
const pending = new Map()
let sequence = 0
worker.on('message', message => {
  const task = pending.get(message.id)
  if (!task) return
  pending.delete(message.id)
  message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.value)
})
worker.on('error', error => {for (const task of pending.values()) task.reject(error);pending.clear()})
function request(method,...args) {
  const id=++sequence
  return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});worker.postMessage({id,method,args})})
}
;(async()=>{
  await request('open',directory)
  assert.equal((await request('all','PRAGMA journal_mode'))[0].journal_mode,'wal')
  const id=await request('query','createUser',['Packaged Cashier','1234','cashier'])
  const order=await request('query','createOrder',[{orderType:'Takeaway',cashierId:id,cashierName:'Packaged Cashier'}])
  await request('query','updateOrder',[order.id,{status:'Completed'}])
  await request('close')
  await request('open',directory)
  assert.equal((await request('query','getOrder',[order.id])).status,'Completed')
  await request('close')
  console.log('Packaged native SQLite worker: create, commit, close and reopen passed')
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{
  await worker.terminate()
  fs.rmSync(directory,{recursive:true,force:true})
})
