import { Pencil, Plus } from 'lucide-react'
import type { AccountWithBalance } from '../../core/ledger/accounts'
import { formatCents } from '../../core/money'
import { PageActions } from './PageActions'
import {
  ACCOUNT_GROUPS,
  ACCOUNT_ICONS,
  accountTypeLabel,
  balanceText,
  isLiability,
} from './accountTypes'

interface Props {
  accounts: AccountWithBalance[]
  archived: AccountWithBalance[]
  onOpen: (accountId: number) => void
  onEdit: (accountId: number) => void
  onAdd: () => void
}

/** Every account with its type and balance, grouped like the sidebar; a row opens its transactions. */
export function Accounts({ accounts, archived, onOpen, onEdit, onAdd }: Props) {
  const assets = accounts.filter((a) => !isLiability(a.type)).reduce((s, a) => s + a.balance, 0)
  const owing = accounts
    .filter((a) => isLiability(a.type) && a.balance < 0)
    .reduce((s, a) => s - a.balance, 0)
  const net = accounts.reduce((s, a) => s + a.balance, 0)

  const rows = (list: AccountWithBalance[]) =>
    list.map((a) => {
      const Icon = ACCOUNT_ICONS[a.type]
      return (
        <tr key={a.id}>
          <td>
            <button
              type="button"
              className="link"
              aria-label={`Open ${a.name}`}
              onClick={() => onOpen(a.id)}
              style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}
            >
              <Icon size={16} aria-hidden="true" />
              {a.name}
            </button>
          </td>
          <td className="subtle" style={{ width: 180 }}>
            {accountTypeLabel(a.type)}
          </td>
          <td className={a.balance < 0 && !isLiability(a.type) ? 'num neg' : 'num'}>
            {balanceText(a.type, a.balance)}
          </td>
          <td className="actions" style={{ width: 150, textAlign: 'right' }}>
            <button
              type="button"
              className="small"
              aria-label={`Edit account ${a.name}`}
              onClick={() => onEdit(a.id)}
            >
              <Pencil size={14} />
              Edit account
            </button>
          </td>
        </tr>
      )
    })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageActions>
        <button type="button" className="primary" onClick={onAdd}>
          <Plus size={16} />
          Add account
        </button>
      </PageActions>
      <div className="card">
        <table>
          <tbody>
            <tr>
              <td>Assets</td>
              <td className="num">{formatCents(assets)}</td>
            </tr>
            <tr>
              <td>Owing on cards and loans</td>
              <td className="num">{formatCents(owing)}</td>
            </tr>
            <tr>
              <td>
                <strong>Net worth</strong>
              </td>
              <td className="num">
                <strong>{formatCents(net)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {ACCOUNT_GROUPS.map((g) => {
        const list = accounts.filter((a) => g.types.includes(a.type))
        if (list.length === 0) return null
        return (
          <div className="card" key={g.label}>
            <div className="card-header">
              <h3>{g.label}</h3>
            </div>
            <table style={{ tableLayout: 'fixed' }}>
              <tbody>{rows(list)}</tbody>
            </table>
          </div>
        )
      })}
      {archived.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>Archived</h3>
          </div>
          <table style={{ tableLayout: 'fixed' }}>
            <tbody>{rows(archived)}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
