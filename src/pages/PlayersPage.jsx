import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useStore, selectStudents, selectCategories } from '../store/useStore.js'
import { buildWeightMap, scoreOf, fullName } from '../lib/scoring.js'
import { plural } from '../lib/steps.js'
import StudentCard from '../components/StudentCard.jsx'
import AddPointsModal from '../components/AddPointsModal.jsx'
import BulkAwardBar from '../components/BulkAwardBar.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import Modal from '../components/Modal.jsx'
import EmptyState from '../components/EmptyState.jsx'

export default function PlayersPage() {
  const { cls } = useOutletContext()
  const students = useStore(selectStudents(cls.id))
  const categories = useStore(selectCategories(cls.id))
  const entries = useStore((s) => s.entries)
  const addStudent = useStore((s) => s.addStudent)
  const updateStudent = useStore((s) => s.updateStudent)
  const removeStudent = useStore((s) => s.removeStudent)
  const pointStep = useStore((s) => s.pointStepFor(cls.id))

  const [form, setForm] = useState({ firstName: '', lastName: '', number: '' })
  const [awarding, setAwarding] = useState(null) // student
  const [editingStudent, setEditingStudent] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [selected, setSelected] = useState(() => new Set())
  const [toast, setToast] = useState(null)

  const studentIds = students.map((s) => s.id)
  // The store selector hands back a fresh array each render, so the effect keys
  // off a primitive — an array here re-fires it forever.
  const idsKey = studentIds.join(',')

  // Drop ids of students who were removed while selected.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev
      const live = new Set(idsKey ? idsKey.split(',') : [])
      const next = new Set([...prev].filter((id) => live.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [idsKey])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const allRef = useRef(null)
  const allSelected = students.length > 0 && selected.size === students.length
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = selected.size > 0 && !allSelected
  }, [selected, allSelected])

  const weightMap = buildWeightMap(categories)
  const scored = students.map((s) => ({ s, score: scoreOf(s.id, entries, weightMap) }))
  const maxScore = Math.max(1, ...scored.map((x) => x.score))

  const submit = (e) => {
    e.preventDefault()
    const created = addStudent(cls.id, form)
    if (created) setForm({ firstName: '', lastName: '', number: '' })
  }

  const toggleSelect = (id) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(studentIds))
  const clearSelection = () => setSelected(new Set())

  const onAwarded = ({ entries: n, students: m }) => {
    clearSelection()
    setToast(
      `Przypisano ${n} ${plural(n, ['wpis', 'wpisy', 'wpisów'])} ${m} ${plural(m, ['uczniowi', 'uczniom', 'uczniom'])}`,
    )
  }

  return (
    <section className={selected.size > 0 ? 'has-tray' : undefined}>
      <form className="add-student card" onSubmit={submit}>
        <div className="field">
          <label htmlFor="s-first">Imię</label>
          <input
            id="s-first"
            className="input"
            placeholder="Imię"
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="s-last">Nazwisko</label>
          <input
            id="s-last"
            className="input"
            placeholder="Nazwisko"
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          />
        </div>
        <div className="field field-num">
          <label htmlFor="s-num">Numer</label>
          <input
            id="s-num"
            className="input mono"
            placeholder="#"
            value={form.number}
            onChange={(e) => setForm({ ...form, number: e.target.value })}
          />
        </div>
        <button className="btn btn-primary add-student-btn" type="submit">
          + Dodaj ucznia
        </button>
      </form>

      {students.length === 0 ? (
        <EmptyState
          icon="🧑‍🎓"
          title="Nie ma jeszcze uczniów"
          hint="Dodaj pierwszego powyżej. Każdy uczeń dostaje własny identyfikator automatycznie."
        />
      ) : (
        <>
          <div className="roster-bar">
            <label className="pick-all">
              <input ref={allRef} type="checkbox" checked={allSelected} onChange={toggleAll} />
              <span>Wybierz wszystkich z klasy</span>
            </label>
            <p className="roster-count muted-line" aria-live="polite">
              {selected.size > 0
                ? `Wybrano ${selected.size} z ${students.length}`
                : `${students.length} ${plural(students.length, ['uczeń', 'uczniów', 'uczniów'])}`}
            </p>
            {/* Always in the DOM so screen readers announce the update. */}
            <p className={`roster-toast tag${toast ? '' : ' is-hidden'}`} role="status">
              {toast}
            </p>
          </div>

          <ul className="student-grid">
            {scored.map(({ s, score }) => (
              <li key={s.id}>
                <StudentCard
                  student={s}
                  score={score}
                  maxScore={maxScore}
                  entries={entries}
                  categories={categories}
                  selected={selected.has(s.id)}
                  onToggleSelect={toggleSelect}
                  onAdd={() => setAwarding(s)}
                  onEdit={() => setEditingStudent(s)}
                  onRemove={() => setToDelete(s)}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      {selected.size > 0 && (
        <BulkAwardBar
          studentIds={[...selected]}
          totalCount={students.length}
          categories={categories}
          step={pointStep}
          onAwarded={onAwarded}
          onClear={clearSelection}
        />
      )}

      {awarding && (
        <AddPointsModal
          student={awarding}
          categories={categories}
          step={pointStep}
          onClose={() => setAwarding(null)}
        />
      )}

      {editingStudent && (
        <EditStudentModal
          student={editingStudent}
          onSave={(patch) => {
            updateStudent(editingStudent.id, patch)
            setEditingStudent(null)
          }}
          onClose={() => setEditingStudent(null)}
        />
      )}

      {toDelete && (
        <ConfirmDialog
          title={`Usunąć ${fullName(toDelete)}?`}
          message="Usuwa ucznia razem z wszystkimi jego punktami. Tego nie da się cofnąć."
          confirmLabel="Usuń ucznia"
          onConfirm={() => removeStudent(toDelete.id)}
          onClose={() => setToDelete(null)}
        />
      )}
    </section>
  )
}

function EditStudentModal({ student, onSave, onClose }) {
  const [f, setF] = useState({
    firstName: student.firstName,
    lastName: student.lastName,
    number: student.number,
  })
  return (
    <Modal
      title="Edytuj ucznia"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Anuluj
          </button>
          <button className="btn btn-primary" onClick={() => f.firstName.trim() && onSave(f)}>
            Zapisz zmiany
          </button>
        </>
      }
    >
      <div className="edit-student-grid">
        <div className="field">
          <label htmlFor="e-first">Imię</label>
          <input id="e-first" className="input" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="e-last">Nazwisko</label>
          <input id="e-last" className="input" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="e-num">Numer</label>
          <input id="e-num" className="input mono" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} />
        </div>
      </div>
    </Modal>
  )
}
