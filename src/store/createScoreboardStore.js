import { create } from 'zustand'
import {
  DEFAULT_POINT_STEP,
  DEFAULT_WEIGHT_STEP,
  effectiveStep,
  normalizeStep,
  snapToStep,
} from '../lib/steps.js'
import { pickData } from '../lib/exportFormat.js'
import { MAX_POINTS_PER_WRITE } from '../lib/apiMethods.js'
import { createWriteQueue } from './writeQueue.js'

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)

const now = () => new Date().toISOString()
const today = () => new Date().toISOString().slice(0, 10)

// Rotating palette so new classes/categories get distinct accent colors.
const CLASS_COLORS = ['#ff3d81', '#21e6c1', '#ffc53d', '#7c5cff', '#ff8a3d', '#3db8ff']
const CAT_COLORS = ['#21e6c1', '#ff3d81', '#ffc53d', '#7c5cff', '#ff8a3d', '#3db8ff', '#b8ff3d']
const CLASS_ICONS = ['🚀', '⚡', '🔥', '🌟', '🎯', '🧠', '🏆', '🎨', '🧪', '📐']

const pick = (arr, i) => arr[i % arr.length]

const CLASS_FIELDS = ['name', 'icon', 'color', 'pointStep', 'weightStep']
const STUDENT_FIELDS = ['firstName', 'lastName', 'number']
const CATEGORY_FIELDS = ['name', 'weight', 'color']

// Editable fields named in the patch, with values taken from the updated entity.
function sentPatch(entity, patch, fields) {
  const out = {}
  for (const k of Object.keys(patch)) if (fields.includes(k)) out[k] = entity[k]
  return out
}

