import { createBridgeApi } from '../lib/api.js'
import { createScoreboardStore } from './createScoreboardStore.js'

export const useStore = createScoreboardStore({ api: createBridgeApi() })

// ---- Selector helpers (used with useStore(selector)) ----
export const selectClass = (id) => (s) => s.classes.find((c) => c.id === id)
export const selectStudents = (classId) => (s) => s.students.filter((x) => x.classId === classId)
export const selectCategories = (classId) => (s) => s.categories.filter((c) => c.classId === classId)
