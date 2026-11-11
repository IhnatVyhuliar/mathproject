import { useEffect, useState } from 'react'
import { backend, useStore } from '../store/useStore.js'
import { formatCounts, summarize } from '../lib/exportFormat.js'

const inBrowser = backend === 'browser'

// Put on the web server by scripts/deploy-web.sh (public/ → dist/).
const INSTALLER = './ScoreboardSetup.exe'

// The web server answers unknown paths with index.html (200, text/html), so a
// plain status check would always say "available".
function useInstallerAvailable() {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    if (!inBrowser) return
    let alive = true
    fetch(INSTALLER, { method: 'HEAD' })
      .then((r) => {
        const type = r.headers.get('content-type') || ''
        if (alive) setAvailable(r.ok && !type.includes('text/html'))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return available
}

export default function BackupPanel() {
  const classes = useStore((s) => s.classes)
  const students = useStore((s) => s.students)
  const categories = useStore((s) => s.categories)
  const entries = useStore((s) => s.entries)
  const exportToFile = useStore((s) => s.exportToFile)
  const importFromFile = useStore((s) => s.importFromFile)
  const revealDatabase = useStore((s) => s.revealDatabase)
  const installerAvailable = useInstallerAvailable()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const run = async (action, toResult, failure) => {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const value = await action()
      if (value?.canceled) return
      setResult(toResult(value))
    } catch (e) {
      setError(`${failure}: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="backup-panel card" aria-labelledby="backup-title">
      <h2 id="backup-title" className="backup-title">Kopia danych</h2>
      <p className="muted-line">
        {inBrowser
          ? 'Dane są zapisane w tej przeglądarce na tym komputerze. Kopię (.json) możesz przenieść do aplikacji Arcade Scoreboard albo do innej przeglądarki.'
          : 'Dane są zapisane w bazie na tym komputerze. Kopię (.json) możesz przenieść na inny komputer i tam zaimportować.'}
      </p>
      <p className="muted-line">{formatCounts(summarize({ classes, students, categories, entries }))}</p>
      <div className="backup-actions">
        <button className="btn btn-primary" type="button" disabled={busy} onClick={() => run(exportToFile, (v) => ({ saved: v.path }), 'Nie udało się wyeksportować')}>
          {inBrowser ? '⬇ Pobierz kopię (.json)' : '⬇ Eksportuj do pliku…'}
        </button>
        <button className="btn" type="button" disabled={busy} onClick={() => run(importFromFile, (v) => ({ imported: v }), 'Nie udało się zaimportować')}>
          ⬆ Importuj z pliku…
        </button>
        {!inBrowser && (
          <button className="btn" type="button" disabled={busy} onClick={() => run(revealDatabase, () => null, 'Nie udało się otworzyć folderu')}>
            📁 Pokaż plik bazy
          </button>
        )}
        {installerAvailable && (
          <a className="btn" href={INSTALLER} download>
            💻 Pobierz aplikację na Windows
          </a>
        )}
      </div>
      {installerAvailable && (
        <p className="muted-line">
          Aplikacja działa bez internetu i trzyma dane w bazie na dysku. Żeby przenieść dane: pobierz kopię, zainstaluj
          aplikację i kliknij w niej „⬆ Importuj z pliku…”.
        </p>
      )}
      {result?.saved && (
        <p className="muted-line">{inBrowser ? `Pobrano plik: ${result.saved}` : `Zapisano kopię: ${result.saved}`}</p>
      )}
      {result?.imported && (
        <>
          <p className="muted-line">Zaimportowano: {formatCounts(result.imported.counts)}</p>
          {result.imported.warnings?.length > 0 && (
            <ul className="muted-line">
              {result.imported.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          {result.imported.backupPath && (
            <p className="muted-line">
              {inBrowser ? 'Pobrano kopię poprzednich danych: ' : 'Kopia poprzednich danych: '}
              {result.imported.backupPath}
            </p>
          )}
        </>
      )}
      {error && (
        <p className="muted-line" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
