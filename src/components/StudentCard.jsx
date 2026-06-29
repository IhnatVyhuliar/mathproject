import ScoreMeter from './ScoreMeter.jsx'
import { initials, breakdownOf } from '../lib/scoring.js'

export default function StudentCard({ student, score, maxScore, entries, categories, onAdd, onEdit, onRemove }) {
  const breakdown = breakdownOf(student.id, entries, categories).sort((a, b) => b.weighted - a.weighted)

  return (
    <div className="student-card card">
      <div className="student-top">
        <span className="avatar" aria-hidden="true">
          {initials(student)}
        </span>
        <div className="student-id">
          <h3 className="student-name">
            {student.firstName} {student.lastName}
          </h3>
          {student.number && <span className="student-num mono">#{student.number}</span>}
        </div>
        <div className="student-score">
          <span className="score-value mono">{score}</span>
          <span className="score-label">pts</span>
        </div>
      </div>

      <ScoreMeter value={score} max={maxScore} segments={12} color="var(--cyan)" />

      <div className="student-break">
        {breakdown.length === 0 ? (
          <span className="muted-line">No points yet</span>
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
          ＋ Points
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onEdit} aria-label={`Edit ${student.firstName}`}>
          ✏️ Edit
        </button>
        <button
          className="btn btn-ghost btn-sm btn-danger"
          onClick={onRemove}
          aria-label={`Remove ${student.firstName}`}
        >
          🗑️
        </button>
      </div>
    </div>
  )
}
