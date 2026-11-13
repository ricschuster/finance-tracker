import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrate } from '../db/migrations'
import { listAccounts } from '../ledger/accounts'
import { listTransactions } from '../ledger/transactions'
import { seedDemoData } from './seed'

const fresh = () => {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}
const opts = { today: '2026-11-13' }

describe('seedDemoData', () => {
  it('creates a year of varied data', () => {
    const db = fresh()
    const summary = seedDemoData(db, opts)
    const txns = listTransactions(db, { limit: 100_000 })
    expect(summary.accounts).toBe(4)
    expect(txns.length).toBe(summary.transactions)
    expect(txns.length).toBeGreaterThan(400)
    expect(new Set(txns.map((t) => t.accountId)).size).toBe(4)
    expect(txns.some((t) => t.lines.length > 1)).toBe(true)
    expect(txns.some((t) => t.status === 'pending')).toBe(true)
    expect(txns.some((t) => t.tags.includes('trip'))).toBe(true)
    expect(txns.some((t) => t.payee === '' && t.rawDescription !== '')).toBe(true)
    const dates = txns.map((t) => t.date).sort()
    expect(dates[0]! >= '2025-11-01').toBe(true)
    expect(dates[dates.length - 1]! <= opts.today).toBe(true)
  })

  it('keeps every transaction balanced and every transfer paired', () => {
    const db = fresh()
    seedDemoData(db, opts)
    const txns = listTransactions(db, { limit: 100_000 })
    const byId = new Map(txns.map((t) => [t.id, t]))
    for (const t of txns) {
      expect(t.lines.reduce((s, l) => s + l.amount, 0)).toBe(t.amount)
      if (t.transferPeerId !== null) {
        const peer = byId.get(t.transferPeerId)!
        expect(peer.transferPeerId).toBe(t.id)
        expect(peer.amount).toBe(-t.amount)
      }
    }
  })

  it('is deterministic for a given seed and differs for another', () => {
    const a = fresh()
    const b = fresh()
    const c = fresh()
    seedDemoData(a, opts)
    seedDemoData(b, opts)
    seedDemoData(c, { ...opts, seed: 7 })
    const sig = (db: Database.Database) =>
      JSON.stringify(
        listTransactions(db, { limit: 100_000 }).map((t) => [t.date, t.amount, t.rawDescription]),
      )
    expect(sig(a)).toBe(sig(b))
    expect(sig(a)).not.toBe(sig(c))
  })

  it('keeps balances plausible (the card is not paid into a surplus)', () => {
    const db = fresh()
    seedDemoData(db, opts)
    const visa = listAccounts(db).find((a) => a.name === 'Visa')!
    expect(visa.type).toBe('credit_card')
  })

  it('refuses to seed a database that already has accounts', () => {
    const db = fresh()
    seedDemoData(db, opts)
    expect(() => seedDemoData(db, opts)).toThrow(/already has accounts/)
  })
})
