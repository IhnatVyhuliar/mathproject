import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDb, importData, readState } from './db.js'
import { createHandlers, registerIpc } from './ipc.js'
import { API_METHODS } from '../src/lib/apiMethods.js'
import { parseImport } from '../src/lib/exportFormat.js'

const fixturePath = (n) => fileURLToPath(new URL(`../test/fixtures/${n}`, import.meta.url))
const readFixture = (n) => readFileSync(fixturePath(n), 'utf8')
const demo = JSON.parse(readFixture('demo-export.json'))

let db, h, dialogs, shell, dir, backupDir

beforeEach(() => {
  db = openDb(':memory:')
  importData(db, demo.data)
  dir = mkdtempSync(join(tmpdir(), 'asb-ipc-'))
  backupDir = join(dir, 'kopie')
  dialogs = {
    save: { canceled: true }, open: { canceled: true }, box: { response: 1 }, calls: [],
    showSaveDialog(o) { this.calls.push(['save', o]); return Promise.resolve(this.save) },
    showOpenDialog(o) { this.calls.push(['open', o]); return Promise.resolve(this.open) },
    showMessageBox(o) { this.calls.push(['box', o]); return Promise.resolve(this.box) },
  }
  shell = { shown: [], showItemInFolder(p) { this.shown.push(p) } }
  h = createHandlers(db, {
    dialogs, shell, dbPath: '/x/db.sqlite', backupDir,
    now: () => new Date(2026, 10, 10, 9, 5, 7),
  })
})

const newClass = (o = {}) => ({
  id: 'c-new', name: 'Nowa', icon: '🚀', color: '#fff', pointStep: null, weightStep: null,
  createdAt: '2026-11-10T00:00:00.000Z', ...o,
})

test('handlers cover every API method', () =>
  assert.deepEqual(Object.keys(h).sort(), [...API_METHODS].sort()))

test('getState returns stored data', () =>
  assert.deepEqual(h.getState(), { ok: true, value: demo.data }))

test('putSettings updates; invalid → error', () => {
  assert.equal(h.putSettings({ pointStep: 2 }).ok, true)
  assert.equal(readState(db).pointStep, 2)
  assert.equal(h.putSettings({ weightStep: 0 }).ok, false)
  assert.equal(h.putSettings({}).ok, false)
})

test('createClass persists; invalid → error; duplicate → Konflikt', () => {
  assert.equal(h.createClass(newClass()).ok, true)
  assert.equal(readState(db).classes.at(-1).id, 'c-new')
  assert.equal(h.createClass(newClass({ id: 'c-2', name: '  ' })).ok, false)
  assert.deepEqual(h.createClass(newClass()), { ok: false, error: 'Konflikt danych' })
})

test('createStudent with missing class → Konflikt', () => {
  const r = h.createStudent({ id: 's-x', classId: 'nope', firstName: 'A', lastName: '', number: '', createdAt: 't' })
  assert.deepEqual(r, { ok: false, error: 'Konflikt danych' })
})

test('patch whitelists fields; unknown id → Nie znaleziono; pointStep:null clears override', () => {
  const id = demo.data.classes[0].id
  assert.equal(h.patchClass(id, { name: 'Zmieniona', pointStep: 3 }).ok, true)
  assert.equal(readState(db).classes[0].pointStep, 3)
  assert.equal(h.patchClass(id, { pointStep: null }).ok, true)
  assert.equal(readState(db).classes[0].pointStep, null)
  assert.equal(h.patchClass(id, { id: 'hack' }).ok, false)
  assert.equal(h.patchClass(id, { 'name = 1; --': 'x' }).ok, false)
  assert.equal(h.patchClass(id, {}).ok, false)
  assert.deepEqual(h.patchClass('nope', { name: 'x' }), { ok: false, error: 'Nie znaleziono rekordu' })
  assert.equal(h.patchStudent(demo.data.students[0].id, { firstName: 'Zed' }).ok, true)
  assert.equal(h.patchCategory(demo.data.categories[0].id, { weight: -1 }).ok, false)
})

test('deleteClass cascades', () => {
  const id = demo.data.classes[0].id
  assert.equal(h.deleteClass(id).ok, true)
  const s = readState(db)
  assert.ok(!s.classes.some((c) => c.id === id))
  assert.ok(!s.students.some((x) => x.classId === id))
  assert.ok(!s.categories.some((x) => x.classId === id))
  assert.deepEqual(h.deleteClass(id), { ok: false, error: 'Nie znaleziono rekordu' })
})

test('createPoints is all-or-nothing', () => {
  const s = demo.data.students[0], c = demo.data.categories.find((x) => x.classId === s.classId)
  const e = (id, points) => ({ id, studentId: s.id, categoryId: c.id, points, note: '', date: '2026-11-10', createdAt: 't' })
  const before = readState(db).entries.length
  assert.equal(h.createPoints([e('p-1', 5), e('p-2', 'abc')]).ok, false)
  assert.equal(readState(db).entries.length, before)
  // passes validation, fails in SQL on the second row (duplicate id) → rolled back
  assert.deepEqual(h.createPoints([e('p-1', 5), e('p-1', 5)]), { ok: false, error: 'Konflikt danych' })
  assert.equal(readState(db).entries.length, before)
  assert.equal(h.createPoints([]).ok, false)
  assert.equal(h.createPoints([e('p-1', 5), e('p-2', 2)]).ok, true)
  assert.equal(readState(db).entries.length, before + 2)
})

