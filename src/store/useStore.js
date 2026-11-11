import { createBridgeApi } from '../lib/api.js'
import { createLocalApi } from '../lib/localApi.js'
import * as browserFiles from '../lib/browserFiles.js'
import { STORAGE_KEY } from '../lib/exportFormat.js'
import { createScoreboardStore } from './createScoreboardStore.js'

const bridge = createBridgeApi()

// 'app' = Electron desktop (SQLite over IPC); 'browser' = web version (localStorage).
export const backend = bridge ? 'app' : 'browser'

export const useStore = createScoreboardStore({
  api: bridge ?? createLocalApi({ storage: browserStorage(), files: browserFiles }),
})

if (!bridge) {
  // Another tab saved (e.g. points awarded while this one shows the ranking).
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY || e.key === null) useStore.getState().load()
  })
}

function browserStorage() {
  try {
    return window.localStorage
  } catch {
    return null // blocked site data; the store shows the error instead of crashing
  }
}

// ---- Selector helpers (used with useStore(selector)) ----
export const selectClass = (id) => (s) => s.classes.find((c) => c.id === id)
export const selectStudents = (classId) => (s) => s.students.filter((x) => x.classId === classId)
export const selectCategories = (classId) => (s) => s.categories.filter((c) => c.classId === classId)
