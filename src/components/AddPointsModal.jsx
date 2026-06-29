import { useState } from 'react'
import Modal from './Modal.jsx'
import { useStore } from '../store/useStore.js'
import { fullName } from '../lib/scoring.js'

const todayStr = () => new Date().toISOString().slice(0, 10)

// Award points across categories on a date. One Entry per non-zero category.
export default function AddPointsModal({ student, categories, onClose }) {
  const awardPoints = useStore((s) => s.awardPoints)
  const [date, setDate] = useState(todayStr())
  const [note, setNote] = useState('')
  const [amounts, setAmounts] = useState({}) // categoryId -> number

  const bump = (id, delta) =>
    setAmounts((a) => ({ ...a, [id]: clampInt((Number(a[id]) || 0) + delta) }))
  const setVal = (id, v) => setAmounts((a) => ({ ...a, [id]: v }))

  const total = categories.reduce((sum, c) => sum + (Number(amounts[c.id]) || 0) * c.weight, 0)
  const anything = categories.some((c) => Number(amounts[c.id]))

  const save = () => {
    const awards = categories.map((c) => ({ categoryId: c.id, points: Number(amounts[c.id]) || 0 }))
    const n = awardPoints(student.id, awards, { date, note })
    if (n) onClose()
  }

  return (
    <Modal
      title={`Award points · ${fullName(student)}`}
      onClose={onClose}
      footer={
        <>
          <span className="award-total">
            This award: <strong className="mono">{total > 0 ? `+${Math.round(total)}` : Math.round(total)}</strong> pts
          </span>
          <div className="foot-actions">
            <button className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={save} disabled={!anything}>
              Save award
            </button>
          </div>
        </>
      }
    >
      {categories.length === 0 ? (
        <p className="confirm-msg">
          No categories yet. Add some on the <strong>Edit</strong> tab first — points are always tied to a category so
          you know what they’re for.
        </p>
      ) : (
        <>
          <div className="award-meta">
            <div className="field">
              <label htmlFor="award-date">Date</label>
              <input
                id="award-date"
                type="date"
                className="input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="award-note">Note (optional)</label>
              <input
                id="award-note"
                className="input"
                placeholder="e.g. solved the bonus problem"
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
                    <button className="btn btn-icon btn-sm" onClick={() => bump(c.id, -1)} aria-label={`Minus one ${c.name}`}>
                      −
                    </button>
                    <input
                      className="input stepper-input mono"
                      type="number"
                      inputMode="numeric"
                      value={v}
                      placeholder="0"
                      onChange={(e) => setVal(c.id, e.target.value === '' ? '' : clampInt(Number(e.target.value)))}
                      aria-label={`Points for ${c.name}`}
                    />
                    <button className="btn btn-icon btn-sm" onClick={() => bump(c.id, 1)} aria-label={`Plus one ${c.name}`}>
                      +
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
  return Math.max(-999, Math.min(999, Math.trunc(n)))
}
