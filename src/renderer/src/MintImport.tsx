import { CheckCircle2, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Category } from '../../core/ledger/categories'
import type { MintInspection, MintPreview } from '../../core/import/handlers'
import { guessAccountType } from '../../core/import/accountType'
import { formatCents } from '../../core/money'
import type { LedgerState } from './useLedger'

const CREATE = -1

/** Mint files cover many accounts, so each Mint account is mapped to a ledger account first. */
export function MintImport({
  file,
  inspection,
  accounts,
  run,
  onBack,
  onFinished,
}: Pick<LedgerState, 'accounts' | 'run'> & {
  file: { name: string; text: string }
  inspection: MintInspection
  onBack: () => void
  onFinished: () => void
}) {
  const [categories, setCategories] = useState<Category[]>([])
  useEffect(() => {
    void window.api.ledger.listCategories().then(setCategories)
  }, [])

  // Default each Mint account to a ledger account with the same name, otherwise "create".
  const [choice, setChoice] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      inspection.accountNames.map((n) => [
        n,
        accounts.find((a) => a.name.toLowerCase() === n.toLowerCase())?.id ?? CREATE,
      ]),
    ),
  )
  const [preview, setPreview] = useState<MintPreview | null>(null)
  const [map, setMap] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [replace, setReplace] = useState(false)

  const fail = (e: unknown) =>
    setError(
      (e instanceof Error ? e.message : String(e)).replace(
        /^Error invoking remote method '[^']+': (Error: )?/,
        '',
      ),
    )

  /** Create the accounts the user asked for, then plan against the resulting mapping. */
  async function doPreview() {
    try {
      const accountMap: Record<string, number> = {}
      for (const [name, id] of Object.entries(choice)) {
        accountMap[name] =
          id !== CREATE
            ? id
            : await window.api.ledger.createAccount({
                name: name || `${inspection.source} account`,
                type: guessAccountType(name),
              })
      }
      setMap(accountMap)
      setChoice(accountMap)
      setPreview(
        await window.api.importer.previewMint({
          text: file.text,
          accountMap,
          replaceCategories: replace,
        }),
      )
      setError(null)
    } catch (e) {
      fail(e)
    }
  }

  async function mapCategory(name: string, categoryId: number) {
    if (categoryId === 0) return
    try {
      await window.api.importer.setCategoryAlias(name, categoryId)
      setPreview(
        await window.api.importer.previewMint({
          text: file.text,
          accountMap: map,
          replaceCategories: replace,
        }),
      )
    } catch (e) {
      fail(e)
    }
  }

  async function doImport() {
    const ok = await run(async () => {
      const res = await window.api.importer.commitMint({
        text: file.text,
        accountMap: map,
        replaceCategories: replace,
        sourceName: file.name,
      })
      setDone(
        res
          .map((r) => `${r.mintName || '(unnamed)'}: ${r.added} new, ${r.merged} merged`)
          .join('; '),
      )
    })
    if (!ok) setError('Import failed; nothing was saved.')
  }

  if (done !== null) {
    return (
      <div className="card import-done">
        <span className="done-icon" aria-hidden="true">
          <CheckCircle2 size={24} />
        </span>
        <h3>Import complete</h3>
        <p className="muted">Imported. {done}. Use Import history to undo a batch per account.</p>
        <button type="button" className="primary" onClick={onFinished}>
          Done
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="card">
        <div className="file-chip">
          <FileText size={18} />
          <div className="grow">
            <strong>{file.name}</strong>
            <span className="subtle">
              {inspection.source} export with {inspection.count} rows across{' '}
              {inspection.accountNames.length} accounts
            </span>
          </div>
          <button type="button" className="ghost small" onClick={onBack}>
            Choose another
          </button>
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {!preview && (
          <>
            <table>
              <thead>
                <tr>
                  <th>{inspection.source} account</th>
                  <th>Import into</th>
                </tr>
              </thead>
              <tbody>
                {inspection.accountNames.map((n) => (
                  <tr key={n}>
                    <td>{n || '(no name)'}</td>
                    <td>
                      <select
                        aria-label={`Account for ${n}`}
                        value={choice[n]}
                        onChange={(e) => setChoice((c) => ({ ...c, [n]: Number(e.target.value) }))}
                      >
                        <option value={CREATE}>Create a new account</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <label className="check">
              <input
                type="checkbox"
                checked={replace}
                onChange={(e) => setReplace(e.target.checked)}
              />
              Setup import: replace my categories with the ones in this file
            </label>
            <p className="subtle mint-note">
              Accounts you do not already have are created with a guessed type; change it later.
              Categories are matched by name, and the ones you do not have are created.
              {inspection.source === 'Wealthsimple' &&
                ' Rows in a currency other than CAD are skipped.'}
            </p>
            <div className="wizard-footer">
              <button type="button" onClick={onBack}>
                Back
              </button>
              <button type="button" className="primary" onClick={() => void doPreview()}>
                Preview
              </button>
            </div>
          </>
        )}
        {preview && (
          <>
            {replace && (
              <div className="notice" role="status">
                {preview.removedCategories.length === 0
                  ? 'No categories will be removed.'
                  : `Removed on import (unused): ${preview.removedCategories.join(', ')}.`}{' '}
                Categories that have transactions, rules or budgets are always kept.
              </div>
            )}
            {preview.unknownCategories.length > 0 && (
              <div className="notice mint-unknown" role="alert">
                <p>
                  Categories we do not have. They are created on import unless you map them to one
                  of yours (remembered for later imports):
                </p>
                <div className="map-grid">
                  {preview.unknownCategories.map((name) => (
                    <label key={name} className="field">
                      {name}
                      <select
                        aria-label={`Map ${name} to`}
                        value={0}
                        onChange={(e) => void mapCategory(name, Number(e.target.value))}
                      >
                        <option value={0}>Create as a new category</option>
                        {categories
                          .filter((c) => !c.isSystem)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th className="num">New</th>
                    <th className="num">Already imported</th>
                    <th className="num">Possible matches (merged)</th>
                    <th className="num">Errors</th>
                    <th className="num">Money in</th>
                    <th className="num">Money out</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.accounts.map((a) => (
                    <tr key={a.mintName}>
                      <td>{a.mintName || '(no name)'}</td>
                      <td className="num">{a.preview.summary.counts.new}</td>
                      <td className="num">{a.preview.summary.counts.duplicate}</td>
                      <td className="num">{a.preview.summary.counts.possible}</td>
                      <td className="num">{a.preview.errors.length}</td>
                      <td className="num pos">{formatCents(a.preview.summary.inflow)}</td>
                      <td className="num">{formatCents(a.preview.summary.outflow)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.accounts
              .flatMap((a) => a.preview.warnings)
              .map((w) => (
                <div className="error" role="alert" key={w}>
                  {w}
                </div>
              ))}
            <div className="wizard-footer">
              <button type="button" onClick={() => setPreview(null)}>
                Back
              </button>
              <button type="button" className="primary" onClick={() => void doImport()}>
                Import
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
