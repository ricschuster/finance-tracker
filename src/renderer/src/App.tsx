import { useCallback, useEffect, useState } from 'react'
import type { RuleInput } from '../../core/rules/types'
import { formatCents } from '../../core/money'
import type { Api } from '../../preload'
import { AccountEditor } from './AccountEditor'
import { AccountForm } from './AccountForm'
import type { AccountWithBalance } from '../../core/ledger/accounts'
import { CategoriesEditor } from './CategoriesEditor'
import { CategoryStyleProvider } from './CategoryBadge'
import { Dashboard } from './Dashboard'
import { DataPanel } from './DataPanel'
import { ImportHistory } from './ImportHistory'
import { ImportWizard } from './ImportWizard'
import { Reports } from './Reports'
import { RulesEditor } from './RulesEditor'
import { TransferForm } from './TransferForm'
import { TransactionForm } from './TransactionForm'
import { TransactionSearch } from './TransactionSearch'
import { useLedger } from './useLedger'
import './styles.css'

const VIEW_LABELS = {
  dashboard: 'Dashboard',
  reports: 'Reports',
  ledger: 'Transactions',
  import: 'Import',
  history: 'Import history',
  rules: 'Rules',
  categories: 'Categories',
  data: 'Data',
} as const

declare global {
  interface Window {
    api: Api
  }
}

export function App() {
  const [accountId, setAccountId] = useState<number | null>(null)
  const [info, setInfo] = useState<{ version: string; schemaVersion: number } | null>(null)
  const [view, setView] = useState<keyof typeof VIEW_LABELS>('dashboard')
  const [preset, setPreset] = useState<{
    key: number
    categoryId: number
    from: string
    to: string
  } | null>(null)
  const [ruleDraft, setRuleDraft] = useState<RuleInput | null>(null)
  const clearDraft = useCallback(() => setRuleDraft(null), [])
  const ledger = useLedger(accountId)

  useEffect(() => {
    void window.api.getAppInfo().then(setInfo)
  }, [])

  const openCategory = (categoryId: number, from: string, to: string) => {
    setPreset({ key: Date.now(), categoryId, from, to })
    setView('ledger')
  }
  const reviewUncategorized = () => {
    const u = ledger.categories.find((c) => c.name === 'Uncategorized' && c.parentId === null)
    if (u) openCategory(u.id, '', '')
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

  return (
    <CategoryStyleProvider value={ledger.categories}>
      <div className="layout">
        <nav className="sidebar" aria-label="Accounts">
          <h1>Finance Tracker</h1>
          <ul>
            <li>
              <button
                type="button"
                aria-current={accountId === null}
                onClick={() => setAccountId(null)}
              >
                <span>All accounts</span>
                <span>{formatCents(total)}</span>
              </button>
            </li>
            {ledger.accounts.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  aria-current={accountId === a.id}
                  onClick={() => setAccountId(a.id)}
                >
                  <span>{a.name}</span>
                  <span className={a.balance < 0 ? 'neg' : ''}>{formatCents(a.balance)}</span>
                </button>
              </li>
            ))}
          </ul>
          {archived.length > 0 && (
            <details>
              <summary>Archived ({archived.length})</summary>
              <ul>
                {archived.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      aria-current={accountId === a.id}
                      onClick={() => setAccountId(a.id)}
                    >
                      <span>{a.name}</span>
                      <span>{formatCents(a.balance)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {selected && (
            <AccountEditor
              account={selected}
              run={ledger.run}
              onDeleted={() => setAccountId(null)}
            />
          )}
          <AccountForm run={ledger.run} />
          <p className="muted">{info ? `v${info.version}, schema ${info.schemaVersion}` : ''}</p>
        </nav>
        <main className="content">
          {ledger.error && (
            <div className="error" role="alert">
              {ledger.error}{' '}
              <button type="button" onClick={ledger.clearError}>
                Dismiss
              </button>
            </div>
          )}
          <div className="tabs" role="tablist">
            {(Object.keys(VIEW_LABELS) as (keyof typeof VIEW_LABELS)[]).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => {
                  setPreset(null)
                  setView(v)
                }}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>
          {view === 'dashboard' && (
            <Dashboard
              version={ledger.version}
              onOpenCategory={openCategory}
              onReviewUncategorized={reviewUncategorized}
            />
          )}
          {view === 'reports' && (
            <Reports
              accounts={ledger.accounts}
              version={ledger.version}
              onOpenCategory={openCategory}
            />
          )}
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
          {view === 'history' && <ImportHistory run={ledger.run} />}
          {view === 'ledger' && (
            <>
              <TransactionForm
                accounts={ledger.accounts}
                categories={ledger.categories}
                run={ledger.run}
                accountId={accountId}
              />
              <TransferForm accounts={ledger.accounts} run={ledger.run} />
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
                      window.alert('Edit the payee or category by hand first, then suggest a rule.')
                      return
                    }
                    setRuleDraft(s.draft)
                    setView('rules')
                  })
                }
              />
            </>
          )}
        </main>
      </div>
    </CategoryStyleProvider>
  )
}
