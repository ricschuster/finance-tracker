import {
  ArrowLeft,
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  Copy,
  Database,
  Keyboard,
  LayoutDashboard,
  Leaf,
  Monitor,
  Moon,
  Pencil,
  Plus,
  Sun,
  Tags,
  Target,
  Wallet,
  Upload,
  Wand2,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RuleInput } from '../../core/rules/types'
import type { Api } from '../../preload'
import { AccountEditor } from './AccountEditor'
import { AccountForm } from './AccountForm'
import type { AccountWithBalance } from '../../core/ledger/accounts'
import {
  ACCOUNT_GROUPS,
  ACCOUNT_ICONS,
  accountTypeLabel,
  balanceText,
  isLiability,
} from './accountTypes'
import { CategoriesEditor } from './CategoriesEditor'
import { CategoryStyleProvider } from './CategoryBadge'
import { CategoryAliasProvider } from './CategorySelect'
import { Accounts } from './Accounts'
import { Budgets } from './Budgets'
import { Dashboard } from './Dashboard'
import { Manual } from './Manual'
import { DataPanel } from './DataPanel'
import { ImportHistory } from './ImportHistory'
import { ImportWizard } from './ImportWizard'
import { PageActionsContext } from './PageActions'
import { Reports } from './Reports'
import { RulesEditor } from './RulesEditor'
import { DuplicatesForm } from './DuplicatesForm'
import { LinkPaymentsForm } from './LinkPaymentsForm'
import { TransferForm } from './TransferForm'
import { TransactionForm } from './TransactionForm'
import { TransactionSearch } from './TransactionSearch'
import { useTheme, type ThemePref } from './theme'
import { ReviewQueue } from './ReviewQueue'
import { ShortcutsDialog, useShortcuts } from './Shortcuts'
import { ConfirmProvider, Dialog, ToastProvider, useAlert } from './ui'
import { useLedger } from './useLedger'
import './styles.css'

type View =
  | 'dashboard'
  | 'ledger'
  | 'accounts'
  | 'budgets'
  | 'reports'
  | 'import'
  | 'history'
  | 'review'
  | 'rules'
  | 'categories'
  | 'data'
  | 'help'

