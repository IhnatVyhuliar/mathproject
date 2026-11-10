import { DatabaseSync } from 'node:sqlite'

export class NotEmptyError extends Error {
  constructor(message = 'Baza zawiera już dane') {
    super(message)
    this.name = 'NotEmptyError'
  }
}

const SCHEMA = `
CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK (id = 1), point_step REAL NOT NULL, weight_step REAL NOT NULL);
CREATE TABLE classes (id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '', point_step REAL, weight_step REAL, created_at TEXT NOT NULL);
CREATE TABLE students (id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL, last_name TEXT NOT NULL DEFAULT '', number TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL);
CREATE TABLE categories (id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL, weight REAL NOT NULL CHECK (weight > 0), color TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL);
CREATE TABLE points (id TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES students(id)   ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  points REAL NOT NULL, note TEXT NOT NULL DEFAULT '', date TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX students_class   ON students(class_id);
CREATE INDEX categories_class ON categories(class_id);
CREATE INDEX points_student   ON points(student_id);
CREATE INDEX points_category  ON points(category_id);
`

export function openDb(file) {
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA synchronous = NORMAL')
  const { user_version: version } = db.prepare('PRAGMA user_version').get()
  if (version === 0) {
    tx(db, () => {
      db.exec(SCHEMA)
      db.exec('PRAGMA user_version = 1')
    })
  }
  db.exec('INSERT OR IGNORE INTO settings (id, point_step, weight_step) VALUES (1, 5, 1)')
  return db
}

export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    try { db.exec('ROLLBACK') } catch { /* transaction already gone */ }
    throw err
  }
}

export function readState(db) {
  const settings = db.prepare('SELECT point_step, weight_step FROM settings WHERE id = 1').get()
  return {
    pointStep: settings.point_step,
    weightStep: settings.weight_step,
    classes: db.prepare('SELECT * FROM classes ORDER BY rowid').all().map((r) => ({
      id: r.id, name: r.name, icon: r.icon, color: r.color,
      pointStep: r.point_step, weightStep: r.weight_step, createdAt: r.created_at,
    })),
    students: db.prepare('SELECT * FROM students ORDER BY rowid').all().map((r) => ({
      id: r.id, classId: r.class_id, firstName: r.first_name, lastName: r.last_name,
      number: r.number, createdAt: r.created_at,
    })),
    categories: db.prepare('SELECT * FROM categories ORDER BY rowid').all().map((r) => ({
      id: r.id, classId: r.class_id, name: r.name, weight: r.weight, color: r.color,
      createdAt: r.created_at,
    })),
    entries: db.prepare('SELECT * FROM points ORDER BY rowid').all().map((r) => ({
      id: r.id, studentId: r.student_id, categoryId: r.category_id, points: r.points,
      note: r.note, date: r.date, createdAt: r.created_at,
    })),
  }
}

export function isEmpty(db) {
  return db.prepare('SELECT COUNT(*) AS n FROM classes').get().n === 0
}

export function importData(db, data, { force = false } = {}) {
  return tx(db, () => {
    if (!isEmpty(db)) {
      if (!force) throw new NotEmptyError()
      db.exec('DELETE FROM classes')
    }
    db.prepare('UPDATE settings SET point_step = ?, weight_step = ? WHERE id = 1')
      .run(data.pointStep, data.weightStep)
    const insClass = db.prepare('INSERT INTO classes (id, name, icon, color, point_step, weight_step, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    const insStudent = db.prepare('INSERT INTO students (id, class_id, first_name, last_name, number, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    const insCategory = db.prepare('INSERT INTO categories (id, class_id, name, weight, color, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    const insPoint = db.prepare('INSERT INTO points (id, student_id, category_id, points, note, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    for (const c of data.classes) insClass.run(c.id, c.name, c.icon, c.color, c.pointStep ?? null, c.weightStep ?? null, c.createdAt)
    for (const s of data.students) insStudent.run(s.id, s.classId, s.firstName, s.lastName, s.number, s.createdAt)
    for (const c of data.categories) insCategory.run(c.id, c.classId, c.name, c.weight, c.color, c.createdAt)
    for (const e of data.entries) insPoint.run(e.id, e.studentId, e.categoryId, e.points, e.note, e.date, e.createdAt)
    return {
      classes: data.classes.length, students: data.students.length,
      categories: data.categories.length, entries: data.entries.length,
    }
  })
}