test('unexpected errors are logged and masked', () => {
  const orig = console.error
  const logged = []
  console.error = (...a) => logged.push(a)
  try {
    db.close()
    assert.deepEqual(h.getState(), { ok: false, error: 'Nieoczekiwany błąd zapisu' })
  } finally { console.error = orig }
  assert.equal(logged.length, 1)
})

test('exportToFile writes a file parseImport accepts; cancel writes nothing', async () => {
  const out = join(dir, 'out.json')
  assert.deepEqual((await h.exportToFile()).value, { canceled: true })
  assert.equal(existsSync(out), false)
  dialogs.save = { canceled: false, filePath: out }
  const r = await h.exportToFile()
  assert.equal(r.value.path, out)
  assert.deepEqual(parseImport(readFileSync(out, 'utf8')).data, demo.data)
  assert.equal(JSON.parse(readFileSync(out, 'utf8')).source, 'app')
  const opts = dialogs.calls.at(-1)[1]
  assert.equal(opts.defaultPath, 'arcade-scoreboard-2026-11-10.json') // local date of the injected now()
  assert.deepEqual(opts.filters, [{ name: 'Kopia Arcade Scoreboard', extensions: ['json'] }])
})

test('import into non-empty DB: cancel changes nothing (Review Focus 2)', async () => {
  dialogs.open = { canceled: false, filePaths: [fixturePath('local-v1.json')] }; dialogs.box = { response: 1 }
  assert.deepEqual((await h.importFromFile()).value, { canceled: true })
  assert.deepEqual(readState(db), demo.data)
  assert.equal(existsSync(backupDir), false)
  const box = dialogs.calls.find((c) => c[0] === 'box')[1]
  assert.deepEqual(box.buttons, ['Importuj', 'Anuluj'])
  assert.equal(box.noLink, true)
  assert.match(box.detail, /zostaną zastąpione/)
})

test('import: cancelled open dialog → canceled', async () => {
  assert.deepEqual((await h.importFromFile()).value, { canceled: true })
})

test('import into non-empty DB: confirm backs up old data first (Review Focus 2)', async () => {
  dialogs.open = { canceled: false, filePaths: [fixturePath('local-v1.json')] }; dialogs.box = { response: 0 }
  const r = (await h.importFromFile()).value
  assert.match(r.backupPath, /przed-importem-2026-11-10-090507\.json$/)
  assert.deepEqual(parseImport(readFileSync(r.backupPath, 'utf8')).data, demo.data)
  assert.deepEqual(readState(db), parseImport(readFixture('local-v1.json')).data)
  assert.equal(r.warnings.length, 2)
  assert.equal(readdirSync(backupDir).length, 1)
})

test('import into empty DB: no backup, no replace warning', async () => {
  db.exec('DELETE FROM classes')
  dialogs.open = { canceled: false, filePaths: [fixturePath('demo-export.json')] }; dialogs.box = { response: 0 }
  const r = (await h.importFromFile()).value
  assert.equal(r.backupPath, null)
  assert.equal(existsSync(backupDir), false)
  assert.doesNotMatch(dialogs.calls.find((c) => c[0] === 'box')[1].detail, /zastąpione/)
  assert.deepEqual(readState(db), demo.data)
})

test('import of a non-export file → ok:false, DB unchanged', async () => {
  const bad = join(dir, 'bad.json')
  const { writeFileSync } = await import('node:fs')
  writeFileSync(bad, '{"hello": 1}')
  dialogs.open = { canceled: false, filePaths: [bad] }; dialogs.box = { response: 0 }
  const r = await h.importFromFile()
  assert.equal(r.ok, false)
  assert.equal(typeof r.error, 'string')
  assert.deepEqual(readState(db), demo.data)
  assert.equal(dialogs.calls.some((c) => c[0] === 'box'), false)
})

test('revealDatabase shows the db file', () => {
  assert.deepEqual(h.revealDatabase(), { ok: true, value: null })
  assert.deepEqual(shell.shown, ['/x/db.sqlite'])
})

test('registerIpc rejects unknown methods and untrusted senders', async () => {
  let handler, channel
  registerIpc({ handle(c, fn) { channel = c; handler = fn } }, h, (e) => e.trusted)
  assert.equal(channel, 'scoreboard')
  const bad = { ok: false, error: 'Nieznana operacja' }
  assert.deepEqual(await handler({ trusted: true }, 'toString'), bad)
  assert.deepEqual(await handler({ trusted: true }, 'nope'), bad)
  assert.deepEqual(await handler({ trusted: false }, 'getState'), bad)
  assert.deepEqual(await handler({ trusted: true }, 'getState'), { ok: true, value: demo.data })
})
