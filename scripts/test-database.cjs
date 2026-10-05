// Use Electron's Node ABI, matching the native module shipped to terminals.
const {spawnSync} = require('node:child_process')
const path = require('node:path')
const result = spawnSync(require('electron'), ['--test', '--test-timeout=30000', path.resolve('tests/database.test.cjs')], {
  stdio: 'inherit', env: {...process.env, ELECTRON_RUN_AS_NODE: '1'},
  timeout: 120000
})
if (result.error) throw result.error
process.exit(result.status ?? 1)
