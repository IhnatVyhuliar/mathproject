// All SQL for data operations lives here. Column names come only from the
// whitelist maps below, never from caller-supplied keys.

const TABLES = { class: 'classes', student: 'students', category: 'categories', point: 'points' }

const PATCH_COLUMNS = {
  class: { name: 'name', icon: 'icon', color: 'color', pointStep: 'point_step', weightStep: 'weight_step' },
  student: { firstName: 'first_name', lastName: 'last_name', number: 'number' },
  category: { name: 'name', weight: 'weight', color: 'color' },
}

const SETTINGS_COLUMNS = { pointStep: 'point_step', weightStep: 'weight_step' }

export function insertClass(db, c) {
  db.prepare('INSERT INTO classes (id, name, icon, color, point_step, weight_step, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(c.id, c.name, c.icon, c.color, c.pointStep ?? null, c.weightStep ?? null, c.createdAt)
}

export function insertStudent(db, s) {
  db.prepare('INSERT INTO students (id, class_id, first_name, last_name, number, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(s.id, s.classId, s.firstName, s.lastName, s.number, s.createdAt)
}

export function insertCategory(db, c) {
  db.prepare('INSERT INTO categories (id, class_id, name, weight, color, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(c.id, c.classId, c.name, c.weight, c.color, c.createdAt)
}

// Caller is responsible for wrapping multi-entry calls in a transaction.
export function insertPoints(db, entries) {
  const stmt = db.prepare('INSERT INTO points (id, student_id, category_id, points, note, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  for (const e of entries) stmt.run(e.id, e.studentId, e.categoryId, e.points, e.note, e.date, e.createdAt)
}

// Returns false when no row has that id.
export function patchEntity(db, kind, id, patch) {
  const map = PATCH_COLUMNS[kind]
  if (!map) throw new Error('Nieznany rodzaj rekordu')
  const keys = Object.keys(patch).filter((k) => Object.hasOwn(map, k))
  if (keys.length === 0) throw new Error('Brak dozwolonych pól do zmiany')
  const sets = keys.map((k) => `${map[k]} = ?`).join(', ')
  const values = keys.map((k) => patch[k] ?? null)
  return db.prepare(`UPDATE ${TABLES[kind]} SET ${sets} WHERE id = ?`).run(...values, id).changes > 0
}

// Returns false when no row has that id. Children go via ON DELETE CASCADE.
export function deleteEntity(db, kind, id) {
  return db.prepare(`DELETE FROM ${TABLES[kind]} WHERE id = ?`).run(id).changes > 0
}

export function updateSettings(db, patch) {
  const keys = Object.keys(patch).filter((k) => Object.hasOwn(SETTINGS_COLUMNS, k))
  if (keys.length === 0) throw new Error('Brak dozwolonych pól do zmiany')
  const sets = keys.map((k) => `${SETTINGS_COLUMNS[k]} = ?`).join(', ')
  db.prepare(`UPDATE settings SET ${sets} WHERE id = 1`).run(...keys.map((k) => patch[k]))
}
