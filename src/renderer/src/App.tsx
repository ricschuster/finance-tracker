import {
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  Copy,
  Database,
  LayoutDashboard,
  Leaf,
  Monitor,
  Moon,
  Pencil,
  Plus,
  Sun,
  Tags,
  Target,
  Upload,
  Wand2,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { RuleInput } from '../../core/rules/types'
import { formatCents } from '../../core/money'
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
import { ConfirmProvider, Dialog, ToastProvider, useAlert } from './ui'
import { useLedger } from './useLedger'
import './styles.css'

type View =
  | 'dashboard'
  | 'ledger'
  | 'budgets'
  | 'reports'
  | 'import'
  | 'history'
  | 'rules'
  | 'categories'
  | 'data'
  | 'help'

const NAV: { heading?: string; items: { view: View; label: string; icon: LucideIcon }[] }[] = [
  {
    items: [
      { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { view: 'ledger', label: 'Transactions', icon: ArrowLeftRight },
      { view: 'budgets', label: 'Budgets', icon: Target },
      { view: 'reports', label: 'Reports', icon: BarChart3 },
    ],
  },
  {
    heading: 'Manage',
    items: [
      { view: 'import', label: 'Import', icon: Upload },
      { view: 'rules', label: 'Rules', icon: Wand2 },
      { view: 'categories', label: 'Categories', icon: Tags },
      { view: 'data', label: 'Data', icon: Database },
    ],
  },
  { heading: 'Help', items: [{ view: 'help', label: 'Manual', icon: BookOpen }] },
]

const SUBTITLES: Partial<Record<View, string>> = {
  reports: 'Where your money comes from and goes',
  budgets: 'Monthly spending targets by category',
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
  const [info, setInfo] = useState<{ version: string; schemaVersion: number } | null>(null)
  const [view, setView] = useState<View>('dashboard')
  const [preset, setPreset] = useState<{
    key: number
    categoryId: number
    from: string
    to: string
  } | null>(null)
  const [ruleDraft, setRuleDraft] = useState<RuleInput | null>(null)
  const [dialog, setDialog] = useState<
    'account' | 'editAccount' | 'transaction' | 'transfer' | 'linkPayments' | 'duplicates' | null
  >(null)
  const [theme, setTheme] = useTheme()
  const [slot, setSlot] = useState<HTMLDivElement | null>(null)
  const alert = useAlert()
  const clearDraft = useCallback(() => setRuleDraft(null), [])
  const ledger = useLedger(accountId)

  useEffect(() => {
    void window.api.getAppInfo().then(setInfo)
  }, [])

  const go = (v: View) => {
    setPreset(null)
    setView(v)
  }
  const openCategory = (categoryId: number, from: string, to: string) => {
    setPreset({ key: Date.now(), categoryId, from, to })
    setView('ledger')
  }
  const reviewUncategorized = () => {
    const u = ledger.categories.find((c) => c.name === 'Uncategorized' && c.parentId === null)
    if (u) openCategory(u.id, '', '')
  }
  const pickAccount = (id: number | null) => {
    setAccountId(id)
    go('ledger')
  }

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
  const total = ledger.accounts.reduce((sum, a) => sum + a.balance, 0)

  const navView: View = view === 'history' ? 'import' : view
  const title =
    view === 'ledger'
      ? (selected?.name ?? 'Transactions')
      : NAV.flatMap((g) => g.items).find((i) => i.view === navView)!.label
  const subtitle =
    view === 'dashboard'
      ? new Date().toLocaleString('en-CA', { month: 'long', year: 'numeric' })
      : view === 'ledger'
        ? selected
          ? `${accountTypeLabel(selected.type)}${selected.archived ? ' (archived)' : ''} · ${isLiability(selected.type) ? '' : 'Balance '}${balanceText(selected.type, selected.balance)}`
          : `All accounts · ${ledger.accounts.length} account${ledger.accounts.length === 1 ? '' : 's'}`
        : SUBTITLES[view]

  const accountButton = (a: AccountWithBalance) => {
    const Icon = ACCOUNT_ICONS[a.type]
    return (
      <li key={a.id} className="account-row">
        <button
          type="button"
          className="nav-item"
          aria-current={accountId === a.id}
          onClick={() => pickAccount(a.id)}
        >
          <Icon size={16} aria-hidden="true" />
          <span className="grow">{a.name}</span>
        </button>
      </li>
    )
  }

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
                            aria-selected={navView === v}
                            onClick={() => (v === 'ledger' ? pickAccount(null) : go(v))}
                          >
                            <Icon size={17} aria-hidden="true" />
                            <span className="grow">{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </nav>
                <nav aria-label="Accounts" className="nav-group">
                  <div className="nav-heading">
                    Accounts
                    <button
                      type="button"
                      aria-label="Add account"
                      title="Add account"
                      onClick={() => setDialog('account')}
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                  <div className="net-worth">
                    <span>Net worth</span>
                    <strong className={total < 0 ? 'neg' : ''}>{formatCents(total)}</strong>
                  </div>
                  <ul>
                    <li>
                      <button
                        type="button"
                        className="nav-item"
                        aria-current={view === 'ledger' && accountId === null}
                        onClick={() => pickAccount(null)}
                      >
                        <span className="grow">All accounts</span>
                      </button>
                    </li>
                  </ul>
                  {ACCOUNT_GROUPS.map((g) => {
                    const list = ledger.accounts.filter((a) => g.types.includes(a.type))
                    if (list.length === 0) return null
                    return (
                      <div key={g.label}>
                        <div className="account-type">{g.label}</div>
                        <ul>{list.map(accountButton)}</ul>
                      </div>
                    )
                  })}
                  {archived.length > 0 && (
                    <details>
                      <summary>Archived ({archived.length})</summary>
                      <ul>{archived.map(accountButton)}</ul>
                    </details>
                  )}
                </nav>
              </div>
              <footer className="sidebar-footer">
                <span title={info ? `Schema ${info.schemaVersion}` : undefined}>
                  {info ? `v${info.version}` : ''}
                </span>
                <ThemeSwitch value={theme} onChange={setTheme} />
              </footer>
            </aside>
            <div className="main">
              <header className="page-header">
                <div>
                  <h2>{title}</h2>
                  {subtitle && <div className="subtitle">{subtitle}</div>}
                </div>
                <div className="page-actions" ref={setSlot}>
                  {view === 'ledger' && (
                    <>
                      {selected && (
                        <button type="button" onClick={() => setDialog('editAccount')}>
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
                    onReviewUncategorized={reviewUncategorized}
                    onOpenBudgets={() => go('budgets')}
                  />
                )}
                {view === 'reports' && (
                  <Reports
                    accounts={ledger.accounts}
                    version={ledger.version}
                    onOpenCategory={openCategory}
                  />
                )}
                {view === 'budgets' && <Budgets run={ledger.run} version={ledger.version} />}
                {view === 'import' && (
                  <ImportWizard
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
                {view === 'ledger' && (
                  <TransactionSearch
                    accounts={ledger.accounts}
                    categories={ledger.categories}
                    run={ledger.run}
                    version={ledger.version}
                    accountId={accountId}
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
            open={dialog === 'editAccount' && selected !== undefined}
            onOpenChange={(o) => setDialog(o ? 'editAccount' : null)}
            title={selected ? `Edit ${selected.name}` : 'Edit account'}
          >
            {selected && (
              <AccountEditor
                account={selected}
                run={ledger.run}
                onDone={() => setDialog(null)}
                onDeleted={() => {
                  setDialog(null)
                  setAccountId(null)
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
            description="Transactions in the same account with the same amount, close dates and similar text. Nothing is deleted unless you choose Delete."
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
