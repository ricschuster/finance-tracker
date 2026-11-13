import { useState } from 'react'
import type { MintInspection, MintPreview } from '../../core/import/handlers'
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
                name: name || 'Mint account',
                type: 'checking',
              })
      }
      setMap(accountMap)
      setChoice(accountMap)
      setPreview(await window.api.importer.previewMint({ text: file.text, accountMap }))
      setError(null)
    } catch (e) {
      fail(e)
    }
  }

  async function doImport() {
    const ok = await run(async () => {
      const res = await window.api.importer.commitMint({
        text: file.text,
        accountMap: map,
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
      <div>
        <p>Imported. {done}. Use Import history to undo a batch per account.</p>
        <button type="button" onClick={onFinished}>
          Done
        </button>
      </div>
    )
  }

  return (
    <div>
      <p>
        <strong>{file.name}</strong> is a Mint export with {inspection.count} rows across{' '}
        {inspection.accountNames.length} accounts.
      </p>
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
                <th>Mint account</th>
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
          <p className="muted">
            New accounts are created as chequing; change the type later. Categories are matched by
            name.
          </p>
          <p>
            <button type="button" onClick={onBack}>
              Back
            </button>{' '}
            <button type="button" onClick={() => void doPreview()}>
              Preview
            </button>
          </p>
        </>
      )}
      {preview && (
        <>
          {preview.unknownCategories.length > 0 && (
            <div className="error" role="alert">
              Categories we do not have, so those rows go to Uncategorized:{' '}
              {preview.unknownCategories.join(', ')}
            </div>
          )}
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
                  <td className="num">{formatCents(a.preview.summary.inflow)}</td>
                  <td className="num">{formatCents(a.preview.summary.outflow)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.accounts
            .flatMap((a) => a.preview.warnings)
            .map((w) => (
              <div className="error" role="alert" key={w}>
                {w}
              </div>
            ))}
          <p>
            <button type="button" onClick={() => setPreview(null)}>
              Back
            </button>{' '}
            <button type="button" onClick={() => void doImport()}>
              Import
            </button>
          </p>
        </>
      )}
    </div>
  )
}
