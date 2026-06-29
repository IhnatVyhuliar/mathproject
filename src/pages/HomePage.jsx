import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { leaderboard } from '../lib/scoring.js'
import EmptyState from '../components/EmptyState.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'

export default function HomePage() {
  const navigate = useNavigate()
  const classes = useStore((s) => s.classes)
  const students = useStore((s) => s.students)
  const entries = useStore((s) => s.entries)
  const categories = useStore((s) => s.categories)
  const addClass = useStore((s) => s.addClass)
  const updateClass = useStore((s) => s.updateClass)
  const removeClass = useStore((s) => s.removeClass)

  const [name, setName] = useState('')
  const [editing, setEditing] = useState(null) // class id
  const [editName, setEditName] = useState('')
  const [toDelete, setToDelete] = useState(null)

  const submit = (e) => {
    e.preventDefault()
    const cls = addClass(name)
    if (cls) setName('')
  }

  const saveEdit = (id) => {
    if (editName.trim()) updateClass(id, { name: editName.trim() })
    setEditing(null)
  }

  return (
    <div className="shell home">
      <header className="home-hero">
        <p className="eyebrow">Class points · live leaderboard</p>
        <h1 className="home-title">
          Arcade <span className="title-pop">Scoreboard</span>
        </h1>
        <p className="home-sub">Award weighted points, then put the leaderboard on the big screen.</p>

        <form className="add-class" onSubmit={submit}>
          <input
            className="input"
            placeholder="New class name — e.g. Class 8-A"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="New class name"
          />
          <button className="btn btn-primary" type="submit">
            + Add class
          </button>
        </form>
      </header>

      {classes.length === 0 ? (
        <EmptyState icon="🎓" title="No classes yet" hint="Add your first class above to get started." />
      ) : (
        <ul className="class-grid">
          {classes.map((cls) => {
            const roster = students.filter((s) => s.classId === cls.id)
            const cats = categories.filter((c) => c.classId === cls.id)
            const top = leaderboard(roster, entries, cats, 1)[0]
            const isEditing = editing === cls.id
            return (
              <li key={cls.id}>
                <div
                  className="class-card card"
                  style={{ '--accent': cls.color }}
                  role="button"
                  tabIndex={isEditing ? -1 : 0}
                  onClick={() => !isEditing && navigate(`/class/${cls.id}/players`)}
                  onKeyDown={(e) => {
                    if (isEditing) return
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigate(`/class/${cls.id}/players`)
                    }
                  }}
                >
                  <div className="class-card-top">
                    <span className="class-icon" style={{ background: cls.color + '26', color: cls.color }}>
                      {cls.icon}
                    </span>
                    <div className="class-card-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn btn-icon btn-ghost btn-sm"
                        aria-label={`Rename ${cls.name}`}
                        onClick={() => {
                          setEditing(cls.id)
                          setEditName(cls.name)
                        }}
                      >
                        ✏️
                      </button>
                      <button
                        className="btn btn-icon btn-ghost btn-sm btn-danger"
                        aria-label={`Delete ${cls.name}`}
                        onClick={() => setToDelete(cls)}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  {isEditing ? (
                    <form
                      className="inline-edit"
                      onClick={(e) => e.stopPropagation()}
                      onSubmit={(e) => {
                        e.preventDefault()
                        saveEdit(cls.id)
                      }}
                    >
                      <input
                        className="input"
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        aria-label="Class name"
                        onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                      />
                      <button className="btn btn-cyan btn-sm" type="submit">
                        Save
                      </button>
                    </form>
                  ) : (
                    <h2 className="class-card-name">{cls.name}</h2>
                  )}

                  <div className="class-card-meta">
                    <span className="tag">
                      👥 {roster.length} {roster.length === 1 ? 'student' : 'students'}
                    </span>
                    {top && top.score > 0 ? (
                      <span className="tag tag-lead">
                        👑 {top.student.firstName} · <span className="mono">{top.score}</span>
                      </span>
                    ) : (
                      <span className="tag">No points yet</span>
                    )}
                  </div>

                  <span className="class-card-go" aria-hidden="true">
                    Open →
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {toDelete && (
        <ConfirmDialog
          title={`Delete “${toDelete.name}”?`}
          message="This removes the class and all of its students, categories and points. This can’t be undone."
          confirmLabel="Delete class"
          onConfirm={() => removeClass(toDelete.id)}
          onClose={() => setToDelete(null)}
        />
      )}
    </div>
  )
}
