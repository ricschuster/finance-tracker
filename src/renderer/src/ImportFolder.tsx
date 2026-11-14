import { useCallback, useEffect, useState } from 'react'
import type { FolderFileStatus, FolderScan } from '../../core/import/folder'

const LABEL: Record<FolderFileStatus, string> = {
  ready: 'Ready to review',
  needs_mapping: 'Needs mapping',
  already_imported: 'Already imported',
  unreadable: 'Cannot read',
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
    <section className="import-folder">
      <h3>Import folder</h3>
      <p className="muted">
        {folder
          ? `Bank files in ${folder} are listed here. Files are never moved or deleted.`
          : 'Pick the folder your bank files are saved in to see new ones here.'}
      </p>
      <button type="button" onClick={() => void choose()}>
        {folder ? 'Change folder...' : 'Choose folder...'}
      </button>{' '}
      {folder && (
        <>
          <button type="button" onClick={() => void check()}>
            Check folder
          </button>{' '}
          <button
            type="button"
            onClick={() =>
              void window.api.importer.clearFolder().then(() => {
                setFolder('')
                setScan(null)
              })
            }
          >
            Stop using folder
          </button>
        </>
      )}
      {scan && !scan.exists && <p className="error">That folder is missing or unreadable.</p>}
      {scan?.exists && files.length === 0 && <p className="muted">No new files.</p>}
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
                <td>{f.name}</td>
                <td className="nowrap">{f.modifiedAt.slice(0, 10)}</td>
                <td>
                  {LABEL[f.status]}
                  {f.profileName && <span className="muted"> ({f.profileName})</span>}
                  {f.reason && <span className="muted"> ({f.reason})</span>}
                </td>
                <td>
                  {f.status !== 'unreadable' && (
                    <button type="button" onClick={() => onOpen(f.name)}>
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
        <label>
          <input
            type="checkbox"
            checked={showDone}
            onChange={(e) => setShowDone(e.target.checked)}
          />{' '}
          Show already imported files
        </label>
      )}
    </section>
  )
}
