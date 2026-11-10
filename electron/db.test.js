import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, readState, importData, isEmpty, tx, NotEmptyError } from './db.js'
import { parseImport } from '../src/lib/exportFormat.js'

const readFixture = (n) => readFileSync(new URL(`../test/fixtures/${n}`, import.meta.url), 'utf8')
const demo = JSON.parse(readFixture('demo-export.json'))

test('file DB runs in WAL with foreign keys on', () => {
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'asb-')), 't.sqlite'))
  assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal')
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1)
  assert.equal(db.prepare('PRAGMA busy_timeout').get().timeout, 5000)
})

test('fresh DB: defaults, no data', () => {
  assert.deepEqual(readState(openDb(':memory:')),
    { pointStep: 5, weightStep: 1, classes: [], students: [], categories: [], entries: [] })
})

test('import → readState round-trip (order, Polish chars, REAL)', () => {
  const db = openDb(':memory:')
  importData(db, demo.data)
  assert.deepStrictEqual(readState(db), demo.data)
})

test('second import without force → NotEmptyError, data unchanged', () => {
  const db = openDb(':memory:')
  importData(db, demo.data)
  const before = readState(db)
  assert.throws(() => importData(db, demo.data), NotEmptyError)
  assert.deepStrictEqual(readState(db), before)
})

test('force import replaces data', () => {
  const db = openDb(':memory:')
  const v1 = parseImport(readFixture('local-v1.json')).data
  importData(db, demo.data)
  importData(db, v1, { force: true })
  assert.deepStrictEqual(readState(db), v1)
})

test('failed import rolls back completely', () => {
  const db = openDb(':memory:')
  const bad = structuredClone(demo.data)
  bad.entries.push({ ...bad.entries[0], id: 'x', categoryId: 'brak' })
  assert.throws(() => importData(db, bad))
  assert.equal(isEmpty(db), true)
})

test('deleting a class cascades to students, categories, points', () => {
  const db = openDb(':memory:')
  importData(db, demo.data)
  const id = demo.data.classes[0].id
  db.prepare('DELETE FROM classes WHERE id = ?').run(id)
  const s = readState(db)
  assert.ok(!s.classes.some((c) => c.id === id))
  assert.ok(!s.students.some((x) => x.classId === id))
  assert.ok(!s.categories.some((x) => x.classId === id))
  const sIds = new Set(s.students.map((x) => x.id)), cIds = new Set(s.categories.map((x) => x.id))
  assert.ok(s.entries.every((e) => sIds.has(e.studentId) && cIds.has(e.categoryId)))
})

test('tx rethrows and rolls back', () => {
  const db = openDb(':memory:')
  assert.throws(() => tx(db, () => { db.exec("UPDATE settings SET point_step = 9"); throw new Error('boom') }), /boom/)
  assert.equal(readState(db).pointStep, 5)
})
