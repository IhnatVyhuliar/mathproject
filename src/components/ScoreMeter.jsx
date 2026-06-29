// Chunky segmented score meter — the signature element.
// Fills proportionally to `value / max`; animates width via CSS transition.
export default function ScoreMeter({ value, max, segments = 10, color = 'var(--cyan)', big = false }) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  const filled = Math.round(ratio * segments)

  return (
    <div className={`meter ${big ? 'meter-big' : ''}`} aria-hidden="true">
      {Array.from({ length: segments }).map((_, i) => (
        <span
          key={i}
          className={`meter-seg ${i < filled ? 'on' : ''}`}
          style={{
            background: i < filled ? color : undefined,
            transitionDelay: `${i * 28}ms`,
          }}
        />
      ))}
    </div>
  )
}
