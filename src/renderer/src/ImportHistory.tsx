import { useCallback, useEffect, useState } from 'react'
import type { BatchRow, BatchSummary } from '../../core/import/history'
import { formatCents } from '../../core/money'
import type { LedgerState } from './useLedger'

export function ImportHistory({ run }: Pick<LedgerState, 'run'>) {
  const [batches, setBatches] = useState<BatchSummary[]>([])
  const [open, setOpen] = useState<number | null>(null)
  const [rows, setRows] = useState<BatchRow[]>([])

  const load = useCallback(() => {
    void window.api.importer.listImportBatches().then(setBatches)
  }, [])
  useEffect(load, [load])

  async function show(id: number) {
    if (open === id) return setOpen(null)
    setRows(await window.api.importer.getImportBatchRows(id))
    setOpen(id)
  }

  async function undo(b: BatchSummary) {
    const p = await window.api.importer.previewUndoImport(b.id)
    if (
      !window.confirm(
        `Undo "${b.sourceName}"? This removes ${p.added} rows and reverts ${p.merged} merges.`,
      )
    )
      return
    const deleteEdited =
      p.edited > 0 &&
      window.confirm(
        `${p.edited} imported row(s) were edited since. Delete them too? Cancel keeps them.`,
      )
    if (await run(() => window.api.importer.undoImport(b.id, { deleteEdited }))) {
      setOpen(null)
      load()
    }
  }

  return (
    <section aria-label="Import history">
      <h2>Import history</h2>
      {batches.length === 0 && <p className="muted">No imports yet.</p>}
      <table>
        <thead>
          <tr>
            <th>Imported</th>
            <th>File</th>
            <th>Account</th>
            <th>Dates</th>
            <th className="num">Added</th>
            <th className="num">Merged</th>
            <th className="num">Skipped</th>
            <th className="num">Errors</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => (
            <tr key={b.id}>
              <td>{b.importedAt}</td>
              <td>
                <button type="button" onClick={() => void show(b.id)}>
                  {b.sourceName}
                </button>
              </td>
              <td>{b.accountName}</td>
              <td>{b.firstDate ? `${b.firstDate} to ${b.lastDate}` : ''}</td>
              <td className="num">{b.rowsAdded}</td>
              <td className="num">{b.rowsMerged}</td>
              <td className="num">{b.rowsSkipped}</td>
              <td className="num">{b.rowsError}</td>
              <td>
                <button type="button" onClick={() => void undo(b)}>
                  Undo
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {open !== null && (
        <table>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.date}</td>
                <td>{r.rawDescription}</td>
                <td className={`num ${r.amount < 0 ? 'neg' : 'pos'}`}>{formatCents(r.amount)}</td>
                <td>{r.edited ? 'edited' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
