import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useStore, selectCategories } from '../store/useStore.js'
import { snapToStep, normalizeStep, plural, DEFAULT_POINT_STEP, DEFAULT_WEIGHT_STEP } from '../lib/steps.js'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import EmptyState from '../components/EmptyState.jsx'

export default function EditPage() {
  const { cls } = useOutletContext()
  const categories = useStore(selectCategories(cls.id))
  const entries = useStore((s) => s.entries)
  const addCategory = useStore((s) => s.addCategory)
  const updateCategory = useStore((s) => s.updateCategory)
  const removeCategory = useStore((s) => s.removeCategory)
  const weightStep = useStore((s) => s.weightStepFor(cls.id))

  const [form, setForm] = useState({ name: '', weight: '' })
  const [toDelete, setToDelete] = useState(null)

  const submit = (e) => {
    e.preventDefault()
    const created = addCategory(cls.id, { name: form.name, weight: form.weight === '' ? weightStep : form.weight })
    if (created) setForm({ name: '', weight: '' })
  }

  return (
    <section className="edit-page">
      <StepSettings cls={cls} />

      <div className="edit-intro">
        <h2>Kategorie punktów</h2>
        <p className="muted-line">
          Każdy punkt należy do kategorii. <strong>Waga</strong> to mnożnik — punkt w kategorii ×3 jest
          wart 3 na tablicy wyników.
        </p>
      </div>

      <form className="add-cat card" onSubmit={submit}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="c-name">Nazwa kategorii</label>
          <input
            id="c-name"
            className="input"
            placeholder="np. Zadanie domowe"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="field field-weight">
          <label htmlFor="c-weight">Waga ×</label>
          <input
            id="c-weight"
            className="input mono"
            type="number"
            min={weightStep}
            step={weightStep}
            placeholder={String(weightStep)}
            value={form.weight}
            onChange={(e) => setForm({ ...form, weight: e.target.value })}
            onBlur={() =>
              setForm((f) => ({
                ...f,
                weight: f.weight === '' ? f.weight : String(snapToStep(Number(f.weight), weightStep)),
              }))
            }
          />
        </div>
        <button className="btn btn-primary add-cat-btn" type="submit">
          + Dodaj kategorię
        </button>
      </form>

      {categories.length === 0 ? (
        <EmptyState
          icon="🏷️"
          title="Nie ma jeszcze kategorii"
          hint="Dodaj jedną powyżej, żeby móc przyznawać punkty."
        />
      ) : (
        <ul className="cat-list">
          {categories.map((c) => (
            <CategoryRow
              key={c.id}
              cat={c}
              weightStep={weightStep}
              count={entries.filter((e) => e.categoryId === c.id).length}
              onSave={(patch) => updateCategory(c.id, patch)}
              onDelete={() => setToDelete(c)}
            />
          ))}
        </ul>
      )}

      {toDelete && (
        <ConfirmDialog
          title={`Usunąć „${toDelete.name}”?`}
          message="Ta kategoria i każdy przyznany w niej punkt zostaną usunięte. Wyniki uczniów odpowiednio spadną."
          confirmLabel="Usuń kategorię"
          onConfirm={() => removeCategory(toDelete.id)}
          onClose={() => setToDelete(null)}
        />
      )}
    </section>
  )
}

