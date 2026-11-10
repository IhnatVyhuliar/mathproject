// Usage: node --disable-warning=ExperimentalWarning scripts/smoke.mjs [--app <executable>]
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { openDb, importData } from '../electron/db.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const appIdx = process.argv.indexOf('--app')
const appExe = appIdx > -1 ? process.argv[appIdx + 1] : null

const dir = mkdtempSync(join(tmpdir(), 'scoreboard-smoke-'))
const demo = JSON.parse(readFileSync(join(root, 'test/fixtures/demo-export.json'), 'utf8'))
const db = openDb(join(dir, 'scoreboard.sqlite'))
importData(db, demo.data)
db.close()

const [cmd, args] = appExe ? [appExe, []] : [electronPath, ['.']]
const child = spawn(cmd, args, {
  cwd: root,
  env: { ...process.env, SCOREBOARD_DATA_DIR: dir, SCOREBOARD_SMOKE: '1' },
  stdio: ['ignore', 'pipe', 'inherit'],
})

let out = ''
child.stdout.on('data', (d) => { out += d; process.stdout.write(d) })
const timer = setTimeout(() => { console.log('SMOKE FAIL timeout procesu'); child.kill() }, 60000)
child.on('exit', (code) => {
  clearTimeout(timer)
  const ok = code === 0 && /^SMOKE OK$/m.test(out)
  console.log(`smoke.png: ${join(dir, 'smoke.png')}`)
  process.exit(ok ? 0 : 1)
})
