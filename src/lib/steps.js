// Point/weight steps. Award amounts and category weights each snap to their own
// step so a teacher can work in round numbers (5, 10, 15) instead of ±1 clicks.

export const DEFAULT_POINT_STEP = 5
export const DEFAULT_WEIGHT_STEP = 1

export function normalizeStep(v, fallback) {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.round(n * 100) / 100
}

export function snapToStep(n, step) {
  const v = Number(n)
  const s = Number(step)
  if (!Number.isFinite(v)) return 0
  if (!Number.isFinite(s) || s <= 0) return v
  return Math.round((Math.round(v / s) * s) * 100) / 100
}

// Per-class override wins; `null`/`undefined` means "inherit the global value".
export function effectiveStep(cls, globalStep, key) {
  const own = cls?.[key]
  return own == null ? globalStep : own
}

// Polish has three plural forms: 1 uczeń / 2-4 uczniów / 5+ uczniów.
export function plural(n, [one, few, many]) {
  const abs = Math.abs(n)
  if (abs === 1) return one
  const mod10 = abs % 10
  const mod100 = abs % 100
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}
