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
import { guessMapping, type MappingGuess } from '../../core/import/guess'
import { previewMapping } from '../../core/import/preview'
import { matchPresetByHeader, PRESETS } from '../../core/import/presets'
import { formatCents } from '../../core/money'
import { MintImport } from './MintImport'
import { CategorySelect } from './CategorySelect'
import { suggestPattern } from '../../core/rules/pattern'
import { Empty, useConfirm, useToast } from './ui'
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

/** Turn the guesser's proposal into editable form state. */
function fromGuess(info: CsvInspection, g: MappingGuess): MapState {
  const base = initialMap(info)
  const m: MapState = {
    ...base,
    hasHeader: g.hasHeader,
    headerRow: g.headerRow,
    decimal: g.decimal,
    desc: g.description.columns.length > 0 ? g.description.columns : base.desc,
    memo: NONE,
    foreign: NONE,
  }
  if (g.date) {
    m.date = g.date.column
    m.dateFormat = g.date.format
  }
  const a = g.amount
  if (a) {
    m.amountMode = a.mode
    if (a.mode === 'debitCredit') {
      m.debit = a.debit
      m.credit = a.credit
    } else {
      m.amount = a.column
    }
    if (a.mode === 'directional') {
      m.direction = a.direction
      m.debitValues = a.debitValues.join(', ')
    } else if (a.foreign !== null) m.foreign = a.foreign
  }
  return m
}

type MapSource = 'saved' | 'preset' | 'guess' | 'edited'

/** Confidence as a word and a pill colour. */
function confidenceLabel(c: number): { text: string; cls: string } {
  if (c >= 0.75) return { text: 'high confidence', cls: 'pill pos' }
  if (c >= 0.5) return { text: 'medium confidence', cls: 'pill warn' }
  return { text: 'low confidence', cls: 'pill neg' }
}

type Step = 'file' | 'map' | 'preview' | 'done'

/** A dropped file as text; spreadsheets are converted to CSV in the main process. */
async function readDropped(f: File): Promise<{ name: string; text: string }> {
  if (f.name.toLowerCase().endsWith('.xlsx'))
    return window.api.importer.convertXlsx(f.name, new Uint8Array(await f.arrayBuffer()))
  return { name: f.name, text: await f.text() }
}