export function createScoreboardStore({ api }) {
  return create((set, get) => {
    const queue = createWriteQueue({
      revert: (snapshot) => set({ ...snapshot }),
      onError: (err) =>
        set((s) => ({
          sync: {
            ...s.sync,
            lastError: `Nie udało się zapisać zmian (${err.message}). Ostatnia zmiana została cofnięta.`,
          },
        })),
    })

    // Bumped by every local change; lets load() spot edits made mid-fetch.
    let writeGen = 0

    // Snapshot, apply locally (synchronously), then queue the write.
    const mutate = (apply, send) => {
      const before = pickData(get())
      apply()
      writeGen++
      queue.enqueue(send, before)
    }

    return {
      pointStep: DEFAULT_POINT_STEP,
      weightStep: DEFAULT_WEIGHT_STEP,
      classes: [],
      students: [],
      categories: [],
      entries: [],
      sync: { status: api ? 'loading' : 'unavailable', lastError: null },

      // ---- Sync ----
      load: async () => {
        set((s) => ({ sync: { ...s.sync, status: s.sync.status === 'ready' ? 'ready' : 'loading' } }))
        try {
          // The UI stays live during a reload (e.g. after import). A snapshot
          // requested before an edit's write misses that edit, so drain the
          // queue and fetch again until no edit happened in between.
          let data
          for (let attempt = 1; ; attempt++) {
            const gen = writeGen
            await queue.whenIdle()
            data = await api.getState()
            if (gen === writeGen || attempt >= 5) break
          }
          set({ ...pickData(data), sync: { status: 'ready', lastError: null } })
        } catch (err) {
          set({ sync: { status: 'error', lastError: err.message } })
        }
      },
      dismissError: () => set((s) => ({ sync: { ...s.sync, lastError: null } })),
      hasPendingWrites: () => !queue.isIdle(),
      whenIdle: () => queue.whenIdle(),
      exportToFile: async () => {
        await queue.whenIdle()
        return api.exportToFile()
      },
      importFromFile: async () => {
        await queue.whenIdle()
        const result = await api.importFromFile()
        if (!result?.canceled) await get().load()
        return result
      },
      revealDatabase: () => api.revealDatabase(),

      // ---- Settings ----
      // Global defaults; a class may override either via updateClass.
      setSteps: (patch) => {
        const next = {
          ...(patch.pointStep !== undefined
            ? { pointStep: normalizeStep(patch.pointStep, DEFAULT_POINT_STEP) }
            : {}),
          ...(patch.weightStep !== undefined
            ? { weightStep: normalizeStep(patch.weightStep, DEFAULT_WEIGHT_STEP) }
            : {}),
        }
        if (!Object.keys(next).length) return
        mutate(() => set(next), () => api.putSettings(next))
      },

      // ---- Classes ----
      addClass: (name) => {
        const trimmed = (name || '').trim()
        if (!trimmed) return null
        const i = get().classes.length
        const cls = {
          id: uid(),
          name: trimmed,
          icon: pick(CLASS_ICONS, i),
          color: pick(CLASS_COLORS, i),
          pointStep: null,
          weightStep: null,
          createdAt: now(),
        }
        mutate(
          () => set((s) => ({ classes: [...s.classes, cls] })),
          () => api.createClass(cls),
        )
        return cls
      },
      updateClass: (id, patch) => {
        if (!get().classes.some((c) => c.id === id)) return
        let body
        mutate(
          () => {
            set((s) => ({ classes: s.classes.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
            body = sentPatch(get().classes.find((c) => c.id === id), patch, CLASS_FIELDS)
          },
          () => api.patchClass(id, body),
        )
      },
      removeClass: (id) => {
        if (!get().classes.some((c) => c.id === id)) return
        mutate(
          () =>
            set((s) => {
              const studentIds = new Set(s.students.filter((x) => x.classId === id).map((x) => x.id))
              return {
                classes: s.classes.filter((c) => c.id !== id),
                students: s.students.filter((x) => x.classId !== id),
                categories: s.categories.filter((c) => c.classId !== id),
                entries: s.entries.filter((e) => !studentIds.has(e.studentId)),
              }
            }),
          () => api.deleteClass(id),
        )
      },

      // ---- Students ----
      addStudent: (classId, { firstName, lastName, number }) => {
        const fn = (firstName || '').trim()
        if (!fn) return null
        const st = {
          id: uid(),
          classId,
          firstName: fn,
          lastName: (lastName || '').trim(),
          number: (number || '').trim(),
          createdAt: now(),
        }
        mutate(
          () => set((s) => ({ students: [...s.students, st] })),
          () => api.createStudent(st),
        )
        return st
      },
      updateStudent: (id, patch) => {
        if (!get().students.some((x) => x.id === id)) return
        let body
        mutate(
          () => {
            set((s) => ({ students: s.students.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
            body = sentPatch(get().students.find((x) => x.id === id), patch, STUDENT_FIELDS)
          },
          () => api.patchStudent(id, body),
        )
      },
      removeStudent: (id) => {
        if (!get().students.some((x) => x.id === id)) return
        mutate(
          () =>
            set((s) => ({
              students: s.students.filter((x) => x.id !== id),
              entries: s.entries.filter((e) => e.studentId !== id),
            })),
          () => api.deleteStudent(id),
        )
      },

      // ---- Categories ----
      addCategory: (classId, { name, weight }) => {
        const nm = (name || '').trim()
        if (!nm) return null
        const i = get().categories.filter((c) => c.classId === classId).length
        const cat = {
          id: uid(),
          classId,
          name: nm,
          weight: clampWeight(weight, get().weightStepFor(classId)),
          color: pick(CAT_COLORS, i),
          createdAt: now(),
        }
        mutate(
          () => set((s) => ({ categories: [...s.categories, cat] })),
          () => api.createCategory(cat),
        )
        return cat
      },
      updateCategory: (id, patch) => {
        if (!get().categories.some((c) => c.id === id)) return
        let body
        mutate(
          () => {
            set((s) => ({
              categories: s.categories.map((c) =>
                c.id === id
                  ? {
                      ...c,
                      ...patch,
                      ...(patch.weight != null
                        ? { weight: clampWeight(patch.weight, stepFor(s, c.classId, 'weightStep', DEFAULT_WEIGHT_STEP)) }
                        : {}),
                    }
                  : c,
              ),
            }))
            body = sentPatch(get().categories.find((c) => c.id === id), patch, CATEGORY_FIELDS)
          },
          () => api.patchCategory(id, body),
        )
      },
      removeCategory: (id) => {
        if (!get().categories.some((c) => c.id === id)) return
        mutate(
          () =>
            set((s) => ({
              categories: s.categories.filter((c) => c.id !== id),
              entries: s.entries.filter((e) => e.categoryId !== id),
            })),
          () => api.deleteCategory(id),
        )
      },

      // ---- Step resolvers (per-class override, else global) ----
      pointStepFor: (classId) => stepFor(get(), classId, 'pointStep', DEFAULT_POINT_STEP),
      weightStepFor: (classId) => stepFor(get(), classId, 'weightStep', DEFAULT_WEIGHT_STEP),

      // ---- Points ----
      // awards: [{ categoryId, points }] -> one Entry per student per non-zero amount.
      // One set() and one createPoints call, however many students.
      awardPointsBulk: (studentIds, awards, { date, note } = {}) => {
        const live = awards.filter((a) => a.categoryId && Number(a.points) !== 0)
        const ids = [...new Set(studentIds)].filter(Boolean)
        if (!live.length || !ids.length) return { entries: 0, students: 0 }
        // Refuse before touching state, so the caller keeps the user's draft.
        const count = live.length * ids.length
        if (count > MAX_POINTS_PER_WRITE) {
          set((s) => ({
            sync: {
              ...s.sync,
              lastError: `Za dużo wpisów naraz (${count}, limit ${MAX_POINTS_PER_WRITE}). Wybierz mniej uczniów lub kategorii.`,
            },
          }))
          return { entries: 0, students: ids.length }
        }

        const stamp = now()
        const on = date || today()
        const trimmed = (note || '').trim()
        const fresh = []
        for (const studentId of ids) {
          for (const a of live) {
            fresh.push({
              id: uid(),
              studentId,
              categoryId: a.categoryId,
              points: Number(a.points),
              note: trimmed,
              date: on,
              createdAt: stamp,
            })
          }
        }
        mutate(
          () => set((s) => ({ entries: [...s.entries, ...fresh] })),
          () => api.createPoints(fresh),
        )
        return { entries: fresh.length, students: ids.length }
      },

      awardPoints: (studentId, awards, opts) =>
        get().awardPointsBulk([studentId], awards, opts).entries,
    }
  })
}

function clampWeight(w, step) {
  const n = Number(w)
  if (!Number.isFinite(n) || n <= 0) return normalizeStep(step, DEFAULT_WEIGHT_STEP)
  const snapped = snapToStep(n, step)
  // Snapping must never zero out a positive weight — fall back to one step.
  return snapped > 0 ? snapped : normalizeStep(step, DEFAULT_WEIGHT_STEP)
}

function stepFor(state, classId, key, fallback) {
  const cls = state.classes.find((c) => c.id === classId)
  return normalizeStep(effectiveStep(cls, state[key], key), fallback)
}
