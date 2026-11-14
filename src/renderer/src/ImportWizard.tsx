import { Check, CheckCircle2, FileText, FolderOpen, Undo2, Upload } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ImportFolder } from './ImportFolder'
import type { AccountWithBalance } from '../../core/ledger/accounts'
import { guessDateFormat, type DateFormat } from '../../core/import/dates'
import type {
  ChoiceOverride,
  CsvInspection,
  MintInspection,
  ImportPreview,
  PreviewItem,
} from '../../core/import/handlers'
import type { ForeignPolicy, MappingProfile } from '../../core/import/mapping'
import type { PossibleChoice } from '../../core/import/match'
import { PRESETS } from '../../core/import/presets'
import { formatCents } from '../../core/money'
import { MintImport } from './MintImport'
import { Empty, useConfirm } from './ui'
import type { LedgerState } from './useLedger'

const DATE_FORMATS: DateFormat[] = [
  'YYYY-MM-DD',
  'YYYY/MM/DD',
  'MM/DD/YYYY',
  'DD/MM/YYYY',
  'MM-DD-YYYY',
  'DD-MM-YYYY',
  'DD-Mon-YYYY',
  'YYYYMMDD',
]

type AmountMode = 'signed' | 'debitCredit' | 'directional'

interface MapState {
  hasHeader: boolean
  headerRow: number
  date: number
  dateFormat: DateFormat
  amountMode: AmountMode
  amount: number
  debit: number
  credit: number
  direction: number
  debitValues: string
  foreign: number
  desc: number[]
  memo: number
  flipSign: boolean
  decimal: '.' | ','
}

const NONE = -1

function initialMap(info: CsvInspection): MapState {
  const header = info.sample[info.headerRowGuess] ?? []
  const find = (re: RegExp) => header.findIndex((h) => re.test(h))
  const hasHeader = header.some((h) => /[a-z]/i.test(h))
  const pick = (re: RegExp, fallback: number) => {
    const i = hasHeader ? find(re) : NONE
    return i >= 0 ? i : fallback
  }
  const dateCol = pick(/date/i, 0)
  const guess = guessDateFormat(
    info.sample.slice(info.headerRowGuess + (hasHeader ? 1 : 0)).map((r) => r[dateCol] ?? ''),
  )
  return {
    hasHeader,
    headerRow: info.headerRowGuess,
    date: dateCol,
    dateFormat: guess.candidates[0] ?? 'YYYY-MM-DD',
    amountMode: 'signed',
    amount: pick(/amount|cad/i, 2),
    debit: pick(/debit|withdraw/i, 2),
    credit: pick(/credit|deposit/i, 3),
    direction: pick(/type|direction/i, 3),
    debitValues: 'debit, DR',
    foreign: pick(/usd/i, NONE),
    desc: [pick(/desc|payee|memo|name/i, 1)],
    memo: NONE,
    flipSign: false,
    decimal: '.',
  }
}

function columnName(info: CsvInspection, m: MapState, i: number): string {
  const h = m.hasHeader ? info.sample[m.headerRow]?.[i]?.trim() : ''
  return h ? `${i + 1}: ${h}` : `Column ${i + 1}`
}

/** Header names are stable across files with extra columns; indices are the fallback. */
function toProfile(info: CsvInspection, m: MapState): MappingProfile {
  const header = info.sample[m.headerRow] ?? []
  const names = header.map((h) => h.trim())
  const unique = (i: number) => names[i] !== '' && names.filter((n) => n === names[i]).length === 1
  const ref = (i: number) => (m.hasHeader && unique(i) ? names[i]! : i)
  const foreign = m.foreign === NONE ? {} : { foreignColumn: ref(m.foreign) }
  const amount: MappingProfile['amount'] =
    m.amountMode === 'signed'
      ? { mode: 'signed', column: ref(m.amount), ...foreign }
      : m.amountMode === 'debitCredit'
        ? { mode: 'debitCredit', debit: ref(m.debit), credit: ref(m.credit), ...foreign }
        : {
            mode: 'directional',
            column: ref(m.amount),
            direction: ref(m.direction),
            debitValues: m.debitValues
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          }
  return {
    hasHeader: m.hasHeader,
    headerRow: m.headerRow,
    date: { column: ref(m.date), format: m.dateFormat },
    amount,
    description: m.desc.map(ref),
    ...(m.memo !== NONE && { memo: ref(m.memo) }),
    flipSign: m.flipSign,
    decimalSeparator: m.decimal,
  }
}

