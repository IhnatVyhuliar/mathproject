import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { API_METHODS, MAX_POINTS_PER_WRITE } from './apiMethods.js'
import { ApiError } from './api.js'
import { STORAGE_KEY, parseImport, readBrowserData } from './exportFormat.js'
import { createLocalApi } from './localApi.js'
import { createScoreboardStore } from '../store/createScoreboardStore.js'

const readFixture = (name) => readFileSync(new URL(`../../test/fixtures/${name}`, import.meta.url), 'utf8')
const demo = JSON.parse(readFixture('demo-export.json'))
const oldBlob = readFixture('local-v1.json')

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  }
}

function fakeFiles({ text = null, confirm = true } = {}) {
  const downloads = []
  const asked = []
  return {
    downloads,
    asked,
    download: (name, value) => downloads.push({ name, value }),
    pickText: async () => text,
    confirm: (msg) => (asked.push(msg), confirm),
  }
}

function setup({ initial, files } = {}) {
  const storage = memoryStorage(initial)
  const f = files ?? fakeFiles()
  return { storage, files: f, api: createLocalApi({ storage, files: f }) }
}

const withDemo = () => setup({ initial: { [STORAGE_KEY]: JSON.stringify({ state: demo.data, version: 2 }) } })
const saved = (storage) => JSON.parse(storage.getItem(STORAGE_KEY))

test('exposes every API method', () => {
  assert.deepEqual(Object.keys(setup().api).sort(), [...API_METHODS].sort())
})

test('reads the old browser save (persist blob) as-is', async () => {
  const { api } = setup({ initial: { [STORAGE_KEY]: oldBlob } })
  const state = await api.getState()
  const expected = readBrowserData(memoryStorage({ [STORAGE_KEY]: oldBlob }))
  assert.deepEqual(state, expected)
  assert.equal(state.classes[0].name, 'Klasa 6C')
})

test('nothing saved → empty data with default steps', async () => {
  const state = await setup().api.getState()
  assert.deepEqual(state, { pointStep: 5, weightStep: 1, classes: [], students: [], categories: [], entries: [] })
})

test('writes the persist format {state, version: 2}, readable by readBrowserData', async () => {
  const { api, storage } = setup()
  const cls = { id: 'c1', name: 'A', icon: '🚀', color: '#fff', pointStep: null, weightStep: null, createdAt: 'x' }
  await api.createClass(cls)
  const blob = saved(storage)
  assert.equal(blob.version, 2)
  assert.deepEqual(Object.keys(blob.state).sort(), ['categories', 'classes', 'entries', 'pointStep', 'students', 'weightStep'])
  assert.deepEqual(readBrowserData(storage).classes, [cls])
})

test('putSettings changes only the step settings', async () => {
  const { api } = withDemo()
  await api.putSettings({ pointStep: 10, classes: [] })
  const state = await api.getState()
  assert.equal(state.pointStep, 10)
  assert.equal(state.classes.length, demo.data.classes.length)
})

test('create with an existing id → Konflikt danych', async () => {
  const { api } = withDemo()
  const dup = { ...demo.data.students[0] }
  await assert.rejects(api.createStudent(dup), (e) => e instanceof ApiError && e.message === 'Konflikt danych')
})

test('patch applies only allowed fields; unknown id → Nie znaleziono rekordu', async () => {
  const { api } = withDemo()
  const st = demo.data.students[0]
  await api.patchStudent(st.id, { firstName: 'Zofia', classId: 'elsewhere', id: 'hijack' })
  const after = (await api.getState()).students.find((s) => s.id === st.id)
  assert.equal(after.firstName, 'Zofia')
  assert.equal(after.classId, st.classId)
  await assert.rejects(api.patchClass('nope', { name: 'x' }), { name: 'ApiError', message: 'Nie znaleziono rekordu' })
})

test('deleteClass cascades to students, categories and their entries', async () => {
  const { api } = withDemo()
  const classId = demo.data.classes[0].id
  await api.deleteClass(classId)
  const s = await api.getState()
  assert.equal(s.classes.some((c) => c.id === classId), false)
  assert.equal(s.students.some((x) => x.classId === classId), false)
  assert.equal(s.categories.some((x) => x.classId === classId), false)
  const studentIds = new Set(s.students.map((x) => x.id))
  assert.ok(s.entries.every((e) => studentIds.has(e.studentId)))
})

test('deleteStudent / deleteCategory remove their entries', async () => {
  const { api } = withDemo()
  const st = demo.data.students[0].id
  const cat = demo.data.categories[0].id
  await api.deleteStudent(st)
  await api.deleteCategory(cat)
  const s = await api.getState()
  assert.equal(s.entries.some((e) => e.studentId === st || e.categoryId === cat), false)
  await assert.rejects(api.deleteStudent(st), { message: 'Nie znaleziono rekordu' })
})

