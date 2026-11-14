import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { migrate } from '../db/migrations'
import { accountBalance, createAccount, createTransaction, getTransaction } from './index'
import { findTransferPairs, linkTransferPair } from './transferPairs'

let db: Database.Database
beforeEach(() => {
  db = new Database(':memory:')
  migrate(db)
})

describe('card payments and balances', () => {
  it('an unlinked payment leaves the card owing, and linking does not change balances', () => {
    const chq = createAccount(db, { name: 'Chequing', type: 'checking', openingBalance: 100_000 })
    const card = createAccount(db, { name: 'Visa', type: 'credit_card' })
    createTransaction(db, { accountId: card, date: '2026-02-01', amount: -30_000, payee: 'Shop' })
    const out = createTransaction(db, {
      accountId: chq,
      date: '2026-02-10',
      amount: -30_000,
      payee: 'MB-CREDIT CARD/LOC PAY.',
    })
    // Only the chequing side exists: the card still owes the full amount.
    expect(accountBalance(db, card)).toBe(-30_000)
    const inn = createTransaction(db, {
      accountId: card,
      date: '2026-02-11',
      amount: 30_000,
      payee: 'PAYMENT - THANK YOU',
    })
    expect(accountBalance(db, card)).toBe(0)
    expect(accountBalance(db, chq)).toBe(70_000)
    const pairs = findTransferPairs(db)
    expect(pairs).toHaveLength(1)
    expect(pairs[0]!.from.id).toBe(out)
    expect(pairs[0]!.to.id).toBe(inn)
    linkTransferPair(db, out, inn)
    expect(getTransaction(db, out)!.transferPeerId).toBe(inn)
    expect(getTransaction(db, inn)!.lines[0]!.categoryName).toBe('Transfer')
    expect(findTransferPairs(db)).toHaveLength(0)
    expect(accountBalance(db, card)).toBe(0)
  })

  it('does not pair unrelated amounts, distant dates, or rows without payment wording', () => {
    const chq = createAccount(db, { name: 'Chequing', type: 'checking' })
    const card = createAccount(db, { name: 'Visa', type: 'credit_card' })
    createTransaction(db, { accountId: card, date: '2026-02-01', amount: 5_000, payee: 'Payment' })
    createTransaction(db, { accountId: chq, date: '2026-02-01', amount: -5_001, payee: 'Payment' })
    createTransaction(db, { accountId: chq, date: '2026-02-20', amount: -5_000, payee: 'Payment' })
    createTransaction(db, { accountId: card, date: '2026-03-01', amount: 700, payee: 'Refund' })
    createTransaction(db, { accountId: chq, date: '2026-03-01', amount: -700, payee: 'Coffee' })
    expect(findTransferPairs(db)).toEqual([])
  })

  it('uses each row once and prefers the closest dates', () => {
    const chq = createAccount(db, { name: 'Chequing', type: 'checking' })
    const card = createAccount(db, { name: 'Visa', type: 'credit_card' })
    const c1 = createTransaction(db, {
      accountId: card,
      date: '2026-02-01',
      amount: 1000,
      payee: 'Payment',
    })
    const c2 = createTransaction(db, {
      accountId: card,
      date: '2026-02-03',
      amount: 1000,
      payee: 'Payment',
    })
    const d1 = createTransaction(db, {
      accountId: chq,
      date: '2026-02-01',
      amount: -1000,
      payee: 'Visa pay',
    })
    const d2 = createTransaction(db, {
      accountId: chq,
      date: '2026-02-03',
      amount: -1000,
      payee: 'Visa pay',
    })
    const pairs = findTransferPairs(db).map((p) => [p.from.id, p.to.id])
    expect(pairs).toEqual([
      [d1, c1],
      [d2, c2],
    ])
  })

  it('refuses to link same-account, same-sign or already linked rows', () => {
    const chq = createAccount(db, { name: 'Chequing', type: 'checking' })
    const card = createAccount(db, { name: 'Visa', type: 'credit_card' })
    const a = createTransaction(db, { accountId: chq, date: '2026-02-01', amount: -1000 })
    const b = createTransaction(db, { accountId: chq, date: '2026-02-01', amount: 1000 })
    const c = createTransaction(db, { accountId: card, date: '2026-02-01', amount: 1000 })
    expect(() => linkTransferPair(db, a, b)).toThrow('different accounts')
    expect(() => linkTransferPair(db, b, c)).toThrow('opposite')
    linkTransferPair(db, a, c)
    expect(() => linkTransferPair(db, a, c)).toThrow('Already')
  })
})
