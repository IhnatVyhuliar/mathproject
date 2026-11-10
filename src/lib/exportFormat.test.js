import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ImportError,
  buildExport,
  parseImport,
  readBrowserData,
  hasSavedLocalData,
  formatCounts,
  exportFileName,
} from './exportFormat.js'

const readFixture = (name) => JSON.parse(readFileSync(new URL('../../test/fixtures/' + name, import.meta.url), 'utf8'))
const demo = readFixture('demo-export.json')
const fakeStorage = (obj) => ({ getItem: (k) => obj[k] ?? null })

test('envelope round-trip keeps data exactly (Polish chars, emoji, 1.5 weight)', () => {
  const file = buildExport(demo.data, { source: 'browser', exportedAt: '2026-11-10T08:00:00.000Z' })
  assert.equal(file.format, 'arcade-scoreboard-export')
  assert.equal(file.version, 1)
  assert.deepEqual(file.counts, { classes: 2, students: 5, categories: 4, entries: demo.data.entries.length })
  assert.deepEqual(parseImport(JSON.stringify(file)), { data: demo.data, warnings: [] })
})

test('v1 localStorage blob: fills steps, drops orphans and duplicate ids', () => {
  const { data, warnings } = parseImport(readFixture('local-v1.json'))
  assert.equal(data.pointStep, 5)
  assert.equal(data.weightStep, 1)
  assert.ok(data.classes.every((c) => c.pointStep === null && c.weightStep === null))
  assert.equal(new Set(data.students.map((s) => s.id)).size, data.students.length)
  assert.ok(data.entries.every((e) => data.categories.some((c) => c.id === e.categoryId)))
  assert.equal(warnings.length, 2)
})

test('rejects files that are not exports', () => {
  for (const bad of ['nie json', '[]', '{}', JSON.stringify({ format: 'arcade-scoreboard-export', version: 99, data: {} })])
    assert.throws(() => parseImport(bad), ImportError)
})

test('readBrowserData: nothing saved → null', () => {
  assert.equal(readBrowserData(fakeStorage({})), null)
  assert.equal(readBrowserData({ getItem() { throw new Error('SecurityError') } }), null)
  assert.equal(hasSavedLocalData(fakeStorage({})), false)
  assert.equal(hasSavedLocalData({ getItem() { throw new Error('x') } }), false)
})

test('readBrowserData is lossless (no cleaning)', () => {
  const raw = readFixture('local-v1.json')
  assert.equal(
    readBrowserData(fakeStorage({ 'arcade-scoreboard@v1': JSON.stringify(raw) })).students.length,
    raw.state.students.length,
  )
})

test('readBrowserData: corrupt JSON → ImportError', () => {
  assert.throws(() => readBrowserData(fakeStorage({ 'arcade-scoreboard@v1': '{oops' })), ImportError)
})

test('parseImport accepts bare Data and raw persist blob', () => {
  assert.deepEqual(parseImport(demo.data).data, demo.data)
  assert.deepEqual(parseImport({ state: demo.data, version: 2 }).data, demo.data)
})

test('cleanData: non-positive weight becomes 1 with a warning', () => {
  const data = structuredClone(demo.data)
  data.categories[0].weight = 0
  const { data: out, warnings } = parseImport(data)
  assert.equal(out.categories[0].weight, 1)
  assert.equal(warnings.length, 1)
})

test('formatCounts uses Polish plurals', () =>
  assert.equal(
    formatCounts({ classes: 2, students: 5, categories: 1, entries: 22 }),
    '2 klasy · 5 uczniów · 1 kategoria · 22 wpisy',
  ))

test('exportFileName', () =>
  assert.equal(exportFileName('2026-11-10T08:00:00.000Z'), 'arcade-scoreboard-2026-11-10.json'))

test('exportFileName from a Date uses the local calendar day, independent of timezone', () =>
  assert.equal(exportFileName(new Date(2026, 10, 10, 0, 30)), 'arcade-scoreboard-2026-11-10.json'))

test('parseImport accepts a UTF-8 BOM', () => {
  const text = '﻿' + JSON.stringify(demo)
  assert.deepEqual(parseImport(text).data, parseImport(JSON.stringify(demo)).data)
})
