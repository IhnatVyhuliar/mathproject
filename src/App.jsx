import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { useStore } from './store/useStore.js'
import ErrorBanner from './components/ErrorBanner.jsx'

export default function App() {
  const status = useStore((s) => s.sync.status)
  const lastError = useStore((s) => s.sync.lastError)
  const load = useStore((s) => s.load)

  useEffect(() => {
    if (useStore.getState().sync.status !== 'unavailable') load()
  }, [load])

  if (status === 'unavailable') {
    return (
      <main className="shell">
        <p className="muted-line">Ta strona działa tylko w aplikacji Arcade Scoreboard.</p>
      </main>
    )
  }
  if (status === 'loading') {
    return (
      <main className="shell">
        <p className="muted-line">Wczytywanie danych…</p>
      </main>
    )
  }
  if (status === 'error') {
    return (
      <main className="shell">
        <div className="card">
          <h1 className="empty-title">Nie udało się wczytać bazy danych.</h1>
          <p className="muted-line">{lastError}</p>
          <button className="btn btn-primary" type="button" onClick={load}>
            Spróbuj ponownie
          </button>
        </div>
      </main>
    )
  }
  return (
    <>
      <Outlet />
      <ErrorBanner />
    </>
  )
}
