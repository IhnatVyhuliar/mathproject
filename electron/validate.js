// Validation of records coming from the renderer. Each function returns an
// error message (Polish) or null when the value is fine.

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const finite = (v) => typeof v === 'number' && Number.isFinite(v)

const idStr = (v) => typeof v === 'string' && v !== ''
const nonBlank = (v) => typeof v === 'string' && v.trim() !== ''
const anyStr = (v) => typeof v === 'string'
const positive = (v) => finite(v) && v > 0
const positiveOrNull = (v) => v === null || positive(v)
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

// field -> [check, message]
const RULES = {
  id: [idStr, 'Nieprawidłowy identyfikator'],
  classId: [idStr, 'Nieprawidłowa klasa'],
  studentId: [idStr, 'Nieprawidłowy uczeń'],
  categoryId: [idStr, 'Nieprawidłowa kategoria'],
  createdAt: [idStr, 'Nieprawidłowa data utworzenia'],
  name: [nonBlank, 'Nazwa nie może być pusta'],
  firstName: [nonBlank, 'Imię nie może być puste'],
  lastName: [anyStr, 'Nieprawidłowe nazwisko'],
  number: [anyStr, 'Nieprawidłowy numer'],
  note: [anyStr, 'Nieprawidłowa notatka'],
  icon: [anyStr, 'Nieprawidłowa ikona'],
  color: [anyStr, 'Nieprawidłowy kolor'],
  weight: [positive, 'Waga musi być liczbą większą od zera'],
  points: [finite, 'Punkty muszą być liczbą'],
  date: [isDate, 'Nieprawidłowa data'],
}

// class steps may be null (= inherit the global step)
const CLASS_STEP = [positiveOrNull, 'Krok musi być liczbą większą od zera lub pusty']
const STEP = [positive, 'Krok musi być liczbą większą od zera']

const ENTITY_FIELDS = {
  class: ['id', 'name', 'icon', 'color', 'pointStep', 'weightStep', 'createdAt'],
  student: ['id', 'classId', 'firstName', 'lastName', 'number', 'createdAt'],
  category: ['id', 'classId', 'name', 'weight', 'color', 'createdAt'],
  point: ['id', 'studentId', 'categoryId', 'points', 'note', 'date', 'createdAt'],
}

export const PATCH_FIELDS = {
  class: ['name', 'icon', 'color', 'pointStep', 'weightStep'],
  student: ['firstName', 'lastName', 'number'],
  category: ['name', 'weight', 'color'],
}

function rule(kind, field) {
  if (kind === 'class' && (field === 'pointStep' || field === 'weightStep')) return CLASS_STEP
  return RULES[field]
}

export function validateEntity(kind, obj) {
  const fields = ENTITY_FIELDS[kind]
  if (!fields) return 'Nieznany rodzaj rekordu'
  if (!isObj(obj)) return 'Nieprawidłowy rekord'
  for (const f of fields) {
    const [ok, msg] = rule(kind, f)
    // class steps are optional on input (undefined = no override)
    const v = kind === 'class' && (f === 'pointStep' || f === 'weightStep') ? (obj[f] ?? null) : obj[f]
    if (!ok(v)) return msg
  }
  return null
}

export function validatePatch(kind, obj) {
  const allowed = PATCH_FIELDS[kind]
  if (!allowed) return 'Nieznany rodzaj rekordu'
  if (!isObj(obj)) return 'Nieprawidłowe zmiany'
  const keys = Object.keys(obj)
  if (keys.length === 0) return 'Brak zmian do zapisania'
  for (const k of keys) {
    if (!allowed.includes(k)) return 'Nieznane pole'
    const [ok, msg] = rule(kind, k)
    if (!ok(obj[k])) return msg
  }
  return null
}

export function validateSettings(obj) {
  if (!isObj(obj)) return 'Nieprawidłowe ustawienia'
  const keys = Object.keys(obj)
  if (keys.length === 0) return 'Brak zmian do zapisania'
  for (const k of keys) {
    if (k !== 'pointStep' && k !== 'weightStep') return 'Nieznane pole'
    if (!positive(obj[k])) return STEP[1]
  }
  return null
}
