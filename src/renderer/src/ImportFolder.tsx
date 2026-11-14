import { FileText, FolderOpen, FolderSync, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { FolderFileStatus, FolderScan } from '../../core/import/folder'
import { ActionMenu } from './ui'

const LABEL: Record<FolderFileStatus, string> = {
  ready: 'Ready to review',
  needs_mapping: 'Needs mapping',
  already_imported: 'Already imported',
  unreadable: 'Cannot read',
}

const TONE: Record<FolderFileStatus, string> = {
  ready: 'pos',
  needs_mapping: 'warn',
  already_imported: '',
  unreadable: 'neg',
}

/** The watched import folder: lists bank files and opens one in the wizard. Never moves or deletes files. */
export function ImportFolder({ onOpen }: { onOpen: (name: string) => void }) {
  const [folder, setFolder] = useState<string | null>(null)
  const [scan, setScan] = useState<FolderScan | null>(null)
  const [showDone, setShowDone] = useState(false)

  const check = useCallback(async () => {
    setScan(await window.api.importer.scanFolder())
  }, [])

  // The folder is checked each time the import screen opens.
  useEffect(() => {
    void window.api.importer.getFolder().then((f) => {
      setFolder(f)
      if (f) void check()
    })
  }, [check])

  async function choose() {
    const f = await window.api.importer.chooseFolder()
    setFolder(f)
    if (f) await check()
  }

  const files = scan?.files.filter((f) => showDone || f.status !== 'already_imported') ?? []
  const hidden = (scan?.files.length ?? 0) - files.length

  return (
    <section className="card import-folder" aria-label="Import folder">
      <div className="card-header">
        <h3>
          <FolderSync size={17} aria-hidden="true" /> Import folder
        </h3>
        <div className="page-actions">
          {folder && (
            <>
              <button type="button" className="small" onClick={() => void check()}>
                <RefreshCw size={14} />
                Check folder
              </button>
              <ActionMenu
                label="Folder actions"
                actions={[
                  {
                    label: 'Change folder...',
                    icon: <FolderOpen size={14} />,
                    onSelect: () => void choose(),
                  },
                  {
                    label: 'Stop using folder',
                    icon: <X size={14} />,
                    danger: true,
                    onSelect: () =>
                      void window.api.importer.clearFolder().then(() => {
                        setFolder('')
                        setScan(null)
                      }),
                  },
                ]}
              />
            </>
          )}
          {!folder && (
            <button type="button" className="small" onClick={() => void choose()}>
              <FolderOpen size={14} />
              Choose folder...
            </button>
          )}
        </div>
      </div>
      <p className="muted folder-path">
        {folder ? (
          <>
            Bank files in <code>{folder}</code> are listed here. Files are never moved or deleted.
          </>
        ) : (
          'Pick the folder your bank files are saved in to see new ones here.'
        )}
      </p>
      {scan && !scan.exists && <p className="error">That folder is missing or unreadable.</p>}
      {scan?.exists && files.length === 0 && <p className="subtle">No new files.</p>}
      {files.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>Modified</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.name}>
                <td>
                  <span className="txn-cell">
                    <FileText size={16} className="icon-inline muted" />
                    {f.name}
                  </span>
                </td>
                <td className="nowrap">{f.modifiedAt.slice(0, 10)}</td>
                <td>
                  <span className={`pill ${TONE[f.status]}`}>{LABEL[f.status]}</span>
                  {f.profileName && <span className="subtle"> {f.profileName}</span>}
                  {f.reason && <span className="subtle"> {f.reason}</span>}
                </td>
                <td className="actions" style={{ textAlign: 'right' }}>
                  {f.status !== 'unreadable' && (
                    <button
                      type="button"
                      className={f.status === 'already_imported' ? 'small' : 'small primary'}
                      onClick={() => onOpen(f.name)}
                    >
                      {f.status === 'needs_mapping' ? 'Map and review' : 'Review'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {scan?.exists && (hidden > 0 || showDone) && (
        <label className="check folder-show-done">
          <input
            type="checkbox"
            checked={showDone}
            onChange={(e) => setShowDone(e.target.checked)}
          />
          Show already imported files
        </label>
      )}
    </section>
  )
}
