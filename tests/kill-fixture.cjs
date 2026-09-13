require('./register.cjs')
const path = require('node:path')
const {DatabaseClient} = require('../src/main/database/client.ts')
;(async()=>{
  const db = new DatabaseClient(path.resolve('out/main/database-worker.js'))
  await db.request('open',process.argv[2])
  await db.request('query','updateOrder',['order',{status:'Completed'}])
  process.send('committed')
})().catch(error=>{console.error(error);process.exit(1)})
