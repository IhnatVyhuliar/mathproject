import { useStore } from '../store/useStore.js'

export default function ErrorBanner() {
  const lastError = useStore((s) => s.sync.lastError)
  const dismissError = useStore((s) => s.dismissError)
  if (!lastError) return null
  return (
    <div className="error-banner" role="alert">
      <span>{lastError}</span>
      <button className="btn" type="button" aria-label="Zamknij" onClick={dismissError}>
        ✕
      </button>
    </div>
  )
}
