require('./register.cjs')
const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {fork} = require('node:child_process')
const {once} = require('node:events')
const SQLite = require('better-sqlite3')
const initSqlJs = require('sql.js')
const {DatabaseClient} = require('../src/main/database/client.ts')
const workerPath = path.resolve('out/main/database-worker.js')
const schema = fs.readFileSync(path.join(__dirname, 'fixtures/legacy-schema.sql'), 'utf8')

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'servepos-native-test-'))
  t.after(() => fs.rmSync(directory, {recursive:true, force:true}))
  return directory
}
function client(t) {
  const db = new DatabaseClient(workerPath)
  t.after(() => db.terminate())
  return db
}
async function legacy(directory, status = 'Completed', label = 'servepos.db', fixtureSchema = schema) {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run(fixtureSchema)
  db.run("INSERT INTO users(id,name,pin_hash,role) VALUES ('cashier','Test Cashier','test','cashier')")
  db.run("INSERT INTO sessions(id,user_id,status,user_name) VALUES ('shift','cashier','Open','Test Cashier')")
  db.run("INSERT INTO orders(id,order_number,order_type,status,cashier_id,session_id,grand_total,order_notes) VALUES ('order','TEST-001','Takeaway',?,'cashier','shift',42,'Preserve this note')",[status])
  db.run("INSERT INTO order_items(id,order_id,item_code,item_name,qty,rate,amount) VALUES ('line','order','ITEM','Test item',1,42,42)")
  db.run("INSERT INTO order_payments(id,order_id,payment_method,amount) VALUES ('payment','order','Cash',42)")
  const data = Buffer.from(db.export());db.close()
  fs.writeFileSync(path.join(directory,label),data)
  return data
}
const query = (db, name, ...args) => db.request('query',name,args)

test('new installation uses WAL/FULL and propagates SQL errors',async t=>{
  const directory=fixture(t),db=client(t)
  await db.request('open',directory)
  assert.equal((await db.all('PRAGMA journal_mode'))[0].journal_mode,'wal')
  assert.equal((await db.all('PRAGMA synchronous'))[0].synchronous,2)
  assert.equal((await db.all('PRAGMA foreign_keys'))[0].foreign_keys,1)
  await assert.rejects(db.run('INSERT INTO absent_table VALUES (1)'),/no such table/)
  await query(db,'setConfig','company','Test company')
  assert.equal(db.config.company,'Test company')
})

test('migrates genuine sql.js file without changing originals or losing transactions',async t=>{
  const directory=fixture(t),original=await legacy(directory),db=client(t)
  const opened=await db.request('open',directory)
  assert.ok(opened.archive)
  assert.deepEqual(fs.readFileSync(path.join(directory,'servepos.db')),original)
  assert.deepEqual(fs.readFileSync(path.join(opened.archive,'servepos.db')),original)
  const order=await query(db,'getOrder','order')
  assert.equal(order.status,'Completed');assert.equal(order.order_notes,'Preserve this note')
  assert.equal((await query(db,'getOrderPayments','order'))[0].amount,42)
  assert.equal((await query(db,'getOrderItems','order'))[0].id,'line')
  assert.equal((await query(db,'getActiveSession')).id,'shift')
  await db.request('close')
  const restart=client(t);await restart.request('open',directory)
  assert.equal((await query(restart,'getOrder','order')).status,'Completed')
})

test('never ranks divergent legacy copies by timestamps; explicit selection is required',async t=>{
  const directory=fixture(t)
  await legacy(directory,'Completed')
  await legacy(directory,'Open','servepos.db.bak')
  const future=new Date(Date.now()+60000);fs.utimesSync(path.join(directory,'servepos.db.bak'),future,future)
  const db=client(t),result=await db.request('open',directory)
  assert.equal(result.candidates.length,2)
  assert.equal(fs.existsSync(path.join(directory,'servepos-native.db')),false)
  await assert.rejects(db.request('open',directory,{label:'servepos.db',hash:'wrong'}),/changed/)
  await db.request('open',directory,result.candidates.find(c=>c.label==='servepos.db'))
  assert.equal((await query(db,'getOrder','order')).status,'Completed')
})

test('invalid originals are preserved and do not silently become an empty database',async t=>{
  const directory=fixture(t),bad=Buffer.from('corrupted original')
  fs.writeFileSync(path.join(directory,'servepos.db'),bad)
  await assert.rejects(client(t).request('open',directory),/invalid/)
  assert.deepEqual(fs.readFileSync(path.join(directory,'servepos.db')),bad)
  assert.equal(fs.existsSync(path.join(directory,'servepos-native.db')),false)
})