export function ImportWizard({
  accounts,
  categories,
  run,
  onFinished,
}: Pick<LedgerState, 'accounts' | 'categories' | 'run'> & { onFinished: () => void }) {
  const [step, setStep] = useState<Step>('file')
  const [file, setFile] = useState<{ name: string; text: string } | null>(null)
  const [info, setInfo] = useState<CsvInspection | null>(null)
  const [accountId, setAccountId] = useState<number | null>(null)
  const [format, setFormat] = useState<'csv' | 'ofx' | 'mint'>('csv')
  const [mint, setMint] = useState<MintInspection | null>(null)
  const [map, setMap] = useState<MapState | null>(null)
  const [profileId, setProfileId] = useState<number | null>(null)
  const [guess, setGuess] = useState<MappingGuess | null>(null)
  const [source, setSource] = useState<MapSource>('guess')
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
  const toast = useToast()

  // With several accounts the user must choose, unless the profile or file name says which.
  const [accountWhy, setAccountWhy] = useState<string | null>(null)
  const account =
    accounts.find((a) => a.id === accountId) ?? (accounts.length === 1 ? accounts[0] : undefined)
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

  /** Preselect an account when the file name mentions exactly one account name. */
  function guessAccountFromName(fileName: string) {
    const lower = fileName.toLowerCase()
    const hits = accounts.filter(
      (a) => a.name.trim().length >= 3 && lower.includes(a.name.trim().toLowerCase()),
    )
    if (hits.length === 1) {
      setAccountId(hits[0]!.id)
      setAccountWhy(`Preselected because the file name mentions "${hits[0]!.name}".`)
    } else {
      setAccountId(null)
      setAccountWhy(null)
    }
  }

  async function openFile(f: { name: string; text: string }) {
    try {
      const ofx = await window.api.importer.inspectOfx(f.text)
      if (ofx) {
        setFile(f)
        setFormat('ofx')
        guessAccountFromName(f.name)
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
        setSource('saved')
        setGuess(null)
        setProfileId(i.matchedProfile.id)
        const linked = accounts.find((a) => a.id === i.matchedProfile?.accountId)
        if (linked) {
          setAccountId(linked.id)
          setAccountWhy(`Preselected because the saved profile "${i.matchedProfile.name}" uses it.`)
        } else guessAccountFromName(f.name)
        setStep('map')
      } else {
        // A known bank header wins over the heuristic guess.
        const preset = matchPresetByHeader(i.sample[i.headerRowGuess] ?? [])
        const g = guessMapping(i.sample)
        setGuess(g)
        if (preset) {
          setMap(fromProfile(i, preset.config))
          setSource('preset')
        } else {
          setMap(fromGuess(i, g))
          setSource('guess')
        }
        setProfileId(null)
        guessAccountFromName(f.name)
        setStep('map')
      }
      setError(null)
    } catch (e) {
      fail(e)
    }
  }

  const set = <K extends keyof MapState>(k: K, v: MapState[K]) => {
    setMap((m) => (m ? { ...m, [k]: v } : m))
    setSource((s) => (s === 'guess' ? 'edited' : s))
  }

  /** The first rows as they would be read with the current mapping. */
  const livePreview = useMemo(
    () => (info && profile ? previewMapping(info.sample, profile, { limit: 10 }) : null),
    [info, profile],
  )

  const choiceOf = (it: PreviewItem): PossibleChoice =>
    overrides[it.candidate.line]?.choice ?? it.choice

  function setChoice(it: PreviewItem, choice: PossibleChoice, linkTransfer?: boolean) {
    setOverrides((o) => ({
      ...o,
      [it.candidate.line]: {
        ...o[it.candidate.line],
        line: it.candidate.line,
        choice,
        linkTransfer,
      },
    }))
  }

  /** After a pick that differs from the guess, offer to save a rule so next time needs no pick. */
  function offerRule(it: PreviewItem, categoryId: number) {
    const current = overrides[it.candidate.line]?.categoryId ?? it.category?.id ?? 0
    const pattern = suggestPattern(it.candidate.rawDescription)
    if (!pattern || categoryId === 0 || categoryId === current) return
    if (it.category?.source === 'rule') return
    toast({
      message: `Always file "${pattern}" under this category?`,
      actionLabel: 'Create rule',
      onAction: () =>
        void run(async () => {
          await window.api.rules.createRule({
            name: pattern,
            conditions: [{ type: 'text', field: 'description', op: 'contains', value: pattern }],
            actions: [{ type: 'setCategory', categoryId }],
          })
          toast({ message: `Rule "${pattern}" saved. It applies to future imports.` })
        }),
    })
  }

  /** A category picked in the preview; keeps whatever choice the row already has. */
  function setCategory(it: PreviewItem, categoryId: number) {
    offerRule(it, categoryId)
    setOverrides((o) => ({
      ...o,
      [it.candidate.line]: {
        choice: it.outcome === 'possible' ? it.choice : 'new',
        ...o[it.candidate.line],
        line: it.candidate.line,
        categoryId,
      },
    }))
  }

  /** A row a rule would skip, and the user has not chosen to import. */
  const ruleSkipped = (it: PreviewItem) =>
    it.outcome === 'new' &&
    it.skippedByRule !== null &&
    overrides[it.candidate.line]?.choice !== 'new'

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
    setAccountId(null)
    setAccountWhy(null)
    setError(null)
  }

  // A multi-account file creates its own accounts, so only a single-account file needs one first.
  if (accounts.length === 0 && step !== 'file' && format !== 'mint')
    return (
      <section aria-label="Import">
        <div className="card">
          <Empty icon={<Upload size={28} />} title="Add an account first">
            Imported transactions go into one of your accounts. Use the + next to Accounts in the
            sidebar.
          </Empty>
          <div className="wizard-footer">
            <button type="button" onClick={reset}>
              Back
            </button>
          </div>
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
      <select
        value={account?.id ?? ''}
        onChange={(e) => {
          setAccountId(num(e))
          setAccountWhy(null)
        }}
      >
        {!account && (
          <option value="" disabled>
            Choose an account
          </option>
        )}
        {accounts.map((a: AccountWithBalance) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      {accountWhy && <span className="field-hint">{accountWhy}</span>}
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
  // The preview's totals leave out rows a skip rule drops; "Import anyway" puts a row back.
  const counts = preview
    ? (() => {
        const c = { ...preview.summary.counts }
        let inflow = preview.summary.inflow
        let outflow = preview.summary.outflow
        for (const it of preview.items) {
          if (it.outcome !== 'new' || !it.skippedByRule) continue
          if (overrides[it.candidate.line]?.choice !== 'new') continue
          c.skipped--
          c.new++
          if (it.candidate.amount >= 0) inflow += it.candidate.amount
          else outflow += it.candidate.amount
        }
        return { ...c, inflow, outflow }
      })()
    : undefined
  /** Lines after the header row (and header itself) that could hold a transaction. */
  const noRows = !!info && !!map && info.totalRows - map.headerRow - (map.hasHeader ? 1 : 0) <= 0
  /** A confidence pill next to a field label while the mapping is still the guess. */
  const conf = (field: 'date' | 'format' | 'desc' | 'amount') => {
    if (source !== 'guess' || !guess) return null
    const c =
      field === 'date' || field === 'format'
        ? guess.date?.confidence
        : field === 'desc'
          ? guess.description.confidence
          : guess.amount?.confidence
    const l = confidenceLabel(c ?? 0)
    return <span className={`${l.cls} guess-tag`}>{l.text}</span>
  }
  const ignoredNames =
    guess && map
      ? guess.ignored.filter((i) => !used.has(i)).map((i) => columnName(info!, map, i))
      : []

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
              if (f) void readDropped(f).then(openFile, fail)
            }}
          >
            <span className="drop-icon" aria-hidden="true">
              <Upload size={22} />
            </span>
            <strong>Drop a bank file here, or choose one</strong>
            <span className="muted">
              CSV, XLSX, OFX, QFX, or a Mint, Monarch or Wealthsimple export. Nothing is saved until
              you confirm.
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
            <button
              type="button"
              className="primary"
              disabled={!account}
              onClick={() => setStep('preview')}
            >
              Preview
            </button>
          </div>
        </div>
      )}

      {step === 'map' && format === 'csv' && info && map && (
        <>
          <MapBanner
            source={source}
            guess={guess}
            presetName={
              source === 'preset'
                ? matchPresetByHeader(info.sample[info.headerRowGuess] ?? [])?.name
                : undefined
            }
            onReguess={() => {
              const g = guessMapping(info.sample)
              setGuess(g)
              setMap(fromGuess(info, g))
              setSource('guess')
            }}
          />
          {noRows && (
            <div className="error" role="alert">
              <strong>This file has no transactions.</strong> It has no rows below the header, so
              there is nothing to import. Choose another file.
            </div>
          )}
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
                    if (p) {
                      setMap(fromProfile(info, p.config))
                      setSource('preset')
                    }
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
                <span>Date column{conf('date')}</span>
                <select value={map.date} onChange={(e) => set('date', num(e))}>
                  {colOptions()}
                </select>
              </label>
              <label className="field">
                <span>Date format{conf('format')}</span>
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
                <span>Description column{conf('desc')}</span>
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
                <span>Amounts are{conf('amount')}</span>
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
          {livePreview && (
            <div className="card flush">
              <div className="card-header">
                <h3>How the first rows will be read</h3>
                <span className="subtle">Updates as you change the columns above</span>
              </div>
              {livePreview.error && (
                <div className="error" role="alert">
                  {livePreview.error}
                </div>
              )}
              {livePreview.failed > 0 && (
                <div className="error" role="alert">
                  {livePreview.failed} of these {livePreview.total} rows cannot be read with this
                  mapping. Check the date column and format, the amount columns and the header row.
                </div>
              )}
              {ignoredNames.length > 0 && (
                <p className="subtle map-note">Not used: {ignoredNames.join(', ')}</p>
              )}
              {source === 'guess' &&
                guess?.notes.map((n) => (
                  <p className="subtle map-note" key={n}>
                    {n}
                  </p>
                ))}
              <div className="table-wrap">
                <table className="import-table" aria-label="Mapping preview">
                  <thead>
                    <tr>
                      <th>Line</th>
                      <th>Date</th>
                      <th>Description</th>
                      <th className="num">Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {livePreview.rows.map((r) => (
                      <tr key={r.line} className={r.ok ? undefined : 'row-bad'}>
                        <td className="subtle">{r.line}</td>
                        <td className="nowrap">{r.date ?? ''}</td>
                        <td>{r.ok ? r.description : r.cells.join(' | ')}</td>
                        <td className={`num amount ${(r.amount ?? 0) < 0 ? '' : 'pos'}`}>
                          {r.amount === undefined ? '' : formatCents(r.amount)}
                        </td>
                        <td>
                          {r.ok ? (
                            <span className="pill pos">OK</span>
                          ) : (
                            <span className="neg">{r.message}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="wizard-footer">
            <button type="button" onClick={reset}>
              Back
            </button>
            <button
              type="button"
              className="primary"
              disabled={!!livePreview?.error || !account || noRows}
              onClick={() => setStep('preview')}
            >
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
              {counts.skipped > 0 && (
                <div>
                  <span>Skipped by rule</span>
                  <strong>{counts.skipped}</strong>
                </div>
              )}
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
                <strong className="pos">{formatCents(counts.inflow)}</strong>
              </div>
              <div>
                <span>Money out</span>
                <strong>{formatCents(counts.outflow)}</strong>
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
                    <th>Category</th>
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
                        <td className="desc-cell" title={it.candidate.rawDescription}>
                          {it.candidate.rawDescription}
                        </td>
                        <td className={`num amount ${it.candidate.amount < 0 ? '' : 'pos'}`}>
                          {formatCents(it.candidate.amount)}
                        </td>
                        <td>
                          {it.outcome !== 'duplicate' && !ruleSkipped(it) && (
                            <div className="result-cell">
                              <CategorySelect
                                inline
                                aria-label={`Category for line ${it.candidate.line}`}
                                categories={categories}
                                anyLabel="No category"
                                value={
                                  overrides[it.candidate.line]?.categoryId ?? it.category?.id ?? 0
                                }
                                onChange={(id) => setCategory(it, id)}
                              />
                              {overrides[it.candidate.line]?.categoryId === undefined &&
                                it.category?.source === 'history' && (
                                  <span
                                    className="subtle"
                                    title="Guessed from earlier transactions"
                                  >
                                    {it.category.similar ? 'similar guess' : 'guess'}{' '}
                                    {it.category.agree}/{it.category.of}
                                  </span>
                                )}
                              {overrides[it.candidate.line]?.categoryId === undefined &&
                                it.category?.source === 'rule' && (
                                  <span className="subtle">rule</span>
                                )}
                            </div>
                          )}
                        </td>
                        <td>
                          {ruleSkipped(it) && it.skippedByRule && (
                            <div className="result-cell">
                              <span className="pill">Skipped</span>
                              <span className="muted">
                                by rule &quot;{it.skippedByRule.ruleName}&quot;
                              </span>
                              <button
                                type="button"
                                className="small"
                                onClick={() => setChoice(it, 'new')}
                              >
                                Import anyway
                              </button>
                            </div>
                          )}
                          {it.outcome === 'new' && !ruleSkipped(it) && (
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
                  : preview.errors.length > 0
                    ? 'No row could be read; the rows that failed are listed below.'
                    : preview.skippedForeign.length > 0
                      ? 'Every row was in another currency and was skipped.'
                      : counts.skipped > 0
                        ? 'Every new row is dropped by a skip rule. Use Import anyway on a row to keep it.'
                        : 'This file has no transactions that can be imported.'}
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

function MapBanner({
  source,
  guess,
  presetName,
  onReguess,
}: {
  source: MapSource
  guess: MappingGuess | null
  presetName?: string | undefined
  onReguess: () => void
}) {
  if (source === 'saved') return null
  const l = guess ? confidenceLabel(guess.confidence) : null
  return (
    <div className="notice map-banner" role="note">
      <div className="grow">
        {source === 'preset' ? (
          <>
            <strong>Recognised {presetName ?? 'a known bank layout'}.</strong> The columns below
            come from that bank&apos;s preset.
          </>
        ) : source === 'guess' ? (
          <>
            <strong>This is our best guess.</strong> We read the headers and the values in each
            column. Check the preview below and change anything that looks wrong.
          </>
        ) : (
          <>
            <strong>Edited.</strong> You changed the guessed mapping.
          </>
        )}{' '}
        {source === 'guess' && l && <span className={l.cls}>overall {l.text}</span>}
      </div>
      {guess && source !== 'guess' && (
        <button type="button" className="small" onClick={onReguess}>
          Guess again
        </button>
      )}
    </div>
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
