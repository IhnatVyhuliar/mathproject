// IPC handlers: Result-wrapping and dialog flow. No Electron imports; dialogs
// and shell are injected so everything is testable.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readState, isEmpty, importData, tx } from './db.js'
import * as repo from './repo.js'
import { validateEntity, validatePatch, validateSettings } from './validate.js'
import {
  parseImport, ImportError, buildExport, exportFileName, summarize, formatCounts,
} from '../src/lib/exportFormat.js'
import { MAX_POINTS_PER_WRITE } from '../src/lib/apiMethods.js'

const ok = (value) => ({ ok: true, value })
const fail = (error) => ({ ok: false, error })

class Invalid extends Error {}
class NotFound extends Error {}

function toResult(err) {
  if (err instanceof Invalid) return fail(err.message)
  if (err instanceof NotFound) return fail('Nie znaleziono rekordu')
  if (err instanceof ImportError) return fail(err.message)
  const msg = String(err?.message ?? '')
  if (msg.includes('UNIQUE constraint failed') || msg.includes('FOREIGN KEY constraint failed')) {
    return fail('Konflikt danych')
  }
  console.error(err)
  return fail('Nieoczekiwany błąd zapisu')
}

const guard = (fn) => (...args) => {
  try { return ok(fn(...args)) } catch (err) { return toResult(err) }
}
const guardAsync = (fn) => async (...args) => {
  try { return ok(await fn(...args)) } catch (err) { return toResult(err) }
}
const check = (msg) => { if (msg) throw new Invalid(msg) }

const pad = (n) => String(n).padStart(2, '0')
function backupName(d) {
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return `przed-importem-${date}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.json`
}

const writeJson = (file, obj) => writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8')

export function createHandlers(db, { dialogs, shell, dbPath, backupDir, now = () => new Date() }) {
  const create = (kind, insert) => guard((entity) => {
    check(validateEntity(kind, entity))
    insert(db, entity)
    return null
  })
  const patch = (kind) => guard((id, changes) => {
    check(validatePatch(kind, changes))
    if (!repo.patchEntity(db, kind, id, changes)) throw new NotFound()
    return null
  })
  const remove = (kind) => guard((id) => {
    if (!tx(db, () => repo.deleteEntity(db, kind, id))) throw new NotFound()
    return null
  })

  return {
    getState: guard(() => readState(db)),

    putSettings: guard((changes) => {
      check(validateSettings(changes))
      repo.updateSettings(db, changes)
      return null
    }),

    createClass: create('class', repo.insertClass),
    patchClass: patch('class'),
    deleteClass: remove('class'),
    createStudent: create('student', repo.insertStudent),
    patchStudent: patch('student'),
    deleteStudent: remove('student'),
    createCategory: create('category', repo.insertCategory),
    patchCategory: patch('category'),
    deleteCategory: remove('category'),

    createPoints: guard((entries) => {
      if (!Array.isArray(entries) || entries.length < 1 || entries.length > MAX_POINTS_PER_WRITE) {
        throw new Invalid('Nieprawidłowa liczba wpisów')
      }
      for (const e of entries) check(validateEntity('point', e))
      tx(db, () => repo.insertPoints(db, entries))
      return null
    }),

    exportToFile: guardAsync(async () => {
      const { canceled, filePath } = await dialogs.showSaveDialog({
        defaultPath: exportFileName(now()),
        filters: [{ name: 'Kopia Arcade Scoreboard', extensions: ['json'] }],
      })
      if (canceled || !filePath) return { canceled: true }
      writeJson(filePath, buildExport(readState(db), { source: 'app' }))
      return { path: filePath }
    }),

    importFromFile: guardAsync(async () => {
      const open = await dialogs.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Kopia Arcade Scoreboard', extensions: ['json'] }],
      })
      if (open.canceled || !open.filePaths?.length) return { canceled: true }
      const { data, warnings } = parseImport(readFileSync(open.filePaths[0], 'utf8'))

      const replacing = !isEmpty(db)
      const detail = [
        `Plik zawiera: ${formatCounts(summarize(data))}.`,
        ...warnings,
        ...(replacing
          ? [`Obecne dane (${formatCounts(summarize(readState(db)))}) zostaną zastąpione. Najpierw zapiszę ich kopię w folderze „kopie”.`]
          : []),
      ].join('\n')
      const { response } = await dialogs.showMessageBox({
        type: 'question', buttons: ['Importuj', 'Anuluj'], defaultId: 1, cancelId: 1, noLink: true,
        message: 'Zaimportować dane z pliku?', detail,
      })
      if (response === 1) return { canceled: true }

      // State may have changed while the dialog was open; decide again.
      let backupPath = null
      if (!isEmpty(db)) {
        mkdirSync(backupDir, { recursive: true })
        backupPath = join(backupDir, backupName(now()))
        writeJson(backupPath, buildExport(readState(db), { source: 'app' }))
      }
      const counts = importData(db, data, { force: true })
      return { counts, warnings, backupPath }
    }),

    revealDatabase: guard(() => {
      shell.showItemInFolder(dbPath)
      return null
    }),
  }
}

export function registerIpc(ipcMain, handlers, isTrustedSender) {
  ipcMain.handle('scoreboard', (event, method, ...args) => {
    if (!isTrustedSender(event) || typeof method !== 'string' || !Object.hasOwn(handlers, method)) {
      return fail('Nieznana operacja')
    }
    return handlers[method](...args)
  })
}
