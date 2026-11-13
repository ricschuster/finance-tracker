import { useEffect, useState } from 'react'
import { formatCents } from '../../core/money'
import type { Api } from '../../preload'
import { AccountForm } from './AccountForm'
import { TransferForm } from './TransferForm'
import { TransactionForm } from './TransactionForm'
import { TransactionList } from './TransactionList'
import { useLedger } from './useLedger'
import './styles.css'

declare global {
  interface Window {
    api: Api
  }
}

export function App() {
  const [accountId, setAccountId] = useState<number | null>(null)
  const [info, setInfo] = useState<{ version: string; schemaVersion: number } | null>(null)
  const ledger = useLedger(accountId)

  useEffect(() => {
    void window.api.getAppInfo().then(setInfo)
  }, [])

  const total = ledger.accounts.reduce((sum, a) => sum + a.balance, 0)

  return (
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
        <TransactionForm
          accounts={ledger.accounts}
          categories={ledger.categories}
          run={ledger.run}
          accountId={accountId}
        />
        <TransferForm accounts={ledger.accounts} run={ledger.run} />
        <TransactionList
          transactions={ledger.transactions}
          accounts={ledger.accounts}
          categories={ledger.categories}
          run={ledger.run}
          showAccount={accountId === null}
        />
      </main>
    </div>
  )
}
