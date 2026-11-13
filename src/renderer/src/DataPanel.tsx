import { useCallback, useEffect, useState } from 'react'
import type { DataStatus } from '../../main/data-ipc'
import type { LedgerState } from './useLedger'

function when(ms: number | null): string {
  return ms === null ? 'never' : new Date(ms).toLocaleString()
}

export function DataPanel({ run }: Pick<LedgerState, 'run'>) {
  const [status, setStatus] = useState<DataStatus | null>(null)
  const [folder, setFolder] = useState('')
  const [intervalDays, setIntervalDays] = useState('7')
  const [keep, setKeep] = useState('10')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const apply = useCallback((s: DataStatus) => {
    setStatus(s)
    setFolder(s.settings.folder)
    setIntervalDays(String(s.settings.intervalDays))
    setKeep(String(s.settings.keep))
  }, [])
  useEffect(() => {
    void window.api.data.status().then(apply)
  }, [apply])

  const save = () =>
    run(async () => {
      apply(
        await window.api.data.setSettings({
          folder,
          intervalDays: Number(intervalDays),
          keep: Number(keep),
        }),
      )
      setMessage('Backup settings saved.')
    })

  return (
    <section aria-label="Data">
      <h2>Data</h2>
      {message && (
        <p role="status" className="muted">
          {message}
        </p>
      )}
      {status?.keptRestoreCopy && (
        <p role="status">
          Restored. Your previous data was kept at <code>{status.keptRestoreCopy}</code>.
        </p>
      )}

      <h3>Export and restore</h3>
      <p className="muted">
        Export the whole database as one file, or replace the current data from such a file. A copy
        of the current data is kept first when you restore.
      </p>
      <p>
        <button
          type="button"
          onClick={() =>
            void run(async () => {
              const p = await window.api.data.exportDatabase()
              if (p) setMessage(`Database exported to ${p}.`)
            })
          }
        >
          Export database
        </button>{' '}
        <button
          type="button"
          onClick={() =>
            void run(async () => {
              const r = await window.api.data.restoreDatabase()
              if (r.status === 'invalid') window.alert(`Cannot restore: ${r.reason}`)
            })
          }
        >
          Restore from file
        </button>
      </p>

      <h3>Export transactions to CSV</h3>
      <p className="muted">One row per split line. Leave the dates empty to export everything.</p>
      <p>
        <label>
          From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>{' '}
        <label>
          To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>{' '}
        <button
          type="button"
          onClick={() =>
            void run(async () => {
              const p = await window.api.data.exportCsv({
                ...(from ? { from } : {}),
                ...(to ? { to } : {}),
              })
              if (p) setMessage(`Transactions exported to ${p}.`)
            })
          }
        >
          Export CSV
        </button>
      </p>

      <h3>Automatic backups</h3>
      <p className="muted">
        Choose a folder to turn backups on. The app checks hourly and backs up when the newest
        backup is older than the interval.
      </p>
      <p>
        <label>
          Folder{' '}
          <input
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder="Off"
            size={40}
          />
        </label>{' '}
        <button
          type="button"
          onClick={() =>
            void run(async () => {
              const f = await window.api.data.chooseFolder()
              if (f) setFolder(f)
            })
          }
        >
          Choose...
        </button>
      </p>
      <p>
        <label>
          Every{' '}
          <input
            type="number"
            min={1}
            max={365}
            value={intervalDays}
            onChange={(e) => setIntervalDays(e.target.value)}
            style={{ width: '4em' }}
          />{' '}
          days
        </label>{' '}
        <label>
          Keep the newest{' '}
          <input
            type="number"
            min={1}
            max={1000}
            value={keep}
            onChange={(e) => setKeep(e.target.value)}
            style={{ width: '4em' }}
          />
        </label>{' '}
        <button type="button" onClick={() => void save()}>
          Save
        </button>
      </p>
      {status && (
        <p className="muted">
          {status.backupCount} backup(s) in the folder. Last backup: {when(status.lastBackupAt)}.
        </p>
      )}
      {status?.lastError && (
        <p className="error" role="alert">
          Last backup failed: {status.lastError}
        </p>
      )}
      <p>
        <button
          type="button"
          disabled={!status?.settings.folder}
          onClick={() =>
            void run(async () => {
              try {
                apply(await window.api.data.backupNow())
                setMessage('Backup written.')
              } catch (err) {
                // Show the recorded failure in this panel as well as the global error banner.
                apply(await window.api.data.status())
                throw err
              }
            })
          }
        >
          Back up now
        </button>
      </p>
    </section>
  )
}
