import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
    { name: 'Homework', weight: 2, color: CAT_COLORS[0] },
    { name: 'Class answer', weight: 1, color: CAT_COLORS[1] },
    { name: 'Effort', weight: 1, color: CAT_COLORS[2] },
    { name: 'Test', weight: 3, color: CAT_COLORS[3] },
  ].map((c) => ({ id: uid(), classId, createdAt: now(), ...c }))

  const names = [
    ['Anna', 'Kovalenko', '1'],
    ['Tom', 'Reyes', '2'],
    ['Lea', 'Marek', '3'],
    ['Ivan', 'Petrov', '4'],
    ['Mia', 'Olsen', '5'],
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
    [0, [12, 6, 4, 9]],
    [1, [8, 5, 3, 8]],
    [2, [6, 7, 5, 6]],
    [3, [4, 3, 6, 4]],
    [4, [10, 4, 2, 7]],
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
    classes: [{ id: classId, name: 'Class 7-B', icon: '🚀', color: CLASS_COLORS[0], createdAt: now() }],
    students,
    categories: cats,
    entries,
  }
}

export const useStore = create(
  persist(
    (set, get) => ({
      ...seed(),

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
          weight: clampWeight(weight),
          color: pick(CAT_COLORS, i),
          createdAt: now(),
        }
        set((s) => ({ categories: [...s.categories, cat] }))
        return cat
      },
      updateCategory: (id, patch) =>
        set((s) => ({
          categories: s.categories.map((c) =>
            c.id === id ? { ...c, ...patch, ...(patch.weight != null ? { weight: clampWeight(patch.weight) } : {}) } : c,
          ),
        })),
      removeCategory: (id) =>
        set((s) => ({
          categories: s.categories.filter((c) => c.id !== id),
          entries: s.entries.filter((e) => e.categoryId !== id),
        })),

      // ---- Points ----
      // awards: [{ categoryId, points }]  -> one Entry per non-zero amount.
      awardPoints: (studentId, awards, { date, note } = {}) => {
        const fresh = awards
          .filter((a) => a.categoryId && Number(a.points) !== 0)
          .map((a) => ({
            id: uid(),
            studentId,
            categoryId: a.categoryId,
            points: Number(a.points),
            note: (note || '').trim(),
            date: date || today(),
            createdAt: now(),
          }))
        if (!fresh.length) return 0
        set((s) => ({ entries: [...s.entries, ...fresh] }))
        return fresh.length
      },
      removeEntry: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),

      resetAll: () => set(seed()),
    }),
    {
      name: 'arcade-scoreboard@v1',
      version: 1,
      migrate: (state) => state, // stub for future schema changes
    },
  ),
)

function clampWeight(w) {
  const n = Number(w)
  if (!Number.isFinite(n) || n <= 0) return 1
  return Math.round(n * 100) / 100
}

// ---- Selector helpers (used with useStore(selector)) ----
export const selectClass = (id) => (s) => s.classes.find((c) => c.id === id)
export const selectStudents = (classId) => (s) => s.students.filter((x) => x.classId === classId)
export const selectCategories = (classId) => (s) => s.categories.filter((c) => c.classId === classId)