const NAV: { heading?: string; items: { view: View; label: string; icon: LucideIcon }[] }[] = [
  {
    items: [
      { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { view: 'ledger', label: 'Transactions', icon: ArrowLeftRight },
      { view: 'budgets', label: 'Cashflow', icon: Target },
      { view: 'reports', label: 'Reports', icon: BarChart3 },
    ],
  },
  {
    heading: 'Manage',
    items: [
      { view: 'accounts', label: 'Accounts', icon: Wallet },
      { view: 'import', label: 'Import', icon: Upload },
      { view: 'rules', label: 'Rules', icon: Wand2 },
      { view: 'categories', label: 'Categories', icon: Tags },
      { view: 'data', label: 'Data', icon: Database },
    ],
  },
  { heading: 'Help', items: [{ view: 'help', label: 'Manual', icon: BookOpen }] },
]

const SUBTITLES: Partial<Record<View, string>> = {
  accounts: 'Balances across every account',
  review: 'Step through uncategorized transactions',
  reports: 'Where your money comes from and goes',
  budgets: 'Monthly spending targets and where the money goes',
  import: 'Bring in transactions from your bank',
  history: 'Bring in transactions from your bank',
  rules: 'Categorize transactions automatically',
  categories: 'Organize how your spending is grouped',
  data: 'Backups, export and restore',
  help: 'How to use the app',
}

declare global {
  interface Window {
    api: Api
  }
}

export function App() {
  return (
    <ConfirmProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </ConfirmProvider>
  )
}

function Shell() {
  const [accountId, setAccountId] = useState<number | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const [info, setInfo] = useState<{ version: string; schemaVersion: number } | null>(null)
  const [view, setView] = useState<View>('dashboard')
  const [preset, setPreset] = useState<{
    key: number
    categoryId: number
    from: string
    to: string
    direction?: 'expense' | 'income'
    uncategorized?: boolean
    noTransfers?: boolean
  } | null>(null)
  const [ruleDraft, setRuleDraft] = useState<RuleInput | null>(null)
  const [dialog, setDialog] = useState<
    'account' | 'editAccount' | 'transaction' | 'transfer' | 'linkPayments' | 'duplicates' | null
  >(null)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const focusSearch = useRef(false)
  const [focusTick, setFocusTick] = useState(0)
  const [theme, setTheme] = useTheme()
  const [slot, setSlot] = useState<HTMLDivElement | null>(null)
  const alert = useAlert()
  const clearDraft = useCallback(() => setRuleDraft(null), [])
  const ledger = useLedger(accountId)

  useEffect(() => {
    void window.api.getAppInfo().then(setInfo)
  }, [])

  // Where Back returns to: each screen reached from another screen (a drill-down, a dashboard
  // link) pushes the one it left. Sidebar navigation starts a fresh trail.
  const [trail, setTrail] = useState<
    { view: View; accountId: number | null; preset: typeof preset }[]
  >([])
  const remember = () => setTrail((t) => [...t.slice(-19), { view, accountId, preset }])
  const goBack = () => {
    const last = trail[trail.length - 1]
    if (!last) return
    setTrail(trail.slice(0, -1))
    setAccountId(last.accountId)
    setPreset(last.preset)
    setView(last.view)
  }
  const goTop = (v: View) => {
    setTrail([])
    setPreset(null)
    setView(v)
  }
  const go = (v: View) => {
    remember()
    setPreset(null)
    setView(v)
  }
  // A drill-down always looks at every account, so a previously picked account cannot hide rows.
  const drillDown = (p: Omit<NonNullable<typeof preset>, 'key'>) => {
    remember()
    setAccountId(null)
    setPreset({ key: Date.now(), ...p })
    setView('ledger')
  }
  const openCategory = (categoryId: number, from: string, to: string) =>
    drillDown({ categoryId, from, to, noTransfers: true })
  const openRange = (from: string, to: string, direction?: 'expense' | 'income') =>
    drillDown({ categoryId: 0, from, to, ...(direction && { direction }), noTransfers: true })
  const reviewUncategorized = () =>
    drillDown({ categoryId: 0, from: '', to: '', uncategorized: true, noTransfers: true })
  const pickAccount = (id: number | null, top = false) => {
    if (top) setTrail([])
    else remember()
    setAccountId(id)
    setPreset(null)
    setView('ledger')
  }

  const goKeys: Record<string, View> = {
    d: 'dashboard',
    t: 'ledger',
    b: 'budgets',
    r: 'reports',
    a: 'accounts',
    i: 'import',
  }
  useShortcuts({
    search: () => {
      if (view !== 'ledger') go('ledger')
      focusSearch.current = true
      setFocusTick((n) => n + 1)
    },
    add: () => setDialog('transaction'),
    help: () => setShowShortcuts(true),
    go: (k) => {
      const v = goKeys[k]
      if (!v) return false
      if (v === 'ledger') pickAccount(null, true)
      else goTop(v)
      return true
    },
  })
  useEffect(() => {
    if (!focusSearch.current || view !== 'ledger') return
    const el = document.querySelector<HTMLInputElement>('input[aria-label="Search transactions"]')
    if (el) {
      focusSearch.current = false
      el.focus()
      el.select()
    }
  }, [view, focusTick])

  const [archived, setArchived] = useState<AccountWithBalance[]>([])
  useEffect(() => {
    void window.api.ledger
      .listAccounts({ includeArchived: true })
      .then((all) => setArchived(all.filter((a) => a.archived)))
  }, [ledger.version])
  const selected =
    accountId === null
      ? undefined
      : (ledger.accounts.find((a) => a.id === accountId) ??
        archived.find((a) => a.id === accountId))
  const editTarget =
    editId === null
      ? undefined
      : (ledger.accounts.find((a) => a.id === editId) ?? archived.find((a) => a.id === editId))

  const navView: View = view === 'history' ? 'import' : view === 'review' ? 'dashboard' : view
  const title =
    view === 'ledger'
      ? (selected?.name ?? 'Transactions')
      : view === 'review'
        ? 'Review'
        : NAV.flatMap((g) => g.items).find((i) => i.view === navView)!.label
  const subtitle =
    view === 'dashboard'
      ? new Date().toLocaleString('en-CA', { month: 'long', year: 'numeric' })
      : view === 'ledger'
        ? selected
          ? `${accountTypeLabel(selected.type)}${selected.archived ? ' (archived)' : ''} · ${isLiability(selected.type) ? '' : 'Balance '}${balanceText(selected.type, selected.balance)}`
          : `All accounts · ${ledger.accounts.length} account${ledger.accounts.length === 1 ? '' : 's'}`
        : SUBTITLES[view]

  return (
    <CategoryStyleProvider value={ledger.categories}>
      <CategoryAliasProvider value={ledger.categoryAliases}>
        <PageActionsContext.Provider value={slot}>
          <div className="layout">
            <aside className="sidebar">
              <div className="brand">
                <span className="brand-mark" aria-hidden="true">
                  <Leaf size={17} strokeWidth={2.4} />
                </span>
                <h1>Finance Tracker</h1>
              </div>
              <div className="sidebar-scroll">
                <nav aria-label="Main">
                  {NAV.map((group, i) => (
                    <div key={i} className="nav-group">
                      {group.heading && <div className="nav-heading">{group.heading}</div>}
                      <div
                        role="tablist"
                        aria-orientation="vertical"
                        aria-label={group.heading ?? 'Views'}
                      >
                        {group.items.map(({ view: v, label, icon: Icon }) => (
                          <button
                            key={v}
                            type="button"
                            role="tab"
                            className="nav-item"
                            aria-label={label}
                            title={label}
                            aria-selected={navView === v}
                            onClick={() => (v === 'ledger' ? pickAccount(null, true) : goTop(v))}
                          >
                            <Icon size={17} aria-hidden="true" />
                            <span className="grow">{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </nav>
                <nav aria-label="Accounts">
                  {ACCOUNT_GROUPS.map((g) => {
                    const list = ledger.accounts.filter((a) => g.types.includes(a.type))
                    if (list.length === 0) return null
                    return (
                      <div key={g.label} className="nav-group">
                        <div className="nav-heading">{g.label}</div>
                        <ul>
                          {list.map((a) => {
                            const Icon = ACCOUNT_ICONS[a.type]
                            return (
                              <li key={a.id}>
                                <button
                                  type="button"
                                  className="nav-item"
                                  title={a.name}
                                  aria-current={view === 'ledger' && accountId === a.id}
                                  onClick={() => pickAccount(a.id, true)}
                                >
                                  <Icon size={17} aria-hidden="true" />
                                  <span className="grow">{a.name}</span>
                                  <span className={`amount${a.balance < 0 ? ' neg' : ''}`}>
                                    {balanceText(a.type, a.balance)}
                                  </span>
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )
                  })}
                </nav>
              </div>
              <footer className="sidebar-footer">
                <span title={info ? `Schema ${info.schemaVersion}` : undefined}>
                  {info ? `v${info.version}` : ''}
                </span>
                <div className="sidebar-tools">
                  <button
                    type="button"
                    className="ghost icon small"
                    aria-label="Keyboard shortcuts"
                    title="Keyboard shortcuts (?)"
                    onClick={() => setShowShortcuts(true)}
                  >
                    <Keyboard size={15} />
                  </button>
                  <ThemeSwitch value={theme} onChange={setTheme} />
                </div>
              </footer>
            </aside>
            <div className="main">
              <header className="page-header">
                <div className="header-title">
                  {trail.length > 0 && (
                    <button type="button" className="ghost" onClick={goBack} aria-label="Back">
                      <ArrowLeft size={16} />
                      Back
                    </button>
                  )}
                  <div>
                    <h2>{title}</h2>
                    {subtitle && <div className="subtitle">{subtitle}</div>}
                  </div>
                </div>
                <div className="page-actions" ref={setSlot}>
                  {view === 'ledger' && (
                    <>
                      {selected && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditId(accountId)
                            setDialog('editAccount')
                          }}
                        >
                          <Pencil size={15} />
                          Edit account
                        </button>
                      )}
                      {ledger.accounts.length > 1 && (
                        <button type="button" onClick={() => setDialog('transfer')}>
                          <ArrowLeftRight size={15} />
                          Transfer
                        </button>
                      )}
                      {ledger.accounts.some((a) => isLiability(a.type)) && (
                        <button type="button" onClick={() => setDialog('linkPayments')}>
                          <ArrowLeftRight size={15} />
                          Link card payments
                        </button>
                      )}
                      <button type="button" onClick={() => setDialog('duplicates')}>
                        <Copy size={15} />
                        Find duplicates
                      </button>
                      <button
                        type="button"
                        className="primary"
                        onClick={() => setDialog('transaction')}
                      >
                        <Plus size={16} />
                        Add transaction
                      </button>
                    </>
                  )}
                </div>
              </header>
              <main className="content">
                {ledger.error && (
                  <div className="error" role="alert">
                    <span>{ledger.error}</span>
                    <button type="button" className="small" onClick={ledger.clearError}>
                      Dismiss
                    </button>
                  </div>
                )}
                {(view === 'import' || view === 'history') && (
                  <div className="subtabs" role="tablist" aria-label="Import">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={view === 'import'}
                      onClick={() => go('import')}
                    >
                      New import
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={view === 'history'}
                      onClick={() => go('history')}
                    >
                      Import history
                    </button>
                  </div>
                )}
                {view === 'dashboard' && (
                  <Dashboard
                    version={ledger.version}
                    accounts={ledger.accounts}
                    onOpenCategory={openCategory}
                    onOpenRange={openRange}
                    onReviewUncategorized={() => go('review')}
                    onOpenBudgets={() => go('budgets')}
                    onAddAccount={() => setDialog('account')}
                    onAddTransaction={() => setDialog('transaction')}
                    onImport={() => go('import')}
                    onOpenRules={() => go('rules')}
                  />
                )}
                {view === 'reports' && (
                  <Reports
                    accounts={ledger.accounts}
                    version={ledger.version}
                    onOpenCategory={openCategory}
                  />
                )}
                {view === 'accounts' && (
                  <Accounts
                    accounts={ledger.accounts}
                    archived={archived}
                    onOpen={pickAccount}
                    onAdd={() => setDialog('account')}
                    onEdit={(id) => {
                      setEditId(id)
                      setDialog('editAccount')
                    }}
                  />
                )}
                {view === 'budgets' && (
                  <Budgets
                    run={ledger.run}
                    version={ledger.version}
                    onOpenCategory={openCategory}
                  />
                )}
                {view === 'import' && (
                  <ImportWizard
                    categories={ledger.categories}
                    accounts={ledger.accounts}
                    run={ledger.run}
                    onFinished={() => setView('ledger')}
                  />
                )}
                {view === 'rules' && (
                  <RulesEditor
                    accounts={ledger.accounts}
                    categories={ledger.categories}
                    run={ledger.run}
                    draft={ruleDraft}
                    onDraftUsed={clearDraft}
                  />
                )}
                {view === 'categories' && <CategoriesEditor ledger={ledger} />}
                {view === 'data' && <DataPanel run={ledger.run} />}
                {view === 'help' && <Manual />}
                {view === 'history' && <ImportHistory run={ledger.run} />}
                {view === 'review' && (
                  <ReviewQueue
                    ledger={ledger}
                    onOpenList={reviewUncategorized}
                    onDone={() => go('dashboard')}
                  />
                )}
                {view === 'ledger' && (
                  <TransactionSearch
                    accounts={[...ledger.accounts, ...archived]}
                    categories={ledger.categories}
                    run={ledger.run}
                    version={ledger.version}
                    accountId={accountId}
                    onAccountChange={setAccountId}
                    onAddAccount={() => setDialog('account')}
                    onAddTransaction={() => setDialog('transaction')}
                    onImport={() => go('import')}
                    preset={preset}
                    onSuggestRule={(id) =>
                      void ledger.run(async () => {
                        const s = await window.api.rules.suggestRule(id)
                        if (!s) {
                          await alert(
                            'Edit the payee or category by hand first, then suggest a rule.',
                            'Nothing to suggest yet',
                          )
                          return
                        }
                        setRuleDraft(s.draft)
                        setView('rules')
                      })
                    }
                  />
                )}
              </main>
            </div>
          </div>

          <Dialog
            open={dialog === 'account'}
            onOpenChange={(o) => setDialog(o ? 'account' : null)}
            title="Add account"
            description="Track a bank account, credit card, loan or cash."
          >
            <AccountForm run={ledger.run} onDone={() => setDialog(null)} />
          </Dialog>
          <Dialog
            open={dialog === 'editAccount' && editTarget !== undefined}
            onOpenChange={(o) => setDialog(o ? 'editAccount' : null)}
            title={editTarget ? `Edit ${editTarget.name}` : 'Edit account'}
          >
            {editTarget && (
              <AccountEditor
                account={editTarget}
                run={ledger.run}
                onDone={() => setDialog(null)}
                onDeleted={() => {
                  setDialog(null)
                  if (accountId === editId) setAccountId(null)
                }}
              />
            )}
          </Dialog>
          <Dialog
            open={dialog === 'transaction'}
            onOpenChange={(o) => setDialog(o ? 'transaction' : null)}
            title="Add transaction"
          >
            <TransactionForm
              accounts={ledger.accounts}
              categories={ledger.categories}
              run={ledger.run}
              accountId={accountId}
              onDone={() => setDialog(null)}
            />
          </Dialog>
          <Dialog
            open={dialog === 'transfer'}
            onOpenChange={(o) => setDialog(o ? 'transfer' : null)}
            title="Transfer between accounts"
            description="Moves money without counting it as income or spending."
          >
            <TransferForm
              accounts={ledger.accounts}
              run={ledger.run}
              onDone={() => setDialog(null)}
            />
          </Dialog>
          <Dialog
            open={dialog === 'duplicates'}
            onOpenChange={(o) => setDialog(o ? 'duplicates' : null)}
            title="Find duplicates"
            description="Transactions with the same amount, close dates and similar text. Nothing is deleted unless you choose Delete."
            wide
          >
            {dialog === 'duplicates' && <DuplicatesForm run={ledger.run} />}
          </Dialog>
          <Dialog
            open={dialog === 'linkPayments'}
            onOpenChange={(o) => setDialog(o ? 'linkPayments' : null)}
            title="Link card payments"
            description="Payments that reduce a card or loan but were never linked to the paying account."
          >
            {dialog === 'linkPayments' && (
              <LinkPaymentsForm run={ledger.run} onDone={() => setDialog(null)} />
            )}
          </Dialog>
          <ShortcutsDialog open={showShortcuts} onOpenChange={setShowShortcuts} />
        </PageActionsContext.Provider>
      </CategoryAliasProvider>
    </CategoryStyleProvider>
  )
}

function ThemeSwitch({ value, onChange }: { value: ThemePref; onChange: (p: ThemePref) => void }) {
  const options: { v: ThemePref; label: string; icon: LucideIcon }[] = [
    { v: 'light', label: 'Light theme', icon: Sun },
    { v: 'dark', label: 'Dark theme', icon: Moon },
    { v: 'system', label: 'Match system', icon: Monitor },
  ]
  return (
    <div className="theme-switch" role="group" aria-label="Theme">
      {options.map(({ v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          aria-label={label}
          title={label}
          aria-pressed={value === v}
          onClick={() => onChange(v)}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  )
}