test('createPoints appends entries and enforces the size limit', async () => {
  const { api } = withDemo()
  const e = { id: 'p-new', studentId: demo.data.students[0].id, categoryId: demo.data.categories[0].id, points: 5, note: '', date: '2026-11-11', createdAt: 'x' }
  await api.createPoints([e])
  assert.ok((await api.getState()).entries.some((x) => x.id === 'p-new'))
  await assert.rejects(api.createPoints([]), { message: 'Nieprawidłowa liczba wpisów' })
  await assert.rejects(api.createPoints(new Array(MAX_POINTS_PER_WRITE + 1).fill(e)), { message: 'Nieprawidłowa liczba wpisów' })
})

test('corrupt save: reads and writes fail, the saved text is never overwritten', async () => {
  const { api, storage } = setup({ initial: { [STORAGE_KEY]: '{oops' } })
  await assert.rejects(api.getState(), (e) => e instanceof ApiError && /uszkodzone/.test(e.message))
  await assert.rejects(api.createClass({ id: 'c1', name: 'A' }), ApiError)
  assert.equal(storage.getItem(STORAGE_KEY), '{oops')
})

test('setItem throwing (quota / private mode) → ApiError', async () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError') } }
  const api = createLocalApi({ storage, files: fakeFiles() })
  await assert.rejects(api.putSettings({ pointStep: 10 }), (e) => e instanceof ApiError && /przeglądarce/.test(e.message))
})

test('no storage at all → getState explains, does not crash', async () => {
  const api = createLocalApi({ storage: null, files: fakeFiles() })
  await assert.rejects(api.getState(), (e) => e instanceof ApiError && /przeglądarka/i.test(e.message))
})

test('exportToFile downloads the export format with source browser', async () => {
  const { api, files } = withDemo()
  const result = await api.exportToFile()
  assert.equal(files.downloads.length, 1)
  const { name, value } = files.downloads[0]
  assert.match(name, /^arcade-scoreboard-\d{4}-\d{2}-\d{2}\.json$/)
  assert.deepEqual(result, { path: name })
  assert.equal(value.source, 'browser')
  assert.deepEqual(parseImport(value).data, demo.data)
})

test('importFromFile: no file picked → canceled, nothing changes', async () => {
  const { api, storage } = withDemo()
  const before = storage.getItem(STORAGE_KEY)
  assert.deepEqual(await api.importFromFile(), { canceled: true })
  assert.equal(storage.getItem(STORAGE_KEY), before)
})

test('importFromFile: declined confirm → canceled, nothing changes', async () => {
  const files = fakeFiles({ text: oldBlob, confirm: false })
  const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ state: demo.data, version: 2 }) })
  const api = createLocalApi({ storage, files })
  const before = storage.getItem(STORAGE_KEY)
  assert.deepEqual(await api.importFromFile(), { canceled: true })
  assert.equal(storage.getItem(STORAGE_KEY), before)
  assert.match(files.asked[0], /zostaną zastąpione/)
  assert.equal(files.downloads.length, 0)
})

test('importFromFile replaces data and first downloads a backup of the old data', async () => {
  const files = fakeFiles({ text: oldBlob })
  const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ state: demo.data, version: 2 }) })
  const api = createLocalApi({ storage, files })
  const result = await api.importFromFile()
  const imported = parseImport(oldBlob)
  assert.deepEqual(await api.getState(), imported.data)
  assert.deepEqual(result.counts, { classes: 1, students: imported.data.students.length, categories: imported.data.categories.length, entries: imported.data.entries.length })
  assert.equal(files.downloads.length, 1)
  assert.match(files.downloads[0].name, /^przed-importem-.*\.json$/)
  assert.deepEqual(parseImport(files.downloads[0].value).data, demo.data)
  assert.equal(result.backupPath, files.downloads[0].name)
})

test('importFromFile into empty storage: no backup', async () => {
  const files = fakeFiles({ text: JSON.stringify(demo) })
  const api = createLocalApi({ storage: memoryStorage(), files })
  const result = await api.importFromFile()
  assert.equal(result.backupPath, null)
  assert.equal(files.downloads.length, 0)
  assert.deepEqual(await api.getState(), demo.data)
})

test('importFromFile: bad file → ApiError with the parse message', async () => {
  const api = createLocalApi({ storage: memoryStorage(), files: fakeFiles({ text: 'not json' }) })
  await assert.rejects(api.importFromFile(), (e) => e instanceof ApiError && /JSON/.test(e.message))
})

test('store on the local api: awarded points survive a fresh store (reload)', async () => {
  const storage = memoryStorage({ [STORAGE_KEY]: oldBlob })
  const first = createScoreboardStore({ api: createLocalApi({ storage, files: fakeFiles() }) })
  await first.getState().load()
  const s = first.getState()
  const st = s.students[0]
  const cat = s.categories.find((c) => c.classId === st.classId)
  first.getState().awardPointsBulk([st.id], [{ categoryId: cat.id, points: 10 }])
  await first.getState().whenIdle()

  const second = createScoreboardStore({ api: createLocalApi({ storage, files: fakeFiles() }) })
  await second.getState().load()
  assert.equal(second.getState().sync.status, 'ready')
  assert.equal(second.getState().entries.length, s.entries.length + 1)
})
