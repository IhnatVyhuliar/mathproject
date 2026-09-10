// Pure helpers for turning entries + category weights into ranking scores.
// Score(student) = sum over their entries of (entry.points * weightOf(categoryId)).

export function buildWeightMap(categories) {
  const map = {}
  for (const c of categories) map[c.id] = c.weight
  return map
}

export function scoreOf(studentId, entries, weightMap) {
  let total = 0
  for (const e of entries) {
    if (e.studentId !== studentId) continue
    const w = weightMap[e.categoryId]
    if (w == null) continue // category was deleted; entry no longer counts
    total += e.points * w
  }
  return Math.round(total)
}

// Per-category subtotals for one student (weighted), used on student cards.
export function breakdownOf(studentId, entries, categories) {
  const byCat = {}
  for (const e of entries) {
    if (e.studentId !== studentId) continue
    byCat[e.categoryId] = (byCat[e.categoryId] || 0) + e.points
  }
  return categories
    .map((c) => ({
      categoryId: c.id,
      name: c.name,
      color: c.color,
      weight: c.weight,
      rawPoints: byCat[c.id] || 0,
      weighted: Math.round((byCat[c.id] || 0) * c.weight),
    }))
    .filter((b) => b.rawPoints !== 0)
}

// Ranked students for a class. Returns [{ student, score, rank }], ties share rank.
export function leaderboard(students, entries, categories, limit = Infinity) {
  const weightMap = buildWeightMap(categories)
  const ranked = students
    .map((s) => ({ student: s, score: scoreOf(s.id, entries, weightMap) }))
    .sort((a, b) => b.score - a.score || lastFirst(a.student).localeCompare(lastFirst(b.student)))

  let lastScore = null
  let lastRank = 0
  ranked.forEach((row, i) => {
    if (row.score === lastScore) {
      row.rank = lastRank
    } else {
      row.rank = i + 1
      lastRank = row.rank
      lastScore = row.score
    }
  })

  return limit === Infinity ? ranked : ranked.slice(0, limit)
}

function lastFirst(s) {
  return `${s.lastName} ${s.firstName}`.toLowerCase()
}

export function fullName(s) {
  return [s.firstName, s.lastName].filter(Boolean).join(' ')
}

export function initials(s) {
  const a = (s.firstName || '').trim()[0] || ''
  const b = (s.lastName || '').trim()[0] || ''
  return (a + b).toUpperCase() || '?'
}

export function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })
}
