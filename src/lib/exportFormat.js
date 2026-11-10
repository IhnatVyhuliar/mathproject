// Export/import format for Arcade Scoreboard data. Pure ESM with no DOM access
// (storage is always passed in) so the Electron main process can reuse it.

import { DEFAULT_POINT_STEP, DEFAULT_WEIGHT_STEP, normalizeStep, plural } from './steps.js'

export const STORAGE_KEY = 'arcade-scoreboard@v1'
export const EXPORT_FORMAT = 'arcade-scoreboard-export'
export const EXPORT_VERSION = 1

export class ImportError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ImportError'
  }
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const objects = (v) => (Array.isArray(v) ? v.filter(isObj) : [])
const str = (v) => (v == null ? '' : v)

// Fills in what older/partial states lack. Never removes anything.
export function normalizeData(raw, fromVersion = 2) {
  void fromVersion // every version is filled the same way; kept for the persist `migrate` signature
  const r = isObj(raw) ? raw : {}
  return {
    pointStep: normalizeStep(r.pointStep, DEFAULT_POINT_STEP),
    weightStep: normalizeStep(r.weightStep, DEFAULT_WEIGHT_STEP),
    classes: objects(r.classes).map((c) => ({
      ...c,
      name: str(c.name),
      icon: str(c.icon),
      color: str(c.color),
      pointStep: normalizeStep(c.pointStep, null),
      weightStep: normalizeStep(c.weightStep, null),
      createdAt: str(c.createdAt),
    })),
    students: objects(r.students).map((s) => ({
      ...s,
      classId: str(s.classId),
      firstName: str(s.firstName),
      lastName: str(s.lastName),
      number: str(s.number),
      createdAt: str(s.createdAt),
    })),
    categories: objects(r.categories).map((c) => ({
      ...c,
      classId: str(c.classId),
      name: str(c.name),
      weight: Number(c.weight),
      color: str(c.color),
      createdAt: str(c.createdAt),
    })),
    entries: objects(r.entries).map((e) => ({
      ...e,
      studentId: str(e.studentId),
      categoryId: str(e.categoryId),
      points: Number(e.points),
      note: str(e.note),
      date: str(e.date),
      createdAt: str(e.createdAt),
    })),
  }
}

// Drops records that would break the app; one summary warning per rule.
export function cleanData(data) {
  const warnings = []
  const warn = (removed, what) => {
    if (removed > 0) warnings.push(`${what}: ${removed}.`)
  }

  const dedupe = (list) => {
    const seen = new Set()
    let noId = 0
    let dupes = 0
    const out = []
    for (const item of list) {
      if (typeof item.id !== 'string' || item.id === '') noId++
      else if (seen.has(item.id)) dupes++
      else {
        seen.add(item.id)
        out.push(item)
      }
    }
    return { out, noId, dupes }
  }

  let noId = 0
  let dupes = 0
  const part = {}
  for (const key of ['classes', 'students', 'categories', 'entries']) {
    const r = dedupe(data[key])
    part[key] = r.out
    noId += r.noId
    dupes += r.dupes
  }
  warn(noId, 'Pominięto rekordy bez identyfikatora')
  warn(dupes, 'Pominięto rekordy z powtórzonym identyfikatorem')

  const classIds = new Set(part.classes.map((c) => c.id))
  const students = part.students.filter((s) => classIds.has(s.classId))
  const categories = part.categories.filter((c) => classIds.has(c.classId))
  warn(
    part.students.length - students.length + (part.categories.length - categories.length),
    'Pominięto uczniów i kategorie bez istniejącej klasy',
  )

  const studentIds = new Set(students.map((s) => s.id))
  const categoryIds = new Set(categories.map((c) => c.id))
  const entries = part.entries.filter(
    (e) => studentIds.has(e.studentId) && categoryIds.has(e.categoryId) && Number.isFinite(e.points),
  )
  warn(part.entries.length - entries.length, 'Pominięto wpisy bez ucznia, kategorii lub poprawnej liczby punktów')

  let fixedWeights = 0
  const fixedCategories = categories.map((c) => {
    if (Number.isFinite(c.weight) && c.weight > 0) return c
    fixedWeights++
    return { ...c, weight: 1 }
  })
  warn(fixedWeights, 'Ustawiono wagę 1 w kategoriach z niepoprawną wagą')

  return {
    data: { ...data, classes: part.classes, students, categories: fixedCategories, entries },
    warnings,
  }
}

export function parseImport(input) {
  let obj = input
  if (typeof input === 'string') {
    try {
      obj = JSON.parse(input)
    } catch {
      throw new ImportError('plik nie jest poprawnym JSON-em.')
    }
  }
  if (!isObj(obj)) throw new ImportError('to nie jest plik kopii danych Arcade Scoreboard.')

  let normalized
  if (obj.format === EXPORT_FORMAT) {
    if (!Number.isInteger(obj.version) || obj.version < 1) throw new ImportError('nieprawidłowa wersja pliku.')
    if (obj.version > EXPORT_VERSION)
      throw new ImportError('plik pochodzi z nowszej wersji aplikacji. Zaktualizuj aplikację.')
    if (!isObj(obj.data)) throw new ImportError('w pliku brakuje danych.')
    normalized = normalizeData(obj.data)
  } else if (isObj(obj.state) && typeof obj.version === 'number') {
    normalized = normalizeData(obj.state, obj.version)
  } else if (Array.isArray(obj.classes)) {
    normalized = normalizeData(obj)
  } else {
    throw new ImportError('to nie jest plik kopii danych Arcade Scoreboard.')
  }
  return cleanData(normalized)
}

export function pickData(state) {
  const { pointStep, weightStep, classes, students, categories, entries } = state
  return { pointStep, weightStep, classes, students, categories, entries }
}

export function summarize(data) {
  return {
    classes: data.classes.length,
    students: data.students.length,
    categories: data.categories.length,
    entries: data.entries.length,
  }
}

export function formatCounts(c) {
  return [
    `${c.classes} ${plural(c.classes, ['klasa', 'klasy', 'klas'])}`,
    `${c.students} ${plural(c.students, ['uczeń', 'uczniów', 'uczniów'])}`,
    `${c.categories} ${plural(c.categories, ['kategoria', 'kategorie', 'kategorii'])}`,
    `${c.entries} ${plural(c.entries, ['wpis', 'wpisy', 'wpisów'])}`,
  ].join(' · ')
}

export function buildExport(data, { source, exportedAt = new Date().toISOString() }) {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt,
    source,
    counts: summarize(data),
    data: pickData(data),
  }
}

export function exportFileName(iso) {
  return `arcade-scoreboard-${iso.slice(0, 10)}.json`
}

export function hasSavedLocalData(storage) {
  try {
    return storage.getItem(STORAGE_KEY) !== null
  } catch {
    return false
  }
}

export function readBrowserData(storage) {
  let text
  try {
    text = storage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
  if (text === null || text === undefined) return null
  let blob
  try {
    blob = JSON.parse(text)
  } catch {
    throw new ImportError('zapisane dane są uszkodzone.')
  }
  if (!isObj(blob) || !isObj(blob.state)) throw new ImportError('zapisane dane mają nieznany format.')
  return normalizeData(blob.state, blob.version)
}
