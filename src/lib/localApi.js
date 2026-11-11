// Web-version backend: the same API as the Electron bridge, but data lives in
// localStorage under the key and format the old browser version used, so what
// it saved keeps working (and the old version can still read ours). Pure ESM:
// storage and the file helpers are passed in.

import { ApiError } from './api.js'
import { MAX_POINTS_PER_WRITE } from './apiMethods.js'
import {
  ImportError,
  STORAGE_KEY,
  backupFileName,
  buildExport,
  exportFileName,
  formatCounts,
  normalizeData,
  parseImport,
  pickData,
  readBrowserData,
  summarize,
} from './exportFormat.js'

// zustand persist version the old browser build wrote.
const PERSIST_VERSION = 2

// Same editable fields as the SQLite repo (electron/repo.js PATCH_COLUMNS).
const PATCH_FIELDS = {
  classes: ['name', 'icon', 'color', 'pointStep', 'weightStep'],
  students: ['firstName', 'lastName', 'number'],
  categories: ['name', 'weight', 'color'],
}
const SETTINGS_FIELDS = ['pointStep', 'weightStep']

const NO_STORAGE =
  'Ta przeglądarka nie pozwala zapisywać danych (np. tryb prywatny albo zablokowane dane witryn).'
const WRITE_FAILED = 'Nie udało się zapisać danych w przeglądarce (brak miejsca albo zapis zablokowany).'
const conflict = () => new ApiError('Konflikt danych')
const notFound = () => new ApiError('Nie znaleziono rekordu')

const has = (list, id) => list.some((x) => x.id === id)
const pick = (obj, fields) => Object.keys(obj ?? {}).filter((k) => fields.includes(k))

// Web Locks name shared by every tab of the site.
const LOCK_NAME = 'arcade-scoreboard-write'

