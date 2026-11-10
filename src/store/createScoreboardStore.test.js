import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { API_METHODS, MAX_POINTS_PER_WRITE } from '../lib/apiMethods.js'
import { createScoreboardStore } from './createScoreboardStore.js'

const demo = JSON.parse(readFileSync(new URL('../../test/fixtures/demo-export.json', import.meta.url), 'utf8'))
const flush = () => new Promise((r) => setImmediate(r))

function setup(overrides = {}) {
  const calls = []
  const api = {}
  for (const name of API_METHODS) {
    api[name] = async (...args) => {
      calls.push([name, ...args])
      if (overrides[name]) return overrides[name](...args)
      return name === 'getState' ? structuredClone(demo.data) : null
    }
  }
  const store = createScoreboardStore({ api })
  return { api, calls, store }
}

const ready = async (overrides) => {
  const t = setup(overrides)
  await t.store.getState().load()
  t.calls.length = 0
  return t
}

test('starts loading and empty — no demo seed', () => {
  const { store } = setup()
  const s = store.getState()
  assert.equal(s.sync.status, 'loading')
  assert.deepEqual(s.classes, [])
  assert.deepEqual(s.entries, [])
})

test('api null → unavailable', () => {
  assert.equal(createScoreboardStore({ api: null }).getState().sync.status, 'unavailable')
})

test('load() hydrates; failure → error with message', async () => {
  const { store } = setup()
  await store.getState().load()
  assert.equal(store.getState().sync.status, 'ready')
  assert.equal(store.getState().classes.length, demo.data.classes.length)
  const bad = setup({ getState: async () => { throw new Error('Baza uszkodzona') } })
  await bad.store.getState().load()
  assert.equal(bad.store.getState().sync.status, 'error')
  assert.equal(bad.store.getState().sync.lastError, 'Baza uszkodzona')
})

test('addClass is optimistic and sends the full entity', async () => {
  const { store, calls } = await ready()
  const cls = store.getState().addClass('Klasa 8B')
  assert.ok(store.getState().classes.some((c) => c.id === cls.id))
  await flush()
  assert.deepEqual(calls.at(-1), ['createClass', cls])
})

test('removeClass cascades locally, one deleteClass call', async () => {
  const { store, calls } = await ready()
  const id = demo.data.classes[0].id
  store.getState().removeClass(id)
  const s = store.getState()
  assert.ok(!s.classes.some((c) => c.id === id))
  assert.ok(!s.students.some((x) => x.classId === id))
  assert.ok(!s.categories.some((x) => x.classId === id))
  const ids = new Set(s.students.map((x) => x.id))
  assert.ok(s.entries.every((e) => ids.has(e.studentId)))
  await flush()
  assert.deepEqual(calls, [['deleteClass', id]])
})

test('updateCategory sends the clamped weight', async () => {
  const { store, calls } = await ready()
  const cat = store.getState().categories[0]
  store.getState().updateCategory(cat.id, { weight: 2.4 })
  assert.equal(store.getState().categories.find((c) => c.id === cat.id).weight, 2)
  await flush()
  assert.deepEqual(calls, [['patchCategory', cat.id, { weight: 2 }]])
})

test('awardPointsBulk: one createPoints for all', async () => {
  const { store, calls } = await ready()
  const cls = store.getState().classes[0].id
  const studentIds = store.getState().students.filter((x) => x.classId === cls).slice(0, 3).map((x) => x.id)
  const cats = store.getState().categories.filter((c) => c.classId === cls).slice(0, 2)
  assert.equal(studentIds.length, 3)
  const res = store.getState().awardPointsBulk(studentIds, cats.map((c) => ({ categoryId: c.id, points: 5 })))
  assert.deepEqual(res, { entries: 6, students: 3 })
  await flush()
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'createPoints')
  assert.equal(calls[0][1].length, 6)
})

test('awardPointsBulk over the limit changes nothing and keeps the draft', async () => {
  const { store, calls } = await ready()
  const before = store.getState().entries
  const cats = store.getState().categories.slice(0, 2)
  const studentIds = Array.from({ length: MAX_POINTS_PER_WRITE / 2 + 1 }, (_, i) => `s-${i}`)
  const res = store.getState().awardPointsBulk(studentIds, cats.map((c) => ({ categoryId: c.id, points: 5 })))
  assert.equal(res.entries, 0) // BulkAwardBar clears its draft only when entries > 0
  assert.equal(store.getState().entries, before)
  assert.match(store.getState().sync.lastError, /Za dużo wpisów/)
  await flush()
  assert.deepEqual(calls, [])
})

test('per-keystroke setSteps keeps order, last value wins', async () => {
  const { store, calls } = await ready()
  for (const v of ['1', '12', '125']) store.getState().setSteps({ pointStep: v })
  assert.equal(store.getState().pointStep, 125)
  await flush()
  assert.deepEqual(calls.filter((c) => c[0] === 'putSettings').map((c) => c[1].pointStep), [1, 12, 125])
})

test('failed write reverts and sets lastError', async () => {
  const { store } = await ready({ createPoints: async () => { throw new Error('dysk pełny') } })
  const before = store.getState().entries.length
  const s = store.getState()
  s.awardPointsBulk([s.students[0].id], [{ categoryId: s.categories[0].id, points: 5 }])
  assert.equal(store.getState().entries.length, before + 1)
  await flush()
  assert.equal(store.getState().entries.length, before)
  assert.match(store.getState().sync.lastError, /cofnięta/)
})

test('mutating an unknown id sends nothing', async () => {
  const { store, calls } = await ready()
  const s = store.getState()
  s.updateClass('nope', { name: 'x' })
  s.updateStudent('nope', { firstName: 'x' })
  s.updateCategory('nope', { name: 'x' })
  s.removeClass('nope')
  s.removeStudent('nope')
  s.removeCategory('nope')
  assert.equal(s.addClass('  '), null)
  await flush()
  assert.deepEqual(calls, [])
})

test('importFromFile waits for pending writes, then reloads state', async () => {
  const order = []
  let release
  const gate = new Promise((r) => (release = r))
  const { store } = await ready({
    createClass: async () => { order.push('createClass:start'); await gate; order.push('createClass:end'); return null },
    importFromFile: async () => { order.push('import'); return { counts: {}, warnings: [], backupPath: null } },
    getState: async () => { order.push('getState'); return structuredClone(demo.data) },
  })
  order.length = 0
  store.getState().addClass('Nowa')
  const p = store.getState().importFromFile()
  await flush()
  assert.deepEqual(order, ['createClass:start'])
  release()
  await p
  assert.deepEqual(order, ['createClass:start', 'createClass:end', 'import', 'getState'])
})

test('load() refetches when an edit lands while the snapshot is in flight', async () => {
  const db = structuredClone(demo.data)
  let release
  let gated = false
  const { store, calls } = await ready({
    createClass: async (cls) => { db.classes.push(cls); return null },
    getState: async () => {
      const snap = structuredClone(db) // taken when main handles the request
      if (gated) {
        gated = false
        await new Promise((r) => (release = r))
      }
      return snap
    },
  })
  gated = true
  const p = store.getState().load()
  await flush()
  const cls = store.getState().addClass('Nowa') // UI stays live during a reload
  await flush()
  release()
  await p
  assert.ok(store.getState().classes.some((c) => c.id === cls.id))
  assert.equal(calls.filter((c) => c[0] === 'getState').length, 2)
  assert.equal(store.getState().sync.status, 'ready')
})
