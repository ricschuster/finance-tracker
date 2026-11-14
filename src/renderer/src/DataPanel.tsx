import {
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  FolderOpen,
  HardDriveDownload,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { DataStatus } from '../../main/data-ipc'
import type { LedgerState } from './useLedger'
import { useAlert } from './ui'

function when(ms: number | null): string {
  return ms === null
    ? 'never'
    : new Date(ms).toLocaleString('en-CA', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
}

export function DataPanel({ run }: Pick<LedgerState, 'run'>) {
  const [status, setStatus] = useState<DataStatus | null>(null)
  const [folder, setFolder] = useState('')
  const [intervalDays, setIntervalDays] = useState('7')
  const [keep, setKeep] = useState('10')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const alert = useAlert()

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

  const on = Boolean(status?.settings.folder)
  const dirty =
    status !== null &&
    (folder !== status.settings.folder ||
      intervalDays !== String(status.settings.intervalDays) ||
      keep !== String(status.settings.keep))

  return (
    <section aria-label="Data">
      <h2>Data</h2>
      {message && (
        <div className="success" role="status">
          <CheckCircle2 size={17} />
          <span className="grow">{message}</span>
          <button
            type="button"
            className="ghost icon small"
            aria-label="Dismiss"
            onClick={() => setMessage(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {status?.keptRestoreCopy && (
        <div className="success" role="status">
          <CheckCircle2 size={17} />
          <span className="grow">
            Restored. Your previous data was kept at <code>{status.keptRestoreCopy}</code>.
          </span>
        </div>
      )}

      <div className="data-grid">
        <div className="card data-card">
          <div className="data-head">
            <span className="stat-icon accent" aria-hidden="true">
              <Database size={17} />
            </span>
            <div>
              <h3>Export and restore</h3>
              <p className="muted">
                Export the whole database as one file, or replace the current data from such a file.
                A copy of the current data is kept first when you restore.
              </p>
            </div>
          </div>
          <div className="data-actions">
            <button
              type="button"
              className="primary"
              onClick={() =>
                void run(async () => {
                  const p = await window.api.data.exportDatabase()
                  if (p) setMessage(`Database exported to ${p}.`)
                })
              }
            >
              <Download size={15} />
              Export database
            </button>
            <button
              type="button"
              onClick={() =>
                void run(async () => {
                  const r = await window.api.data.restoreDatabase()
                  if (r.status === 'invalid') await alert(r.reason, 'Cannot restore')
                })
              }
            >
              <RotateCcw size={15} />
              Restore from file
            </button>
          </div>
        </div>

        <div className="card data-card">
          <div className="data-head">
            <span className="stat-icon accent" aria-hidden="true">
              <FileSpreadsheet size={17} />
            </span>
            <div>
              <h3>Export transactions to CSV</h3>
              <p className="muted">
                One row per split line, for a spreadsheet or your accountant. Leave the dates empty
                to export everything.
              </p>
            </div>
          </div>
          <div className="data-actions">
            <label className="field">
              From
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="field">
              To
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
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
              <Download size={15} />
              Export CSV
            </button>
          </div>
        </div>
      </div>

      <div className="card data-card">
        <div className="data-head">
          <span className={on ? 'stat-icon pos' : 'stat-icon'} aria-hidden="true">
            <ShieldCheck size={17} />
          </span>
          <div className="grow">
            <h3>
              Automatic backups{' '}
              <span className={on ? 'pill pos' : 'pill'}>{on ? 'On' : 'Off'}</span>
            </h3>
            <p className="muted">
              Choose a folder to turn backups on. The app checks hourly and backs up when the newest
              backup is older than the interval.
            </p>
          </div>
          <button
            type="button"
            disabled={!on}
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
            <HardDriveDownload size={15} />
            Back up now
          </button>
        </div>

        {status && (
          <div className="backup-status">
            <div>
              <span>Last backup</span>
              <strong>{when(status.lastBackupAt)}</strong>
            </div>
            <div>
              <span>Backups in folder</span>
              <strong>{status.backupCount}</strong>
            </div>
          </div>
        )}
        {status?.lastError && (
          <div className="error" role="alert">
            Last backup failed: {status.lastError}
          </div>
        )}

        <form
          className="backup-form"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <label className="field folder-field">
            Folder
            <span className="input-with-button">
              <input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Off" />
              <button
                type="button"
                onClick={() =>
                  void run(async () => {
                    const f = await window.api.data.chooseFolder()
                    if (f) setFolder(f)
                  })
                }
              >
                <FolderOpen size={15} />
                Choose...
              </button>
            </span>
          </label>
          <label className="field">
            Every (days)
            <input
              type="number"
              min={1}
              max={365}
              value={intervalDays}
              onChange={(e) => setIntervalDays(e.target.value)}
            />
          </label>
          <label className="field">
            Keep the newest
            <input
              type="number"
              min={1}
              max={1000}
              value={keep}
              onChange={(e) => setKeep(e.target.value)}
            />
          </label>
          <button type="submit" disabled={!dirty}>
            Save
          </button>
        </form>
      </div>
    </section>
  )
}
