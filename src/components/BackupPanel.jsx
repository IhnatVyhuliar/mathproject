import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { downloadJson } from '../lib/download.js'
import {
  ImportError,
  buildExport,
  exportFileName,
  formatCounts,
  hasSavedLocalData,
  readBrowserData,
  summarize,
} from '../lib/exportFormat.js'

export default function BackupPanel() {
  const classes = useStore((s) => s.classes)
  const students = useStore((s) => s.students)
  const categories = useStore((s) => s.categories)
  const entries = useStore((s) => s.entries)
  const [error, setError] = useState('')

  // Cheap, so checked on every render (the store saves right after each change).
  const hasData = hasSavedLocalData(window.localStorage)

  const download = () => {
    setError('')
    try {
      const data = readBrowserData(window.localStorage)
      if (!data) return
      const file = buildExport(data, { source: 'browser' })
      downloadJson(exportFileName(file.exportedAt), file)
    } catch (e) {
      if (e instanceof ImportError) setError(`Nie udało się odczytać zapisanych danych: ${e.message}`)
      else throw e
    }
  }

  return (
    <section className="backup-panel card" aria-labelledby="backup-title">
      <h2 id="backup-title" className="backup-title">Kopia danych</h2>
      <p className="muted-line">
        Pobierz wszystkie klasy, uczniów, kategorie i punkty zapisane w tej przeglądarce do pliku .json — żeby
        przenieść je do aplikacji Arcade Scoreboard.
      </p>
      {hasData ? (
        <p className="muted-line">
          {formatCounts(summarize({ classes, students, categories, entries }))}
        </p>
      ) : (
        <p className="muted-line">
          W tej przeglądarce nie ma zapisanych danych. Otwórz aplikację pod tym samym adresem, pod którym zwykle z
          niej korzystasz.
        </p>
      )}
      <button className="btn btn-primary" type="button" disabled={!hasData} onClick={download}>
        ⬇ Pobierz kopię (.json)
      </button>
      {error && (
        <p className="muted-line" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
