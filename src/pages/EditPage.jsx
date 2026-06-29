import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useStore, selectCategories } from '../store/useStore.js'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import EmptyState from '../components/EmptyState.jsx'

export default function EditPage() {
  const { cls } = useOutletContext()
  const categories = useStore(selectCategories(cls.id))
  const entries = useStore((s) => s.entries)
  const addCategory = useStore((s) => s.addCategory)
  const updateCategory = useStore((s) => s.updateCategory)
  const removeCategory = useStore((s) => s.removeCategory)

  const [form, setForm] = useState({ name: '', weight: '1' })
  const [toDelete, setToDelete] = useState(null)

  const submit = (e) => {
    e.preventDefault()
    const created = addCategory(cls.id, { name: form.name, weight: form.weight })
    if (created) setForm({ name: '', weight: '1' })
  }

  return (
    <section className="edit-page">
      <div className="edit-intro">
        <h2>Point categories</h2>
        <p className="muted-line">
          Every point belongs to a category. The <strong>weight</strong> is a multiplier — a point in a ×3 category is
          worth 3 on the leaderboard.
        </p>
      </div>

      <form className="add-cat card" onSubmit={submit}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="c-name">Category name</label>
          <input
            id="c-name"
            className="input"
            placeholder="e.g. Homework"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="field field-weight">
          <label htmlFor="c-weight">Weight ×</label>
          <input
            id="c-weight"
            className="input mono"
            type="number"
            min="0.1"
            step="any"
            value={form.weight}
            onChange={(e) => setForm({ ...form, weight: e.target.value })}
          />
        </div>
        <button className="btn btn-primary add-cat-btn" type="submit">
          + Add category
        </button>
      </form>

      {categories.length === 0 ? (
        <EmptyState icon="🏷️" title="No categories yet" hint="Add one above so you can start awarding points." />
      ) : (
        <ul className="cat-list">
          {categories.map((c) => (
            <CategoryRow
              key={c.id}
              cat={c}
              count={entries.filter((e) => e.categoryId === c.id).length}
              onSave={(patch) => updateCategory(c.id, patch)}
              onDelete={() => setToDelete(c)}
            />
          ))}
        </ul>
      )}

      {toDelete && (
        <ConfirmDialog
          title={`Delete “${toDelete.name}”?`}
          message="This category and every point awarded under it will be removed. Student scores will drop accordingly."
          confirmLabel="Delete category"
          onConfirm={() => removeCategory(toDelete.id)}
          onClose={() => setToDelete(null)}
        />
      )}
    </section>
  )
}

function CategoryRow({ cat, count, onSave, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ name: cat.name, weight: String(cat.weight) })

  const commit = () => {
    if (draft.name.trim()) onSave({ name: draft.name.trim(), weight: Number(draft.weight) })
    setEditing(false)
  }

  return (
    <li className="cat-row card" style={{ '--accent': cat.color }}>
      <span className="dot dot-lg" style={{ background: cat.color }} />
      {editing ? (
        <form
          className="cat-edit"
          onSubmit={(e) => {
            e.preventDefault()
            commit()
          }}
        >
          <input
            className="input"
            autoFocus
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            aria-label="Category name"
            onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
          />
          <input
            className="input mono cat-edit-weight"
            type="number"
            min="0.1"
            step="any"
            value={draft.weight}
            onChange={(e) => setDraft({ ...draft, weight: e.target.value })}
            aria-label="Weight"
          />
          <button className="btn btn-cyan btn-sm" type="submit">
            Save
          </button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <>
          <div className="cat-info">
            <span className="cat-name">{cat.name}</span>
            <span className="cat-sub muted-line">
              {count} {count === 1 ? 'award' : 'awards'}
            </span>
          </div>
          <span className="weight-pill mono">×{cat.weight}</span>
          <div className="cat-actions">
            <button className="btn btn-icon btn-ghost btn-sm" onClick={() => setEditing(true)} aria-label={`Edit ${cat.name}`}>
              ✏️
            </button>
            <button className="btn btn-icon btn-ghost btn-sm btn-danger" onClick={onDelete} aria-label={`Delete ${cat.name}`}>
              🗑️
            </button>
          </div>
        </>
      )}
    </li>
  )
}