// `locks` is navigator.locks (absent outside secure contexts → no lock).
export function createLocalApi({ storage, files, locks = null, now = () => new Date() }) {
  // Each tab keeps its own copy of localStorage that other tabs' writes reach
  // asynchronously, so two tabs could read the same save and overwrite each
  // other. The lock makes writes take turns across tabs; it shrinks that window
  // a lot but cannot prove the copy is fresh. Here all writes come from clicks
  // in the tab being used, so they are never milliseconds apart anyway.
  const exclusive = (fn) => (locks ? locks.request(LOCK_NAME, () => fn()) : fn())

  // Throws instead of returning empty data when the save is unreadable, so a
  // later write can never overwrite it.
  const read = () => {
    if (!storage) throw new ApiError(NO_STORAGE)
    // readBrowserData treats a failing getItem as "nothing saved"; here that
    // would show an empty database (and let a write replace the real one).
    let text
    try {
      text = storage.getItem(STORAGE_KEY)
    } catch {
      throw new ApiError(NO_STORAGE)
    }
    try {
      return readBrowserData({ getItem: () => text }) ?? normalizeData({})
    } catch (err) {
      if (err instanceof ImportError) throw new ApiError(`Nie udało się odczytać danych z przeglądarki: ${err.message}`)
      throw err
    }
  }
  const write = (data) => {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify({ state: pickData(data), version: PERSIST_VERSION }))
    } catch {
      throw new ApiError(WRITE_FAILED)
    }
  }
  // Read, change, save — one turn under the lock.
  const change = (fn) =>
    exclusive(() => {
      const data = read()
      fn(data)
      write(data)
      return null
    })

  const create = (key, parentOk = () => true) => (entity) =>
    change((d) => {
      if (!entity?.id || has(d[key], entity.id) || !parentOk(d, entity)) throw conflict()
      d[key].push(entity)
    })

  const patch = (key) => (id, changes) =>
    change((d) => {
      const i = d[key].findIndex((x) => x.id === id)
      if (i < 0) throw notFound()
      const keys = pick(changes, PATCH_FIELDS[key])
      if (!keys.length) throw new ApiError('Brak dozwolonych pól do zmiany')
      d[key][i] = { ...d[key][i], ...Object.fromEntries(keys.map((k) => [k, changes[k] ?? null])) }
    })

  const methods = {
    getState: () => read(),

    putSettings: (changes) =>
      change((d) => {
        const keys = pick(changes, SETTINGS_FIELDS)
        if (!keys.length) throw new ApiError('Brak dozwolonych pól do zmiany')
        for (const k of keys) d[k] = changes[k]
      }),

    createClass: create('classes'),
    patchClass: patch('classes'),
    deleteClass: (id) =>
      change((d) => {
        if (!has(d.classes, id)) throw notFound()
        const studentIds = new Set(d.students.filter((s) => s.classId === id).map((s) => s.id))
        const categoryIds = new Set(d.categories.filter((c) => c.classId === id).map((c) => c.id))
        d.classes = d.classes.filter((c) => c.id !== id)
        d.students = d.students.filter((s) => s.classId !== id)
        d.categories = d.categories.filter((c) => c.classId !== id)
        d.entries = d.entries.filter((e) => !studentIds.has(e.studentId) && !categoryIds.has(e.categoryId))
      }),

    createStudent: create('students', (d, s) => has(d.classes, s.classId)),
    patchStudent: patch('students'),
    deleteStudent: (id) =>
      change((d) => {
        if (!has(d.students, id)) throw notFound()
        d.students = d.students.filter((s) => s.id !== id)
        d.entries = d.entries.filter((e) => e.studentId !== id)
      }),

    createCategory: create('categories', (d, c) => has(d.classes, c.classId)),
    patchCategory: patch('categories'),
    deleteCategory: (id) =>
      change((d) => {
        if (!has(d.categories, id)) throw notFound()
        d.categories = d.categories.filter((c) => c.id !== id)
        d.entries = d.entries.filter((e) => e.categoryId !== id)
      }),

    createPoints: (entries) =>
      change((d) => {
        if (!Array.isArray(entries) || entries.length < 1 || entries.length > MAX_POINTS_PER_WRITE) {
          throw new ApiError('Nieprawidłowa liczba wpisów')
        }
        const ids = new Set(d.entries.map((e) => e.id))
        const studentIds = new Set(d.students.map((s) => s.id))
        const categoryIds = new Set(d.categories.map((c) => c.id))
        for (const e of entries) {
          if (!e?.id || ids.has(e.id) || !studentIds.has(e.studentId) || !categoryIds.has(e.categoryId)) {
            throw conflict()
          }
          ids.add(e.id)
        }
        d.entries = d.entries.concat(entries)
      }),

    exportToFile: () => {
      const name = exportFileName(now())
      files.download(name, buildExport(read(), { source: 'browser' }))
      return { path: name }
    },

    importFromFile: async () => {
      const text = await files.pickText()
      if (text == null) return { canceled: true }
      const { data, warnings } = parseImport(text)

      const current = read()
      const detail = [
        `Plik zawiera: ${formatCounts(summarize(data))}.`,
        ...warnings,
        ...(current.classes.length
          ? [`Obecne dane (${formatCounts(summarize(current))}) zostaną zastąpione. Najpierw pobiorę ich kopię (folder „Pobrane”).`]
          : []),
      ].join('\n')
      if (!files.confirm(`Zaimportować dane z pliku?\n\n${detail}`)) return { canceled: true }

      // Another tab may have saved while the dialog was open; decide again,
      // under the lock (the dialog itself must not hold it).
      return exclusive(() => {
        const latest = read()
        let backupPath = null
        if (latest.classes.length) {
          backupPath = backupFileName(now())
          files.download(backupPath, buildExport(latest, { source: 'browser' }))
        }
        write(data)
        return { counts: summarize(data), warnings, backupPath }
      })
    },

    revealDatabase: () => {
      throw new ApiError('W wersji przeglądarkowej nie ma pliku bazy.')
    },
  }

  const api = {}
  for (const [name, fn] of Object.entries(methods)) {
    api[name] = async (...args) => {
      try {
        return await fn(...args)
      } catch (err) {
        if (err instanceof ApiError) throw err
        if (err instanceof ImportError) throw new ApiError(err.message)
        console.error(err)
        throw new ApiError('Nieoczekiwany błąd zapisu')
      }
    }
  }
  return api
}