// Point and weight steps: global defaults, overridable for this class.
function StepSettings({ cls }) {
  const globalPointStep = useStore((s) => s.pointStep)
  const globalWeightStep = useStore((s) => s.weightStep)
  const setSteps = useStore((s) => s.setSteps)
  const updateClass = useStore((s) => s.updateClass)

  const rows = [
    {
      key: 'pointStep',
      id: 'step-points',
      label: 'Krok punktów',
      hint: 'O tyle skaczą przyciski przy przyznawaniu punktów.',
      globalValue: globalPointStep,
      fallback: DEFAULT_POINT_STEP,
    },
    {
      key: 'weightStep',
      id: 'step-weight',
      label: 'Krok wagi',
      hint: 'Wagi kategorii są zaokrąglane do wielokrotności tej liczby.',
      globalValue: globalWeightStep,
      fallback: DEFAULT_WEIGHT_STEP,
    },
  ]

  return (
    <div className="steps-card card">
      <div className="edit-intro">
        <h2>Krok punktacji</h2>
        <p className="muted-line">
          Punkty przyznajesz w równych porcjach. Domyślnie po 5 — zmień globalnie albo tylko dla tej klasy.
        </p>
      </div>

      <div className="steps-grid">
        {rows.map((r) => {
          const override = cls[r.key]
          const inherits = override == null
          return (
            <div className="steps-row" key={r.key}>
              <div className="steps-labels">
                <label htmlFor={r.id}>{r.label}</label>
                <p className="muted-line steps-hint">{r.hint}</p>
              </div>

              <div className="steps-inputs">
                <div className="field">
                  <label className="steps-scope" htmlFor={`${r.id}-global`}>
                    Globalnie
                  </label>
                  <input
                    id={`${r.id}-global`}
                    className="input mono steps-input"
                    type="number"
                    min="0.1"
                    step="any"
                    value={r.globalValue}
                    onChange={(e) => setSteps({ [r.key]: e.target.value })}
                  />
                </div>

                <div className="field">
                  <label className="steps-scope" htmlFor={r.id}>
                    Ta klasa
                  </label>
                  <input
                    id={r.id}
                    className="input mono steps-input"
                    type="number"
                    min="0.1"
                    step="any"
                    placeholder={String(r.globalValue)}
                    value={inherits ? '' : override}
                    onChange={(e) =>
                      updateClass(cls.id, {
                        [r.key]: e.target.value === '' ? null : normalizeStep(e.target.value, r.fallback),
                      })
                    }
                  />
                </div>

                <button
                  className="btn btn-ghost btn-sm steps-reset"
                  onClick={() => updateClass(cls.id, { [r.key]: null })}
                  disabled={inherits}
                >
                  {inherits ? `Używa globalnego (${r.globalValue})` : `Wróć do globalnego (${r.globalValue})`}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CategoryRow({ cat, count, weightStep, onSave, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ name: cat.name, weight: String(cat.weight) })

  const commit = () => {
    if (draft.name.trim()) onSave({ name: draft.name.trim(), weight: Number(draft.weight) })
    setEditing(false)
  }

  const open = () => {
    setDraft({ name: cat.name, weight: String(cat.weight) })
    setEditing(true)
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
            aria-label="Nazwa kategorii"
            onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
          />
          <input
            className="input mono cat-edit-weight"
            type="number"
            min={weightStep}
            step={weightStep}
            value={draft.weight}
            onChange={(e) => setDraft({ ...draft, weight: e.target.value })}
            onBlur={() =>
              setDraft((d) => ({
                ...d,
                weight: d.weight === '' ? d.weight : String(snapToStep(Number(d.weight), weightStep)),
              }))
            }
            aria-label="Waga"
          />
          <button className="btn btn-cyan btn-sm" type="submit">
            Zapisz
          </button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditing(false)}>
            Anuluj
          </button>
        </form>
      ) : (
        <>
          <div className="cat-info">
            <span className="cat-name">{cat.name}</span>
            <span className="cat-sub muted-line">
              {count} {plural(count, ['przyznanie', 'przyznania', 'przyznań'])}
            </span>
          </div>
          <span className="weight-pill mono">×{cat.weight}</span>
          <div className="cat-actions">
            <button className="btn btn-icon btn-ghost btn-sm" onClick={open} aria-label={`Edytuj ${cat.name}`}>
              ✏️
            </button>
            <button className="btn btn-icon btn-ghost btn-sm btn-danger" onClick={onDelete} aria-label={`Usuń ${cat.name}`}>
              🗑️
            </button>
          </div>
        </>
      )}
    </li>
  )
}
