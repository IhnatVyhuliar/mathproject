import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { snapToStep, plural } from '../lib/steps.js'

const todayStr = () => new Date().toISOString().slice(0, 10)

// The coin tray: docked at the bottom while students are selected. Amounts are
// per category, so one click can hand out several kinds of points at once.
export default function BulkAwardBar({ studentIds, totalCount, categories, step, onAwarded, onClear }) {
  const awardPointsBulk = useStore((s) => s.awardPointsBulk)
  const [date, setDate] = useState(todayStr())
  const [note, setNote] = useState('')
  const [amounts, setAmounts] = useState({}) // categoryId -> number | ''
  const [open, setOpen] = useState(false)

  // The tray's height changes with the category count and the date/note
  // disclosure, so publish it and let the page reserve exactly that much.
  const trayRef = useRef(null)
  useEffect(() => {
    const el = trayRef.current
    if (!el) return
    const root = document.documentElement
    const publish = () => root.style.setProperty('--tray-h', `${el.offsetHeight}px`)
    publish()
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    return () => {
      ro.disconnect()
      root.style.removeProperty('--tray-h')
    }
  }, [])

  const count = studentIds.length
  const bump = (id, delta) =>
    setAmounts((a) => ({ ...a, [id]: clamp(snapToStep((Number(a[id]) || 0) + delta, step)) }))
  const setVal = (id, v) => setAmounts((a) => ({ ...a, [id]: v }))
  const snap = (id) =>
    setAmounts((a) => {
      const raw = a[id]
      if (raw === '' || raw == null) return a
      return { ...a, [id]: clamp(snapToStep(Number(raw), step)) }
    })

  const perStudent = categories.reduce((sum, c) => sum + (Number(amounts[c.id]) || 0) * c.weight, 0)
  const total = Math.round(perStudent * count)
  const anything = categories.some((c) => Number(amounts[c.id]))

  const award = () => {
    const awards = categories.map((c) => ({ categoryId: c.id, points: Number(amounts[c.id]) || 0 }))
    const result = awardPointsBulk(studentIds, awards, { date, note })
    if (!result.entries) return
    setAmounts({})
    setNote('')
    setOpen(false)
    onAwarded(result)
  }

  const stepLabel = String(step)

  return (
    <div className="tray" ref={trayRef} role="region" aria-label="Przypisywanie punktów wybranym uczniom">
      <div className="tray-inner">
        <div className="tray-head">
          <p className="tray-count">
            Wybrano <strong className="mono">{count}</strong> z <span className="mono">{totalCount}</span>
          </p>
          <button className="btn btn-ghost btn-sm" onClick={onClear}>
            Odznacz wszystkich
          </button>
        </div>

        {categories.length === 0 ? (
          <p className="tray-empty">
            Najpierw dodaj kategorie na karcie <strong>Kategorie</strong> — każdy punkt należy do
            kategorii, żebyś wiedział, za co został przyznany.
          </p>
        ) : (
          <>
            <div className="tray-cats">
              {categories.map((c) => {
                const v = amounts[c.id] ?? ''
                return (
                  <div className="tray-cat" key={c.id}>
                    <span className="tray-cat-name">
                      <span className="dot" style={{ background: c.color }} />
                      {c.name}
                      <span className="tag">×{c.weight}</span>
                    </span>
                    <div className="stepper">
                      <button
                        className="btn btn-sm step-btn mono"
                        onClick={() => bump(c.id, -step)}
                        aria-label={`Odejmij ${stepLabel} w kategorii ${c.name}`}
                      >
                        −{stepLabel}
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
                        aria-label={`Dodaj ${stepLabel} w kategorii ${c.name}`}
                      >
                        +{stepLabel}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {open && (
              <div className="tray-meta">
                <div className="field">
                  <label htmlFor="tray-date">Data</label>
                  <input
                    id="tray-date"
                    type="date"
                    className="input"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="tray-note">Notatka (opcjonalnie)</label>
                  <input
                    id="tray-note"
                    className="input"
                    placeholder="np. praca w grupach"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="tray-foot">
              <button
                className="btn btn-ghost btn-sm tray-more"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
              >
                {open ? 'Ukryj datę i notatkę' : 'Data i notatka'}
              </button>
              <p className="tray-total">
                Razem <strong className="mono">{total > 0 ? `+${total}` : total}</strong> pkt
                {anything && (
                  <span className="tray-total-sub">
                    {' '}
                    ({count} × {Math.round(perStudent)})
                  </span>
                )}
              </p>
              <button className="btn btn-primary" onClick={award} disabled={!anything}>
                Przypisz {count} {plural(count, ['uczniowi', 'uczniom', 'uczniom'])}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function clamp(n) {
  if (!Number.isFinite(n)) return 0
  return Math.max(-9999, Math.min(9999, n))
}
