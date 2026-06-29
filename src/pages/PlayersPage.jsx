import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useStore, selectStudents, selectCategories } from '../store/useStore.js'
import { buildWeightMap, scoreOf, fullName } from '../lib/scoring.js'
import StudentCard from '../components/StudentCard.jsx'
import AddPointsModal from '../components/AddPointsModal.jsx'
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

  const [form, setForm] = useState({ firstName: '', lastName: '', number: '' })
  const [awarding, setAwarding] = useState(null) // student
  const [editingStudent, setEditingStudent] = useState(null)
  const [toDelete, setToDelete] = useState(null)

  const weightMap = buildWeightMap(categories)
  const scored = students.map((s) => ({ s, score: scoreOf(s.id, entries, weightMap) }))
  const maxScore = Math.max(1, ...scored.map((x) => x.score))

  const submit = (e) => {
    e.preventDefault()
    const created = addStudent(cls.id, form)
    if (created) setForm({ firstName: '', lastName: '', number: '' })
  }

  return (
    <section>
      <form className="add-student card" onSubmit={submit}>
        <div className="field">
          <label htmlFor="s-first">Name</label>
          <input
            id="s-first"
            className="input"
            placeholder="First name"
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="s-last">Surname</label>
          <input
            id="s-last"
            className="input"
            placeholder="Last name"
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          />
        </div>
        <div className="field field-num">
          <label htmlFor="s-num">Number</label>
          <input
            id="s-num"
            className="input mono"
            placeholder="#"
            value={form.number}
            onChange={(e) => setForm({ ...form, number: e.target.value })}
          />
        </div>
        <button className="btn btn-primary add-student-btn" type="submit">
          + Add student
        </button>
      </form>

      {students.length === 0 ? (
        <EmptyState
          icon="🧑‍🎓"
          title="No students yet"
          hint="Add your first one above. Each student gets a unique id automatically."
        />
      ) : (
        <ul className="student-grid">
          {scored.map(({ s, score }) => (
            <li key={s.id}>
              <StudentCard
                student={s}
                score={score}
                maxScore={maxScore}
                entries={entries}
                categories={categories}
                onAdd={() => setAwarding(s)}
                onEdit={() => setEditingStudent(s)}
                onRemove={() => setToDelete(s)}
              />
            </li>
          ))}
        </ul>
      )}

      {awarding && (
        <AddPointsModal student={awarding} categories={categories} onClose={() => setAwarding(null)} />
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
          title={`Remove ${fullName(toDelete)}?`}
          message="This deletes the student and all their points. This can’t be undone."
          confirmLabel="Remove student"
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
      title="Edit student"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => f.firstName.trim() && onSave(f)}>
            Save changes
          </button>
        </>
      }
    >
      <div className="edit-student-grid">
        <div className="field">
          <label htmlFor="e-first">Name</label>
          <input id="e-first" className="input" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="e-last">Surname</label>
          <input id="e-last" className="input" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="e-num">Number</label>
          <input id="e-num" className="input mono" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} />
        </div>
      </div>
    </Modal>
  )
}