test('corrupt or missing native database never falls back to legacy copies',async t=>{
  const directory=fixture(t);await legacy(directory)
  const db=client(t);await db.request('open',directory);await db.request('close')
  fs.writeFileSync(path.join(directory,'servepos-native.db'),'corrupt')
  await assert.rejects(client(t).request('open',directory))
  fs.unlinkSync(path.join(directory,'servepos-native.db'))
  await assert.rejects(client(t).request('open',directory),/Native database is missing/)
})

test('concurrent order creation has unique sequence numbers and atomic rollback',async t=>{
  const directory=fixture(t),db=client(t);await db.request('open',directory)
  const user=await query(db,'createUser','Cashier','1234','cashier')
  const results=await Promise.all(Array.from({length:20},()=>query(db,'createOrder',{orderType:'Takeaway',cashierId:user,cashierName:'Cashier'})))
  assert.equal(new Set(results.map(o=>o.order_number)).size,20)
  const sequence=db.config.order_seq_number
  await assert.rejects(query(db,'createOrder',{orderType:'Invalid',cashierId:user,cashierName:'Cashier'}),/CHECK/)
  assert.equal(await query(db,'getConfig','order_seq_number'),sequence)
  assert.equal((await db.all('SELECT count(*) AS n FROM orders'))[0].n,20)
})

test('settings restore is atomic and preserves transaction references on failure',async t=>{
  const directory=fixture(t);await legacy(directory)
  const db=client(t);await db.request('open',directory)
  await assert.rejects(db.request('restoreSettings',{config:[{key:'company',value:'wrong'}],users:[{id:'different',name:'Other',pin_hash:'x',role:'cashier'}]}),/references/)
  assert.equal(await query(db,'getConfig','company'),null)
  assert.equal((await query(db,'getUsers'))[0].id,'cashier')
  assert.equal((await db.all('PRAGMA foreign_keys'))[0].foreign_keys,1)
})

test('cursor remains usable across commits and full verified backups',async t=>{
  const directory=fixture(t);await legacy(directory)
  const db=client(t);await db.request('open',directory)
  const cursor=db.prepare("SELECT 1 AS n UNION ALL SELECT 2 AS n")
  assert.equal(await cursor.step(),true)
  await query(db,'setConfig','probe','durable')
  const backup=path.join(directory,'full-backup.db');await db.request('backup',backup)
  assert.equal(await cursor.step(),true);assert.equal(cursor.getAsObject().n,2)
  const check=new SQLite(backup,{readonly:true});try{assert.equal(check.prepare('SELECT count(*) AS n FROM order_payments').get().n,1)}finally{check.close()}
})

test('read-only write failure reaches caller and leaves previous value intact',async t=>{
  const directory=fixture(t),db=client(t);await db.request('open',directory)
  await query(db,'setConfig','probe','before')
  await db.run('PRAGMA query_only = ON')
  await assert.rejects(query(db,'setConfig','probe','after'),/readonly/)
  await db.run('PRAGMA query_only = OFF')
  assert.equal(await query(db,'getConfig','probe'),'before')
})

test('a committed sale survives process termination without close or a later save',async t=>{
  const directory=fixture(t);await legacy(directory,'Open')
  const child=fork(path.join(__dirname,'kill-fixture.cjs'),[directory],{stdio:['ignore','pipe','pipe','ipc']})
  t.after(()=>{try{if(child.exitCode===null)child.kill()}catch{}})
  let stderr='';child.stderr.on('data',data=>stderr+=data)
  const ready=await Promise.race([once(child,'message').then(([message])=>message),once(child,'exit').then(()=>{throw new Error('Child failed: '+stderr)})])
  assert.equal(ready,'committed')
  const exited=once(child,'exit');child.kill();await exited
  const db=client(t);await db.request('open',directory)
  assert.equal((await query(db,'getOrder','order')).status,'Completed')
})

test('worker failure rejects pending and future calls instead of claiming success',async t=>{
  const db=client(t),directory=fixture(t);await db.request('open',directory)
  await db.terminate()
  await assert.rejects(query(db,'setConfig','probe','lost'),/closed|stopped/)
})

