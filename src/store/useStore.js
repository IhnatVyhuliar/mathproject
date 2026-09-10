import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  DEFAULT_POINT_STEP,
  DEFAULT_WEIGHT_STEP,
  effectiveStep,
  normalizeStep,
  snapToStep,
} from '../lib/steps.js'

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

function seed() {
  const classId = uid()
  const cats = [
    { name: 'Zadanie domowe', weight: 2, color: CAT_COLORS[0] },
    { name: 'Odpowiedź na lekcji', weight: 1, color: CAT_COLORS[1] },
    { name: 'Zaangażowanie', weight: 1, color: CAT_COLORS[2] },
    { name: 'Sprawdzian', weight: 3, color: CAT_COLORS[3] },
  ].map((c) => ({ id: uid(), classId, createdAt: now(), ...c }))

  const names = [
    ['Anna', 'Kowalska', '1'],
    ['Tomasz', 'Nowak', '2'],
    ['Lena', 'Marek', '3'],
    ['Jakub', 'Wiśniewski', '4'],
    ['Maja', 'Zielińska', '5'],
  ]
  const students = names.map(([firstName, lastName, number]) => ({
    id: uid(),
    classId,
    firstName,
    lastName,
    number,
    createdAt: now(),
  }))

  // A spread of awards so the demo leaderboard isn't flat.
  const plan = [
    [0, [15, 10, 5, 10]],
    [1, [10, 5, 5, 10]],
    [2, [5, 10, 5, 5]],
    [3, [5, 5, 10, 5]],
    [4, [10, 5, 0, 10]],
  ]
  const entries = []
  plan.forEach(([si, perCat]) => {
    perCat.forEach((points, ci) => {
      if (!points) return
      entries.push({
        id: uid(),
        studentId: students[si].id,
        categoryId: cats[ci].id,
        points,
        note: '',
        date: today(),
        createdAt: now(),
      })
    })
  })

  return {
    classes: [
      {
        id: classId,
        name: 'Klasa 7B',
        icon: '🚀',
        color: CLASS_COLORS[0],
        pointStep: null,
        weightStep: null,
        createdAt: now(),
      },
    ],
    students,
    categories: cats,
    entries,
  }
}

export const useStore = create(
  persist(
    (set, get) => ({
      ...seed(),

      // ---- Settings ----
      // Global defaults; a class may override either via updateClass.
      pointStep: DEFAULT_POINT_STEP,
      weightStep: DEFAULT_WEIGHT_STEP,

      setSteps: (patch) =>
        set((s) => ({
          ...(patch.pointStep !== undefined
            ? { pointStep: normalizeStep(patch.pointStep, DEFAULT_POINT_STEP) }
            : {}),
          ...(patch.weightStep !== undefined
            ? { weightStep: normalizeStep(patch.weightStep, DEFAULT_WEIGHT_STEP) }
            : {}),
        })),

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
        set((s) => ({ classes: [...s.classes, cls] }))
        return cls
      },
      updateClass: (id, patch) =>
        set((s) => ({
          classes: s.classes.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),
      removeClass: (id) =>
        set((s) => {
          const studentIds = new Set(s.students.filter((x) => x.classId === id).map((x) => x.id))
          return {
            classes: s.classes.filter((c) => c.id !== id),
            students: s.students.filter((x) => x.classId !== id),
            categories: s.categories.filter((c) => c.classId !== id),
            entries: s.entries.filter((e) => !studentIds.has(e.studentId)),
          }
        }),

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
        set((s) => ({ students: [...s.students, st] }))
        return st
      },
      updateStudent: (id, patch) =>
        set((s) => ({
          students: s.students.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        })),
      removeStudent: (id) =>
        set((s) => ({
          students: s.students.filter((x) => x.id !== id),
          entries: s.entries.filter((e) => e.studentId !== id),
        })),

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
        set((s) => ({ categories: [...s.categories, cat] }))
        return cat
      },
      updateCategory: (id, patch) =>
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
        })),
      removeCategory: (id) =>
        set((s) => ({
          categories: s.categories.filter((c) => c.id !== id),
          entries: s.entries.filter((e) => e.categoryId !== id),
        })),

      // ---- Step resolvers (per-class override, else global) ----
      pointStepFor: (classId) => stepFor(get(), classId, 'pointStep', DEFAULT_POINT_STEP),
      weightStepFor: (classId) => stepFor(get(), classId, 'weightStep', DEFAULT_WEIGHT_STEP),

      // ---- Points ----
      // awards: [{ categoryId, points }] -> one Entry per student per non-zero amount.
      // Everything lands in a single set() so persist writes once, however many students.
      awardPointsBulk: (studentIds, awards, { date, note } = {}) => {
        const live = awards.filter((a) => a.categoryId && Number(a.points) !== 0)
        const ids = [...new Set(studentIds)].filter(Boolean)
        if (!live.length || !ids.length) return { entries: 0, students: 0 }

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
        set((s) => ({ entries: [...s.entries, ...fresh] }))
        return { entries: fresh.length, students: ids.length }
      },

      awardPoints: (studentId, awards, opts) =>
        get().awardPointsBulk([studentId], awards, opts).entries,
      removeEntry: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),

      resetAll: () => set(seed()),
    }),
    {
      name: 'arcade-scoreboard@v1',
      version: 2,
      // v1 predates the configurable steps: fill in the defaults and the
      // per-class "inherit" markers so older saved states keep working.
      migrate: (state, from) => {
        if (!state) return state
        if (from < 2) {
          return {
            ...state,
            pointStep: normalizeStep(state.pointStep, DEFAULT_POINT_STEP),
            weightStep: normalizeStep(state.weightStep, DEFAULT_WEIGHT_STEP),
            classes: (state.classes || []).map((c) => ({
              pointStep: null,
              weightStep: null,
              ...c,
            })),
          }
        }
        return state
      }
    },
  ),
)

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

// ---- Selector helpers (used with useStore(selector)) ----
export const selectClass = (id) => (s) => s.classes.find((c) => c.id === id)
export const selectStudents = (classId) => (s) => s.students.filter((x) => x.classId === classId)
export const selectCategories = (classId) => (s) => s.categories.filter((c) => c.classId === classId)
