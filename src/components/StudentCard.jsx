import ScoreMeter from './ScoreMeter.jsx'
import { initials, breakdownOf, fullName } from '../lib/scoring.js'

export default function StudentCard({
  student,
  score,
  maxScore,
  entries,
  categories,
  selected = false,
  onToggleSelect,
  onAdd,
  onEdit,
  onRemove,
}) {
  const breakdown = breakdownOf(student.id, entries, categories).sort((a, b) => b.weighted - a.weighted)

  return (
    <div className={`student-card card${selected ? ' is-selected' : ''}`}>
      <div className="student-top">
        {/* The avatar doubles as the selection checkbox — no extra chrome. */}
        <label className="avatar-pick">
          <input
            type="checkbox"
            className="sr-only"
            checked={selected}
            onChange={() => onToggleSelect(student.id)}
          />
          <span className="avatar">
            <span className="avatar-initials" aria-hidden="true">
              {initials(student)}
            </span>
            <span className="avatar-check" aria-hidden="true">
              ✓
            </span>
          </span>
          <span className="sr-only">Wybierz {fullName(student)}</span>
        </label>
        <div className="student-id">
          <h3 className="student-name">
            {student.firstName} {student.lastName}
          </h3>
          {student.number && <span className="student-num mono">#{student.number}</span>}
        </div>
        <div className="student-score">
          <span className="score-value mono">{score}</span>
          <span className="score-label">pkt</span>
        </div>
      </div>

      <ScoreMeter value={score} max={maxScore} segments={12} color="var(--cyan)" />

      <div className="student-break">
        {breakdown.length === 0 ? (
          <span className="muted-line">Brak punktów</span>
        ) : (
          breakdown.slice(0, 4).map((b) => (
            <span className="break-chip" key={b.categoryId} style={{ '--accent': b.color }}>
              <span className="dot" style={{ background: b.color }} />
              {b.name} <span className="mono">+{b.weighted}</span>
            </span>
          ))
        )}
      </div>

      <div className="student-actions">
        <button className="btn btn-cyan btn-sm" onClick={onAdd}>
          ＋ Punkty
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onEdit} aria-label={`Edytuj ${fullName(student)}`}>
          ✏️ Edytuj
        </button>
        <button
          className="btn btn-ghost btn-sm btn-danger"
          onClick={onRemove}
          aria-label={`Usuń ${fullName(student)}`}
        >
          🗑️
        </button>
      </div>
    </div>
  )
}
