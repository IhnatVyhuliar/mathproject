import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { formatCounts, summarize } from '../lib/exportFormat.js'

export default function BackupPanel() {
  const classes = useStore((s) => s.classes)
  const students = useStore((s) => s.students)
  const categories = useStore((s) => s.categories)
  const entries = useStore((s) => s.entries)
  const exportToFile = useStore((s) => s.exportToFile)
  const importFromFile = useStore((s) => s.importFromFile)
  const revealDatabase = useStore((s) => s.revealDatabase)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const run = async (action, toResult) => {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const value = await action()
      if (value?.canceled) return
      setResult(toResult(value))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="backup-panel card" aria-labelledby="backup-title">
      <h2 id="backup-title" className="backup-title">Kopia danych</h2>
      <p className="muted-line">
        Dane są zapisane w bazie na tym komputerze. Kopię (.json) możesz przenieść na inny komputer i tam
        zaimportować.
      </p>
      <p className="muted-line">{formatCounts(summarize({ classes, students, categories, entries }))}</p>
      <div className="backup-actions">
        <button className="btn btn-primary" type="button" disabled={busy} onClick={() => run(exportToFile, (v) => ({ saved: v.path }))}>
          ⬇ Eksportuj do pliku…
        </button>
        <button className="btn" type="button" disabled={busy} onClick={() => run(importFromFile, (v) => ({ imported: v }))}>
          ⬆ Importuj z pliku…
        </button>
        <button className="btn" type="button" disabled={busy} onClick={() => run(revealDatabase, () => null)}>
          📁 Pokaż plik bazy
        </button>
      </div>
      {result?.saved && <p className="muted-line">Zapisano kopię: {result.saved}</p>}
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
            <p className="muted-line">Kopia poprzednich danych: {result.imported.backupPath}</p>
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