/** Reverse of toProfile for a saved profile: resolve refs to column indices in this file. */
function fromProfile(info: CsvInspection, p: MappingProfile): MapState {
  const header = (info.sample[p.headerRow] ?? []).map((h) => h.trim().toLowerCase())
  const idx = (r: string | number | undefined): number =>
    r === undefined ? NONE : typeof r === 'number' ? r : header.indexOf(r.trim().toLowerCase())
  const a = p.amount
  return {
    hasHeader: p.hasHeader,
    headerRow: p.headerRow,
    date: idx(p.date.column),
    dateFormat: p.date.format,
    amountMode: a.mode,
    amount: a.mode === 'debitCredit' ? 2 : idx(a.column),
    debit: a.mode === 'debitCredit' ? idx(a.debit) : 2,
    credit: a.mode === 'debitCredit' ? idx(a.credit) : 3,
    direction: a.mode === 'directional' ? idx(a.direction) : 3,
    debitValues: a.mode === 'directional' ? a.debitValues.join(', ') : 'debit, DR',
    foreign: a.mode !== 'directional' ? idx(a.foreignColumn) : NONE,
    desc: p.description.map(idx),
    memo: idx(p.memo),
    flipSign: p.flipSign ?? false,
    decimal: p.decimalSeparator ?? '.',
  }
}

type Step = 'file' | 'map' | 'preview' | 'done'

