import { ChevronRight, History, List, Undo2 } from 'lucide-react'
import { Fragment, useCallback, useEffect, useState } from 'react'
import type { BatchRow, BatchSummary } from '../../core/import/history'
import { formatCents } from '../../core/money'
import { confirmDeleteEdited } from './ImportWizard'
import type { LedgerState } from './useLedger'
import { ActionMenu, Empty, useConfirm } from './ui'

/** SQLite datetime('now') is UTC without a zone: "YYYY-MM-DD HH:MM:SS". */
const when = (iso: string) => {
  const d = new Date(
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(iso) ? `${iso.replace(' ', 'T')}Z` : iso,
  )
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('en-CA', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
}

export function ImportHistory({ run }: Pick<LedgerState, 'run'>) {
  const [batches, setBatches] = useState<BatchSummary[]>([])
  const [open, setOpen] = useState<number | null>(null)
  const [rows, setRows] = useState<BatchRow[]>([])
  const confirm = useConfirm()

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
    const ok = await confirm(
      `This removes ${p.added} row${p.added === 1 ? '' : 's'} and reverts ${p.merged} merge${p.merged === 1 ? '' : 's'}.`,
      { title: `Undo "${b.sourceName}"?`, confirmLabel: 'Undo import', danger: true },
    )
    if (!ok) return
    const deleteEdited = p.edited > 0 && (await confirmDeleteEdited(confirm, p.edited))
    if (await run(() => window.api.importer.undoImport(b.id, { deleteEdited }))) {
      setOpen(null)
      load()
    }
  }

  return (
    <section aria-label="Import history">
      <h2>Import history</h2>
      <div className="card flush">
        {batches.length === 0 ? (
          <Empty icon={<History size={28} />} title="No imports yet">
            Files you import show up here, and each one can be undone.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="history-table">
              <thead>
                <tr>
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
                  <Fragment key={b.id}>
                    <tr className={open === b.id ? 'open' : undefined}>
                      <td>
                        <button
                          type="button"
                          className="link expander history-file"
                          aria-expanded={open === b.id}
                          onClick={() => void show(b.id)}
                        >
                          <ChevronRight size={15} />
                          <span>
                            {b.sourceName}
                            <span className="sub">{when(b.importedAt)}</span>
                          </span>
                        </button>
                      </td>
                      <td>{b.accountName}</td>
                      <td className="nowrap muted">
                        {b.firstDate ? `${b.firstDate} to ${b.lastDate}` : ''}
                      </td>
                      <td className="num">{b.rowsAdded}</td>
                      <td className="num">{b.rowsMerged}</td>
                      <td className="num">{b.rowsSkipped}</td>
                      <td className={b.rowsError > 0 ? 'num neg' : 'num'}>{b.rowsError}</td>
                      <td className="actions">
                        <ActionMenu
                          label={`Actions for import ${b.sourceName}`}
                          actions={[
                            {
                              label: open === b.id ? 'Hide rows' : 'Show rows',
                              icon: <List size={14} />,
                              onSelect: () => void show(b.id),
                            },
                            {
                              label: 'Undo import',
                              icon: <Undo2 size={14} />,
                              danger: true,
                              separatorBefore: true,
                              onSelect: () => void undo(b),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                    {open === b.id && (
                      <tr className="history-rows">
                        <td colSpan={8}>
                          <table>
                            <tbody>
                              {rows.map((r) => (
                                <tr key={r.id}>
                                  <td className="nowrap">{r.date}</td>
                                  <td>{r.rawDescription}</td>
                                  <td>{r.edited && <span className="pill">Edited</span>}</td>
                                  <td className={`num ${r.amount < 0 ? '' : 'pos'}`}>
                                    {formatCents(r.amount)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {rows.length === 0 && (
                            <p className="subtle">No rows remain from this import.</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
