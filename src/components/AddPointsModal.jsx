import { useState } from 'react'
import Modal from './Modal.jsx'
import { useStore } from '../store/useStore.js'
import { fullName } from '../lib/scoring.js'
import { snapToStep } from '../lib/steps.js'

const todayStr = () => new Date().toISOString().slice(0, 10)

// Award points across categories on a date. One Entry per non-zero category.
export default function AddPointsModal({ student, categories, step = 1, onClose }) {
  const awardPoints = useStore((s) => s.awardPoints)
  const [date, setDate] = useState(todayStr())
  const [note, setNote] = useState('')
  const [amounts, setAmounts] = useState({}) // categoryId -> number

  const bump = (id, delta) =>
    setAmounts((a) => ({ ...a, [id]: clampInt(snapToStep((Number(a[id]) || 0) + delta, step)) }))
  const setVal = (id, v) => setAmounts((a) => ({ ...a, [id]: v }))
  const snap = (id) =>
    setAmounts((a) => {
      const raw = a[id]
      if (raw === '' || raw == null) return a
      return { ...a, [id]: clampInt(snapToStep(Number(raw), step)) }
    })

  const total = categories.reduce((sum, c) => sum + (Number(amounts[c.id]) || 0) * c.weight, 0)
  const anything = categories.some((c) => Number(amounts[c.id]))

  const save = () => {
    const awards = categories.map((c) => ({ categoryId: c.id, points: Number(amounts[c.id]) || 0 }))
    const n = awardPoints(student.id, awards, { date, note })
    if (n) onClose()
  }

  return (
    <Modal
      title={`Przyznaj punkty — ${fullName(student)}`}
      onClose={onClose}
      footer={
        <>
          <span className="award-total">
            Razem <strong className="mono">{total > 0 ? `+${Math.round(total)}` : Math.round(total)}</strong> pkt
          </span>
          <div className="foot-actions">
            <button className="btn btn-ghost" onClick={onClose}>
              Anuluj
            </button>
            <button className="btn btn-primary" onClick={save} disabled={!anything}>
              Przypisz punkty
            </button>
          </div>
        </>
      }
    >
      {categories.length === 0 ? (
        <p className="confirm-msg">
          Nie ma jeszcze kategorii. Dodaj je najpierw na karcie <strong>Kategorie</strong> — każdy punkt
          należy do kategorii, żebyś wiedział, za co został przyznany.
        </p>
      ) : (
        <>
          <div className="award-meta">
            <div className="field">
              <label htmlFor="award-date">Data</label>
              <input
                id="award-date"
                type="date"
                className="input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="award-note">Notatka (opcjonalnie)</label>
              <input
                id="award-note"
                className="input"
                placeholder="np. rozwiązał zadanie dodatkowe"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>

          <ul className="award-cats">
            {categories.map((c) => {
              const v = amounts[c.id] ?? ''
              return (
                <li className="award-cat" key={c.id} style={{ '--accent': c.color }}>
                  <div className="award-cat-info">
                    <span className="dot" style={{ background: c.color }} />
                    <span className="award-cat-name">{c.name}</span>
                    <span className="tag">×{c.weight}</span>
                  </div>
                  <div className="stepper">
                    <button
                      className="btn btn-sm step-btn mono"
                      onClick={() => bump(c.id, -step)}
                      aria-label={`Odejmij ${step} w kategorii ${c.name}`}
                    >
                      −{step}
                    </button>
                    <input
                      className="input stepper-input mono"
                      type="number"
                      inputMode="numeric"
                      step={step}
                      value={v}
                      placeholder="0"
                      onChange={(e) => setVal(c.id, e.target.value === '' ? '' : Number(e.target.value))}
                      onBlur={() => snap(c.id)}
                      aria-label={`Punkty w kategorii ${c.name}`}
                    />
                    <button
                      className="btn btn-sm step-btn mono"
                      onClick={() => bump(c.id, step)}
                      aria-label={`Dodaj ${step} w kategorii ${c.name}`}
                    >
                      +{step}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Modal>
  )
}

function clampInt(n) {
  if (!Number.isFinite(n)) return 0
  return Math.max(-9999, Math.min(9999, n))
}