export function ImportWizard({
  accounts,
  run,
  onFinished,
}: Pick<LedgerState, 'accounts' | 'run'> & { onFinished: () => void }) {
  const [step, setStep] = useState<Step>('file')
  const [file, setFile] = useState<{ name: string; text: string } | null>(null)
  const [info, setInfo] = useState<CsvInspection | null>(null)
  const [accountId, setAccountId] = useState<number | null>(null)
  const [format, setFormat] = useState<'csv' | 'ofx' | 'mint'>('csv')
  const [mint, setMint] = useState<MintInspection | null>(null)
  const [map, setMap] = useState<MapState | null>(null)
  const [profileId, setProfileId] = useState<number | null>(null)
  const [saveName, setSaveName] = useState('')
  const [foreign, setForeign] = useState<ForeignPolicy>('skip')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [overrides, setOverrides] = useState<Record<number, ChoiceOverride>>({})
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    batchId: number
    added: number
    merged: number
    skipped: number
  } | null>(null)
  const [undone, setUndone] = useState(false)
  const [dragging, setDragging] = useState(false)
  const confirm = useConfirm()

  const account = accounts.find((a) => a.id === (accountId ?? accounts[0]?.id))
  const profile = useMemo(() => (info && map ? toProfile(info, map) : null), [info, map])

  const fail = (e: unknown) =>
    setError(
      (e instanceof Error ? e.message : String(e)).replace(
        /^Error invoking remote method '[^']+': (Error: )?/,
        '',
      ),
    )

  const loadPreview = (p: MappingProfile | null, pol: ForeignPolicy) => {
    if (!file || !account) return
    window.api.importer
      .previewImport({
        text: file.text,
        format,
        ...(p && { profile: p }),
        accountId: account.id,
        foreign: pol,
      })
      .then((r) => {
        setPreview(r)
        setError(null)
      })
      .catch(fail)
  }

  // Refresh the preview whenever the mapping, account or foreign policy changes.
  useEffect(() => {
    if (step === 'preview' && (profile || format === 'ofx')) loadPreview(profile, foreign)
  }, [step, profile, foreign, account?.id])

  async function chooseFile() {
    try {
      const f = await window.api.importer.pickFile()
      if (f) await openFile(f)
    } catch (e) {
      fail(e)
    }
  }

  async function openFile(f: { name: string; text: string }) {
    try {
      const ofx = await window.api.importer.inspectOfx(f.text)
      if (ofx) {
        setFile(f)
        setFormat('ofx')
        setInfo(null)
        setMap(null)
        setProfileId(null)
        setOverrides({})
        setResult(null)
        setUndone(false)
        setError(null)
        setStep('map')
        return
      }
      const mintInfo = await window.api.importer.inspectMint(f.text)
      if (mintInfo) {
        setFile(f)
        setFormat('mint')
        setMint(mintInfo)
        setError(null)
        setStep('map')
        return
      }
      const i = await window.api.importer.inspectCsv(f.text)
      setFormat('csv')
      setFile(f)
      setInfo(i)
      setOverrides({})
      setResult(null)
      setUndone(false)
      if (i.matchedProfile) {
        setMap(fromProfile(i, i.matchedProfile.config))
        setProfileId(i.matchedProfile.id)
        if (i.matchedProfile.accountId) setAccountId(i.matchedProfile.accountId)
        setStep('map')
      } else {
        setMap(initialMap(i))
        setProfileId(null)
        setStep('map')
      }
      setError(null)
    } catch (e) {
      fail(e)
    }
  }

  const set = <K extends keyof MapState>(k: K, v: MapState[K]) =>
    setMap((m) => (m ? { ...m, [k]: v } : m))

  const choiceOf = (it: PreviewItem): PossibleChoice =>
    overrides[it.candidate.line]?.choice ?? it.choice

  function setChoice(it: PreviewItem, choice: PossibleChoice, linkTransfer?: boolean) {
    setOverrides((o) => ({
      ...o,
      [it.candidate.line]: { line: it.candidate.line, choice, linkTransfer },
    }))
  }

  function bulk(choice: PossibleChoice) {
    if (!preview) return
    setOverrides((o) => {
      const next = { ...o }
      for (const it of preview.items)
        if (it.outcome === 'possible') next[it.candidate.line] = { line: it.candidate.line, choice }
      return next
    })
  }

  async function doImport() {
    if (!file || (!profile && format !== 'ofx') || !account) return
    let pid = profileId
    const ok = await run(async () => {
      if (saveName.trim() && profile) {
        pid = await window.api.importer.saveImportProfile({
          id: profileId ?? undefined,
          name: saveName.trim(),
          accountId: account.id,
          headerFingerprint: info?.fingerprint ?? null,
          config: profile,
        })
      }
      const r = await window.api.importer.commitImport({
        text: file.text,
        format,
        ...(profile && { profile }),
        accountId: account.id,
        foreign,
        sourceName: file.name,
        profileId: pid,
        overrides: Object.values(overrides),
      })
      setResult(r)
    })
    if (ok) setStep('done')
  }

  async function undo() {
    if (!result) return
    const p = await window.api.importer.previewUndoImport(result.batchId)
    const deleteEdited = p.edited > 0 && (await confirmDeleteEdited(confirm, p.edited))
    if (await run(() => window.api.importer.undoImport(result.batchId, { deleteEdited })))
      setUndone(true)
  }

  function reset() {
    setStep('file')
    setFile(null)
    setInfo(null)
    setMap(null)
    setPreview(null)
    setOverrides({})
    setResult(null)
    setSaveName('')
    setFormat('csv')
    setMint(null)
    setForeign('skip')
    setError(null)
  }

  if (accounts.length === 0)
    return (
      <section aria-label="Import">
        <div className="card">
          <Empty icon={<Upload size={28} />} title="Add an account first">
            Imported transactions go into one of your accounts. Use the + next to Accounts in the
            sidebar.
          </Empty>
        </div>
      </section>
    )

  const cols = info?.sample.reduce((n, r) => Math.max(n, r.length), 0) ?? 0
  const colOptions = (allowNone = false) => (
    <>
      {allowNone && <option value={NONE}>(none)</option>}
      {Array.from({ length: cols }, (_, i) => (
        <option key={i} value={i}>
          {info && map ? columnName(info, map, i) : i + 1}
        </option>
      ))}
    </>
  )
  const num = (e: React.ChangeEvent<HTMLSelectElement>) => Number(e.target.value)
  const accountSelect = (
    <label className="field">
      Import into
      <select value={account?.id} onChange={(e) => setAccountId(num(e))}>
        {accounts.map((a: AccountWithBalance) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </label>
  )
  const fileCard = (extra?: React.ReactNode) => (
    <div className="file-chip">
      <FileText size={18} />
      <div className="grow">
        <strong>{file?.name}</strong>
        <span className="subtle">{extra}</span>
      </div>
      <button type="button" className="ghost small" onClick={reset}>
        Choose another
      </button>
    </div>
  )
  /** Columns the mapping uses, highlighted in the sample. */
  const used = new Set(
    map
      ? [
          map.date,
          ...(map.amountMode === 'debitCredit' ? [map.debit, map.credit] : [map.amount]),
          ...(map.amountMode === 'directional' ? [map.direction] : []),
          ...map.desc,
          map.memo,
        ].filter((i) => i !== NONE)
      : [],
  )
  const counts = preview?.summary.counts

  return (
    <section aria-label="Import">
      <h2>Import transactions</h2>
      {format !== 'mint' && <Stepper step={step} ofx={format === 'ofx'} />}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      {step === 'file' && (
        <>
          <div
            className={dragging ? 'drop-zone dragging' : 'drop-zone'}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const f = e.dataTransfer.files[0]
              if (f) void f.text().then((text) => openFile({ name: f.name, text }), fail)
            }}
          >
            <span className="drop-icon" aria-hidden="true">
              <Upload size={22} />
            </span>
            <strong>Drop a bank file here, or choose one</strong>
            <span className="muted">
              CSV, OFX, QFX, or a Mint, Monarch or Wealthsimple export. Nothing is saved until you
              confirm.
            </span>
            <button type="button" className="primary" onClick={() => void chooseFile()}>
              <FolderOpen size={16} />
              Choose file...
            </button>
          </div>
          <ImportFolder
            onOpen={(name) =>
              void window.api.importer.readFolderFile(name).then(openFile).catch(fail)
            }
          />
        </>
      )}

      {step === 'map' && format === 'mint' && mint && file && (
        <MintImport
          file={file}
          inspection={mint}
          accounts={accounts}
          run={run}
          onBack={reset}
          onFinished={onFinished}
        />
      )}

      {step === 'map' && format === 'ofx' && (
        <div className="card">
          {fileCard('OFX/QFX file, so no column mapping is needed')}
          <div className="map-grid">{accountSelect}</div>
          <div className="wizard-footer">
            <button type="button" onClick={reset}>
              Back
            </button>
            <button type="button" className="primary" onClick={() => setStep('preview')}>
              Preview
            </button>
          </div>
        </div>
      )}

      {step === 'map' && format === 'csv' && info && map && (
        <>
          <div className="card">
            {fileCard(
              <>
                {info.totalRows} lines
                {info.matchedProfile && (
                  <span className="pill pos">Saved profile: {info.matchedProfile.name}</span>
                )}
              </>,
            )}
            <div className="map-grid">
              {accountSelect}
              <label className="field">
                Start from a preset
                <select
                  value=""
                  onChange={(e) => {
                    const p = PRESETS.find((x) => x.id === e.target.value)
                    if (p) setMap(fromProfile(info, p.config))
                  }}
                >
                  <option value="">(choose)</option>
                  {PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.verified ? '' : ' (unverified layout)'}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                {map.hasHeader ? 'Header row' : 'First data row'}
                <select value={map.headerRow} onChange={(e) => set('headerRow', num(e))}>
                  {info.sample.slice(0, 15).map((_, i) => (
                    <option key={i} value={i}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={map.hasHeader}
                  onChange={(e) => set('hasHeader', e.target.checked)}
                />
                First row is a header
              </label>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3>Columns</h3>
              <span className="subtle">Tell us which column holds what</span>
            </div>
            <div className="map-grid">
              <label className="field">
                Date column
                <select value={map.date} onChange={(e) => set('date', num(e))}>
                  {colOptions()}
                </select>
              </label>
              <label className="field">
                Date format
                <select
                  value={map.dateFormat}
                  onChange={(e) => set('dateFormat', e.target.value as DateFormat)}
                >
                  {DATE_FORMATS.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Description column
                <select
                  value={map.desc[0] ?? 0}
                  onChange={(e) => set('desc', [num(e), ...map.desc.slice(1)])}
                >
                  {colOptions()}
                </select>
              </label>
              <label className="field">
                Second description column
                <select
                  value={map.desc[1] ?? NONE}
                  onChange={(e) =>
                    set('desc', num(e) === NONE ? map.desc.slice(0, 1) : [map.desc[0] ?? 0, num(e)])
                  }
                >
                  {colOptions(true)}
                </select>
              </label>
              <label className="field">
                Memo column
                <select value={map.memo} onChange={(e) => set('memo', num(e))}>
                  {colOptions(true)}
                </select>
              </label>
            </div>
            <h4 className="map-subhead">Amounts</h4>
            <div className="map-grid">
              <label className="field">
                Amounts are
                <select
                  value={map.amountMode}
                  onChange={(e) => set('amountMode', e.target.value as AmountMode)}
                >
                  <option value="signed">One signed column</option>
                  <option value="debitCredit">Separate debit and credit columns</option>
                  <option value="directional">Unsigned plus a direction column</option>
                </select>
              </label>
              {map.amountMode !== 'debitCredit' && (
                <label className="field">
                  Amount column
                  <select value={map.amount} onChange={(e) => set('amount', num(e))}>
                    {colOptions()}
                  </select>
                </label>
              )}
              {map.amountMode === 'debitCredit' && (
                <>
                  <label className="field">
                    Debit column
                    <select value={map.debit} onChange={(e) => set('debit', num(e))}>
                      {colOptions()}
                    </select>
                  </label>
                  <label className="field">
                    Credit column
                    <select value={map.credit} onChange={(e) => set('credit', num(e))}>
                      {colOptions()}
                    </select>
                  </label>
                </>
              )}
              {map.amountMode === 'directional' && (
                <>
                  <label className="field">
                    Direction column
                    <select value={map.direction} onChange={(e) => set('direction', num(e))}>
                      {colOptions()}
                    </select>
                  </label>
                  <label className="field">
                    Values meaning money out
                    <input
                      value={map.debitValues}
                      onChange={(e) => set('debitValues', e.target.value)}
                    />
                  </label>
                </>
              )}
              {map.amountMode !== 'directional' && (
                <label className="field">
                  Foreign currency column
                  <select value={map.foreign} onChange={(e) => set('foreign', num(e))}>
                    {colOptions(true)}
                  </select>
                </label>
              )}
              <label className="field">
                Decimal separator
                <select
                  value={map.decimal}
                  onChange={(e) => set('decimal', e.target.value as '.' | ',')}
                >
                  <option value=".">Dot (1,234.56)</option>
                  <option value=",">Comma (1 234,56)</option>
                </select>
              </label>
              <label className="check span-row">
                <input
                  type="checkbox"
                  checked={map.flipSign}
                  onChange={(e) => set('flipSign', e.target.checked)}
                />
                Flip sign (card exports often show purchases as positive)
              </label>
            </div>
          </div>

          <div className="card flush">
            <div className="card-header">
              <h3>First rows of the file</h3>
              <span className="subtle">Highlighted columns are used</span>
            </div>
            <div className="sample">
              <table>
                <tbody>
                  {info.sample.slice(0, 8).map((r, ri) => (
                    <tr
                      key={ri}
                      className={map.hasHeader && ri === map.headerRow ? 'sample-header' : ''}
                    >
                      {Array.from({ length: cols }, (_, ci) => (
                        <td key={ci} className={used.has(ci) ? 'used' : undefined}>
                          {r[ci]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="wizard-footer">
            <button type="button" onClick={reset}>
              Back
            </button>
            <button type="button" className="primary" onClick={() => setStep('preview')}>
              Preview
            </button>
          </div>
        </>
      )}

      {step === 'preview' && preview && account && counts && (
        <>
          <div className="card">
            {fileCard(<>Into {account.name}</>)}
            <div className="import-stats">
              <div>
                <span>New</span>
                <strong>{counts.new}</strong>
              </div>
              <div>
                <span>Already imported</span>
                <strong>{counts.duplicate}</strong>
              </div>
              <div>
                <span>Possible matches</span>
                <strong className={counts.possible > 0 ? 'warn' : undefined}>
                  {counts.possible}
                </strong>
              </div>
              <div>
                <span>Errors</span>
                <strong className={preview.errors.length > 0 ? 'neg' : undefined}>
                  {preview.errors.length}
                </strong>
              </div>
              <div>
                <span>Money in</span>
                <strong className="pos">{formatCents(preview.summary.inflow)}</strong>
              </div>
              <div>
                <span>Money out</span>
                <strong>{formatCents(preview.summary.outflow)}</strong>
              </div>
            </div>
          </div>
          {preview.warnings.map((w) => (
            <div className="error" role="alert" key={w}>
              {w}
            </div>
          ))}
          {(preview.skippedForeign.length > 0 || foreign === 'faceValue') && (
            <label className="check notice">
              <input
                type="checkbox"
                checked={foreign === 'faceValue'}
                onChange={(e) => setForeign(e.target.checked ? 'faceValue' : 'skip')}
              />
              Import foreign currency rows ({preview.skippedForeign.length} skipped) at face value,
              treating the amount as {account.name}&apos;s currency
            </label>
          )}
          <div className="card flush">
            <div className="card-header">
              <h3>Rows to import</h3>
              {counts.possible > 0 ? (
                <div className="page-actions">
                  <span className="subtle">Possible matches:</span>
                  <button type="button" className="small" onClick={() => bulk('merge')}>
                    Merge all
                  </button>
                  <button type="button" className="small" onClick={() => bulk('new')}>
                    Import all as new
                  </button>
                  <button type="button" className="small" onClick={() => bulk('skip')}>
                    Skip all
                  </button>
                </div>
              ) : (
                counts.duplicate > 0 && (
                  <span className="subtle">{counts.duplicate} already imported are hidden</span>
                )
              )}
            </div>
            <div className="table-wrap">
              <table className="import-table">
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Date</th>
                    <th>Description</th>
                    <th className="num">Amount</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.items
                    .filter((it) => it.outcome !== 'duplicate')
                    .map((it) => (
                      <tr key={it.candidate.line}>
                        <td className="subtle">{it.candidate.line}</td>
                        <td className="nowrap">{it.candidate.date}</td>
                        <td>{it.candidate.rawDescription}</td>
                        <td className={`num amount ${it.candidate.amount < 0 ? '' : 'pos'}`}>
                          {formatCents(it.candidate.amount)}
                        </td>
                        <td>
                          {it.outcome === 'new' && (
                            <div className="result-cell">
                              <span className="pill pos">New</span>
                              {it.transfer && (
                                <label className="check">
                                  <input
                                    type="checkbox"
                                    checked={
                                      overrides[it.candidate.line]?.linkTransfer ?? it.suggestLink
                                    }
                                    onChange={(e) => setChoice(it, 'new', e.target.checked)}
                                  />
                                  <span className="muted">
                                    Link as transfer with {it.transfer.accountName} (
                                    {it.transfer.date})
                                  </span>
                                </label>
                              )}
                            </div>
                          )}
                          {it.outcome === 'possible' && it.match && (
                            <div className="result-cell">
                              <span className="pill warn">Match?</span>
                              <select
                                aria-label={`Choice for line ${it.candidate.line}`}
                                value={choiceOf(it)}
                                onChange={(e) => setChoice(it, e.target.value as PossibleChoice)}
                              >
                                <option value="merge">Merge</option>
                                <option value="new">Import as new</option>
                                <option value="skip">Skip</option>
                              </select>
                              <span className="muted">
                                matches {it.match.date} &quot;
                                {it.match.payee || it.match.rawDescription || 'no description'}
                                &quot;
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {counts.new + counts.possible === 0 && (
              <Empty title="Nothing to import">
                {counts.duplicate > 0 &&
                preview.errors.length === 0 &&
                preview.skippedForeign.length === 0
                  ? 'Every row was imported before.'
                  : 'No row in this file can be imported as it stands; see the notes above.'}
              </Empty>
            )}
          </div>
          {preview.errors.length > 0 && (
            <details className="card">
              <summary>
                {preview.errors.length} rows could not be read and will not be imported
              </summary>
              <ul>
                {preview.errors.map((e) => (
                  <li key={e.line}>
                    Line {e.line}: {e.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="wizard-footer">
            <button type="button" onClick={() => setStep('map')}>
              Back
            </button>
            {format === 'csv' && (
              <label className="field save-profile">
                Save this mapping as
                <input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="optional profile name"
                />
              </label>
            )}
            <button type="button" className="primary" onClick={() => void doImport()}>
              Import
            </button>
          </div>
        </>
      )}

      {step === 'done' && result && (
        <div className="card import-done">
          <span className={undone ? 'done-icon muted' : 'done-icon'} aria-hidden="true">
            {undone ? <Undo2 size={24} /> : <CheckCircle2 size={24} />}
          </span>
          <h3>{undone ? 'Import undone' : 'Import complete'}</h3>
          <p className="muted">
            {undone
              ? 'The rows from this file were removed.'
              : `Imported ${result.added} new, merged ${result.merged}, skipped ${result.skipped}.`}
          </p>
          <div className="page-actions">
            {!undone && (
              <button type="button" onClick={() => void undo()}>
                <Undo2 size={15} />
                Undo this import
              </button>
            )}
            <button type="button" onClick={reset}>
              Import another file
            </button>
            <button type="button" className="primary" onClick={onFinished}>
              Done
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

const STEPS: { id: Step; label: string }[] = [
  { id: 'file', label: 'Choose file' },
  { id: 'map', label: 'Map columns' },
  { id: 'preview', label: 'Review' },
  { id: 'done', label: 'Done' },
]

function Stepper({ step, ofx }: { step: Step; ofx: boolean }) {
  const at = STEPS.findIndex((s) => s.id === step)
  return (
    <ol className="stepper" aria-label="Import steps">
      {STEPS.map((s, i) => (
        <li
          key={s.id}
          className={i < at ? 'done' : i === at ? 'current' : undefined}
          aria-current={i === at ? 'step' : undefined}
        >
          <span className="step-dot">{i < at ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
          {s.id === 'map' && ofx ? 'Choose account' : s.label}
        </li>
      ))}
    </ol>
  )
}

/** Asks whether rows edited since an import are deleted by its undo. False keeps them. */
export function confirmDeleteEdited(
  confirm: ReturnType<typeof useConfirm>,
  edited: number,
): Promise<boolean> {
  return confirm(
    `${edited} imported row${edited === 1 ? ' was' : 's were'} edited since. Delete ${edited === 1 ? 'it' : 'them'} too, or keep ${edited === 1 ? 'it' : 'them'}?`,
    {
      title: 'Edited rows',
      confirmLabel: 'Delete too',
      cancelLabel: 'Keep edited rows',
      danger: true,
    },
  )
}
