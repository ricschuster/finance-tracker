import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrate } from '../db/migrations'
import { createLedgerHandlers } from './handlers'
import { LEDGER_METHODS } from './methods'

function setup() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return createLedgerHandlers(db)
}

describe('ledger handlers', () => {
  it('implements exactly the advertised methods', () => {
    expect(Object.keys(setup()).sort()).toEqual([...LEDGER_METHODS].sort())
  })

  it('lists accounts with balances', () => {
    const api = setup()
    const id = api.createAccount({ name: 'Chequing', type: 'checking', openingBalance: 1_000 })
    api.createTransaction({ accountId: id, date: '2026-11-01', amount: -250 })
    expect(api.listAccounts()).toMatchObject([{ name: 'Chequing', balance: 750 }])
  })

  it('returns null for a missing transaction and lists tags in use', () => {
    const api = setup()
    expect(api.getTransaction(42)).toBeNull()
    const id = api.createAccount({ name: 'A', type: 'cash' })
    api.createTransaction({ accountId: id, date: '2026-11-01', amount: -1, tags: ['b', 'a'] })
    expect(api.listTags()).toEqual(['a', 'b'])
  })

  it('returns structured-clone-safe results', () => {
    const api = setup()
    const id = api.createAccount({ name: 'A', type: 'cash' })
    api.createTransaction({ accountId: id, date: '2026-11-01', amount: -1 })
    expect(() => structuredClone(api.listTransactions())).not.toThrow()
  })
})