test('legacy CHECK upgrades preserve extra columns and values',async t=>{
  const directory=fixture(t)
  const older=schema.replace("'supervisor', 'cashier', 'coordinator'","'supervisor', 'cashier'")
    .replace("'Open', 'Hold', 'Preparing', 'Ready to Serve', 'Invoiced', 'Completed', 'Void', 'Returned'","'Open', 'Hold', 'Completed', 'Void', 'Returned'")
    .replace("'receipt', 'kot', 'prep_doc', 'invoice'","'receipt', 'kot'")
  await legacy(directory,'Completed','servepos.db',older)
  const db=client(t);await db.request('open',directory)
  assert.equal((await query(db,'getOrder','order')).order_notes,'Preserve this note')
  await query(db,'updateOrder','order',{status:'Preparing'})
  const user=await query(db,'createUser','Coordinator','9876','coordinator')
  assert.ok(user)
  assert.equal((await db.all('PRAGMA foreign_key_check')).length,0)
})

test('migration resumes after staging is complete but promotion was interrupted',async t=>{
  const directory=fixture(t);await legacy(directory)
  const db=client(t);await db.request('open',directory);await db.request('close')
  fs.renameSync(path.join(directory,'servepos-native.db'),path.join(directory,'servepos-native.migrating'))
  const restart=client(t);await restart.request('open',directory)
  assert.equal((await query(restart,'getOrder','order')).status,'Completed')
})

test('unusable staging after adoption fails closed',async t=>{
  const directory=fixture(t);await legacy(directory)
  fs.writeFileSync(path.join(directory,'servepos-native.adopted'),'native-sqlite-v1\n')
  fs.writeFileSync(path.join(directory,'servepos-native.migrating'),'partial bytes')
  await assert.rejects(client(t).request('open',directory))
  assert.equal(fs.existsSync(path.join(directory,'servepos-native.db')),false)
})

test('disk-full errors propagate and roll back the failing write',async t=>{
  const directory=fixture(t),db=client(t);await db.request('open',directory)
  await query(db,'setConfig','probe','before')
  const pages=(await db.all('PRAGMA page_count'))[0].page_count
  await db.run(`PRAGMA max_page_count = ${pages}`)
  await assert.rejects(db.run("INSERT INTO config VALUES ('huge', hex(randomblob(1000000)))"),/full/)
  assert.equal(await query(db,'getConfig','probe'),'before')
  assert.equal(await query(db,'getConfig','huge'),null)
})

test('credential updates and PIN verification work with native SQL syntax',async t=>{
  const directory=fixture(t),db=client(t);await db.request('open',directory)
  await query(db,'createAdmin','admin','before')
  assert.equal(await query(db,'updateAdminPassword','admin','after'),true)
  assert.equal(await query(db,'verifyAdmin','admin','after'),true)
  const user=await query(db,'createUser','Cashier','1234','cashier')
  await query(db,'updateUser',user,{name:'Updated',pin:'4321'})
  assert.equal((await query(db,'verifyPin','4321')).name,'Updated')
})

test('long database work does not block the caller event loop',async t=>{
  const directory=fixture(t),db=client(t);await db.request('open',directory)
  let ticks=0;const timer=setInterval(()=>ticks++,5)
  try {
    await db.all('WITH RECURSIVE n(x) AS (VALUES(0) UNION ALL SELECT x+1 FROM n WHERE x<1000000) SELECT sum(x) FROM n')
    assert.ok(ticks>0,'Caller timers should run while SQLite is busy')
  } finally {clearInterval(timer)}
})

test('closing drains preceding writes and repeated start/close cycles preserve data',async t=>{
  const directory=fixture(t),db=client(t);await db.request('open',directory)
  const write=query(db,'setConfig','probe','before-close')
  const close=db.request('close')
  await Promise.all([write,close])
  await db.terminate()
  const restart=client(t);await restart.request('open',directory)
  assert.equal(await query(restart,'getConfig','probe'),'before-close')
})

test('reset archives the live database and legacy copies before starting fresh',async t=>{
  const directory=fixture(t);await legacy(directory)
  const db=client(t);await db.request('open',directory)
  await db.request('reset')
  const resetDirectory=fs.readdirSync(directory).find(name=>name.startsWith('before-reset-'))
  assert.ok(resetDirectory)
  const saved=new SQLite(path.join(directory,resetDirectory,'servepos-native.db'),{readonly:true})
  try {assert.equal(saved.prepare('SELECT count(*) AS n FROM orders').get().n,1)}finally{saved.close()}
  await db.request('open',directory)
  assert.equal((await query(db,'getOrders')).length,0)
})
