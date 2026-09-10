import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useStore, selectStudents, selectCategories } from '../store/useStore.js'
import { leaderboard, fullName, initials } from '../lib/scoring.js'
import ScoreMeter from '../components/ScoreMeter.jsx'
import Confetti from '../components/Confetti.jsx'
import EmptyState from '../components/EmptyState.jsx'

const MEDALS = ['🥇', '🥈', '🥉']

export default function RankingPage() {
  const { cls } = useOutletContext()
  const students = useStore(selectStudents(cls.id))
  const categories = useStore(selectCategories(cls.id))
  const entries = useStore((s) => s.entries)

  const ranked = leaderboard(students, entries, categories, 10)
  const maxScore = Math.max(1, ranked[0]?.score || 0)
  const hasPoints = ranked.some((r) => r.score > 0)

  const [presenting, setPresenting] = useState(false)
  const [fireConfetti, setFireConfetti] = useState(0)

  // Confetti when the #1 student changes (a new leader takes the top).
  const leaderId = ranked[0]?.student.id
  const leaderScore = ranked[0]?.score || 0
  useEffect(() => {
    if (leaderId && leaderScore > 0) setFireConfetti((n) => n + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderId])

  // Esc exits present mode.
  useEffect(() => {
    if (!presenting) return
    const onKey = (e) => e.key === 'Escape' && exitPresent()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [presenting])

  const enterPresent = () => {
    setPresenting(true)
    document.documentElement.requestFullscreen?.().catch(() => {})
  }
  const exitPresent = () => {
    setPresenting(false)
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  }

  if (students.length === 0) {
    return <EmptyState icon="🏁" title="Nie ma kogo sklasyfikować" hint="Najpierw dodaj uczniów na karcie Uczniowie." />
  }

  const podium = ranked.slice(0, 3)
  const rest = ranked.slice(3)

  const board = (
    <>
      <div className="rank-head">
        <div>
          <p className="eyebrow">{cls.name} — najlepsza dziesiątka</p>
          <h2 className="rank-title">🏆 Tablica wyników</h2>
        </div>
        {!presenting && (
          <button className="btn btn-cyan" onClick={enterPresent}>
            ⛶ Prezentuj
          </button>
        )}
        {presenting && (
          <button className="btn btn-ghost" onClick={exitPresent}>
            ✕ Zamknij
          </button>
        )}
      </div>

      {!hasPoints ? (
        <EmptyState icon="✨" title="Nie przyznano jeszcze punktów" hint="Przyznaj punkty na karcie Uczniowie, żeby rozpocząć wyścig." />
      ) : (
        <>
          <ol className="podium" aria-label="Najlepsza trójka">
            {[1, 0, 2].map((slot) => {
              const row = podium[slot]
              if (!row) return <li key={slot} className="podium-slot empty-slot" />
              return (
                <li key={row.student.id} className={`podium-slot place-${row.rank}`}>
                  <span className="podium-medal" aria-hidden="true">
                    {MEDALS[row.rank - 1] || `#${row.rank}`}
                  </span>
                  <span className="podium-avatar" aria-hidden="true">
                    {initials(row.student)}
                  </span>
                  <span className="podium-name">{fullName(row.student)}</span>
                  <span className="podium-score mono">{row.score}</span>
                  <span className="podium-block" aria-hidden="true">
                    <span className="podium-rank mono">{row.rank}</span>
                  </span>
                </li>
              )
            })}
          </ol>

          {rest.length > 0 && (
            <ol className="rank-list" start={4}>
              {rest.map((row) => (
                <li className="rank-row" key={row.student.id}>
                  <span className="rank-pos mono">{row.rank}</span>
                  <span className="rank-avatar" aria-hidden="true">
                    {initials(row.student)}
                  </span>
                  <span className="rank-name">
                    {fullName(row.student)}
                    {row.student.number && <span className="rank-num mono"> #{row.student.number}</span>}
                  </span>
                  <span className="rank-meter">
                    <ScoreMeter value={row.score} max={maxScore} segments={16} color="var(--magenta)" />
                  </span>
                  <span className="rank-score mono">{row.score}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </>
  )

  if (presenting) {
    return (
      <div className="present-overlay">
        <Confetti fire={fireConfetti} />
        <div className="present-inner">{board}</div>
      </div>
    )
  }

  return (
    <section className="ranking">
      <Confetti fire={fireConfetti} />
      {board}
    </section>
  )
}
