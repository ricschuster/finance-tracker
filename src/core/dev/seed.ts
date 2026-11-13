import type Database from 'better-sqlite3'
import { createAccount, type AccountType } from '../ledger/accounts'
import { createTransaction, createTransfer, type LineInput } from '../ledger/transactions'

/** Deterministic PRNG so the demo data is the same every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DAY = 86_400_000
const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const fromDate = (d: string) => Date.parse(`${d}T00:00:00Z`)

interface Merchant {
  raw: string
  payee: string
  category: string
  /** Typical spend in cents, inclusive range. */
  min: number
  max: number
}

const GROCERS: Merchant[] = [
  {
    raw: 'SAFEWAY #4412 VANCOUVER BC',
    payee: 'Safeway',
    category: 'Groceries',
    min: 2400,
    max: 14500,
  },
  {
    raw: 'SUPERSTORE 1578 BURNABY BC',
    payee: 'Real Canadian Superstore',
    category: 'Groceries',
    min: 3500,
    max: 18000,
  },
  { raw: 'TRADER JOES #123', payee: '', category: 'Groceries', min: 1800, max: 9000 },
  { raw: 'FARMERS MKT SAT', payee: '', category: 'Groceries', min: 1500, max: 5500 },
]
const DINING: Merchant[] = [
  {
    raw: 'TIM HORTONS #0921',
    payee: 'Tim Hortons',
    category: 'Coffee Shops',
    min: 300,
    max: 1400,
  },
  { raw: 'STARBUCKS 08812', payee: 'Starbucks', category: 'Coffee Shops', min: 450, max: 1800 },
  { raw: 'SQ *PHO HOUSE', payee: '', category: 'Restaurants', min: 1800, max: 4800 },
  {
    raw: 'DOORDASH*THAI EXPRESS',
    payee: 'DoorDash',
    category: 'Food Delivery',
    min: 2800,
    max: 6500,
  },
  { raw: 'THE KEG STEAKHOUSE', payee: 'The Keg', category: 'Restaurants', min: 6500, max: 16000 },
]
const TRANSPORT: Merchant[] = [
  {
    raw: 'SHELL C28812 BURNABY',
    payee: 'Shell',
    category: 'Gas & Fuel',
    min: 4500,
    max: 9500,
  },
  {
    raw: 'COMPASS TOPUP TRANSLINK',
    payee: 'TransLink',
    category: 'Public Transit',
    min: 2000,
    max: 5000,
  },
  { raw: 'IMPARK 0334 PARKING', payee: '', category: 'Parking', min: 500, max: 2400 },
]
const SHOPPING: Merchant[] = [
  {
    raw: 'AMZN MKTP CA*2K4TY8',
    payee: 'Amazon',
    category: 'Online Shopping',
    min: 1200,
    max: 14000,
  },
  {
    raw: 'CANADIAN TIRE #512',
    payee: 'Canadian Tire',
    category: 'Home Improvement',
    min: 900,
    max: 12000,
  },
  {
    raw: 'LONDON DRUGS #28',
    payee: 'London Drugs',
    category: 'Pharmacy',
    min: 700,
    max: 6500,
  },
  { raw: 'WINNERS STORE 1180', payee: '', category: 'Clothing', min: 2500, max: 9000 },
  { raw: 'IKEA VANCOUVER', payee: 'IKEA', category: 'Furnishings', min: 2000, max: 30000 },
]
const FUN: Merchant[] = [
  { raw: 'CINEPLEX #7011', payee: 'Cineplex', category: 'Movies & Events', min: 1400, max: 4200 },
  { raw: 'STEAM PURCHASE', payee: 'Steam', category: 'Games', min: 1000, max: 6000 },
  { raw: 'ROGERS ARENA TICKETS', payee: '', category: 'Movies & Events', min: 6000, max: 22000 },
]
const SUBSCRIPTIONS: (Merchant & { day: number })[] = [
  { raw: 'NETFLIX.COM', payee: 'Netflix', category: 'Subscriptions', min: 1699, max: 1699, day: 6 },
  {
    raw: 'SPOTIFY P1A2B3',
    payee: 'Spotify',
    category: 'Subscriptions',
    min: 1199,
    max: 1199,
    day: 11,
  },
  {
    raw: 'GOODLIFE FITNESS',
    payee: 'GoodLife Fitness',
    category: 'Gym & Sports',
    min: 4999,
    max: 4999,
    day: 3,
  },
  {
    raw: 'TELUS MOBILITY',
    payee: 'Telus',
    category: 'Mobile Phone',
    min: 7500,
    max: 7500,
    day: 17,
  },
  {
    raw: 'SHAW CABLESYSTEMS',
    payee: 'Shaw',
    category: 'Internet',
    min: 8900,
    max: 8900,
    day: 20,
  },
]

export interface SeedOptions {
  /** ISO date treated as "today". Defaults to the real date. */
  today?: string
  /** Months of history to generate, ending at `today`. */
  months?: number
  seed?: number
}

export interface SeedSummary {
  accounts: number
  transactions: number
}

/**
 * Fill an empty database with realistic synthetic data (never real transactions).
 * Throws if any account already exists, so it can't pollute a real ledger.
 */
export function seedDemoData(db: Database.Database, opts: SeedOptions = {}): SeedSummary {
  const exists = db.prepare('SELECT 1 FROM accounts LIMIT 1').get()
  if (exists) throw new Error('Refusing to seed: the database already has accounts')

  const rand = mulberry32(opts.seed ?? 42)
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1))
  const pick = <T>(xs: readonly T[]): T => xs[int(0, xs.length - 1)] as T
  /** Round to the nearest 5 cents so amounts look like receipts, not noise. */
  const cents = (lo: number, hi: number) => Math.round(int(lo, hi) / 5) * 5

  const today = fromDate(opts.today ?? new Date().toISOString().slice(0, 10))
  const start = today - (opts.months ?? 12) * 30 * DAY
  const cat = (name: string) => {
    const c = db.prepare('SELECT id FROM categories WHERE name = ?').get(name) as
      { id: number } | undefined
    if (!c) throw new Error(`Missing starter category ${name}`)
    return c.id
  }

  return db.transaction(() => {
    const mk = (name: string, type: AccountType, openingBalance: number) =>
      createAccount(db, { name, type, openingBalance })
    const chequing = mk('Chequing', 'checking', 850_000)
    const savings = mk('Savings', 'savings', 1_500_000)
    const visa = mk('Visa', 'credit_card', -120_000)
    const cash = mk('Wallet', 'cash', 15_000)

    let count = 0
    type Spend = {
      accountId: number
      date: string
      amount: number
      m: Merchant
      lines?: LineInput[]
      tags?: string[]
    }
    const add = (s: Spend) => {
      const pending = fromDate(s.date) > today - 2 * DAY
      createTransaction(db, {
        accountId: s.accountId,
        date: s.date,
        amount: s.amount,
        rawDescription: s.m.raw,
        payee: s.m.payee,
        status: pending ? 'pending' : 'cleared',
        lines: s.lines ?? [{ categoryId: cat(s.m.category), amount: s.amount }],
        tags: s.tags,
      })
      count++
    }
    const spend = (m: Merchant, date: string, accountId: number, tags?: string[]) =>
      add({ accountId, date, amount: -cents(m.min, m.max), m, tags })

    // Fixed monthly items and income, walking month by month.
    for (let cursor = start; cursor <= today; cursor += DAY) {
      const date = toDate(cursor)
      const d = new Date(cursor)
      const dom = d.getUTCDate()
      const dow = d.getUTCDay()

      // Paycheque every second Friday from the start date's first Friday.
      if (dow === 5 && Math.floor((cursor - start) / DAY / 7) % 2 === 0) {
        createTransaction(db, {
          accountId: chequing,
          date,
          amount: 205_075,
          rawDescription: 'PAYROLL DEPOSIT ACME CORP',
          payee: 'Acme Corp',
          lines: [{ categoryId: cat('Paycheque'), amount: 205_075 }],
        })
        count++
      }
      if (dom === 1) {
        add({
          accountId: chequing,
          date,
          amount: -165_000,
          m: {
            raw: 'E-TRANSFER RENT MAPLE PROPERTIES',
            payee: 'Maple Properties',
            category: 'Rent',
            min: 0,
            max: 0,
          },
        })
      }
      if (dom === 2) {
        createTransfer(db, {
          fromAccountId: chequing,
          toAccountId: cash,
          date,
          amount: 6_000,
          description: 'ATM withdrawal',
        })
        count += 2
      }
      if (dom === 12) {
        add({
          accountId: chequing,
          date,
          amount: -cents(6000, 14000),
          m: {
            raw: 'BC HYDRO BILL PAYMENT',
            payee: 'BC Hydro',
            category: 'Electricity',
            min: 0,
            max: 0,
          },
        })
      }
      if (dom === 15) {
        createTransfer(db, {
          fromAccountId: chequing,
          toAccountId: savings,
          date,
          amount: 40_000,
          description: 'Savings',
        })
        count += 2
        // Pay down the card with roughly last month's spend.
        const owed = Math.max(-accountBalanceOf(db, visa), 0)
        const payment = Math.min(owed, 200_000)
        if (payment > 0) {
          createTransfer(db, {
            fromAccountId: chequing,
            toAccountId: visa,
            date,
            amount: payment,
            description: 'Visa payment',
          })
          count += 2
        }
      }
      for (const s of SUBSCRIPTIONS)
        if (dom === s.day) spend(s, date, s.category === 'Entertainment' ? visa : chequing)

      // Day-to-day spending.
      if (dow === 6 || (dow === 3 && rand() < 0.6))
        spend(pick(GROCERS), date, rand() < 0.7 ? visa : chequing)
      if (rand() < 0.35) spend(pick(DINING), date, rand() < 0.8 ? visa : cash)
      if (rand() < 0.12) spend(pick(TRANSPORT), date, visa)
      if (rand() < 0.09) spend(pick(SHOPPING), date, visa)
      if (rand() < 0.04) spend(pick(FUN), date, visa)

      // A Costco run now and then, split between groceries and household goods.
      if (dow === 0 && rand() < 0.25) {
        const groceries = cents(9000, 16000)
        const household = cents(2500, 9000)
        add({
          accountId: visa,
          date,
          amount: -(groceries + household),
          m: {
            raw: 'COSTCO WHOLESALE W123',
            payee: 'Costco',
            category: 'Groceries',
            min: 0,
            max: 0,
          },
          lines: [
            { categoryId: cat('Groceries'), amount: -groceries },
            { categoryId: cat('Furnishings'), amount: -household, memo: 'household' },
          ],
        })
      }
    }

    // A tagged trip and a couple of one-offs so tags and large amounts show up.
    const tripStart = toDate(today - 75 * DAY)
    const trip: Merchant[] = [
      {
        raw: 'AIR CANADA 0142',
        payee: 'Air Canada',
        category: 'Flights',
        min: 38_000,
        max: 38_000,
      },
      {
        raw: 'AIRBNB * HM4K2',
        payee: 'Airbnb',
        category: 'Hotels & Lodging',
        min: 52_000,
        max: 52_000,
      },
      { raw: 'AVIS RENT A CAR', payee: '', category: 'Rental Car', min: 28_500, max: 28_500 },
    ]
    for (const m of trip) spend(m, tripStart, visa, ['trip', 'summer'])
    add({
      accountId: visa,
      date: toDate(today - 40 * DAY),
      amount: -cents(1500, 2500),
      m: { raw: 'ANNUAL FEE', payee: 'Visa', category: 'Annual Fees', min: 0, max: 0 },
    })
    add({
      accountId: chequing,
      date: toDate(today - 20 * DAY),
      amount: -25_000,
      m: { raw: 'E-TRANSFER GIFT MOM', payee: '', category: 'Gifts', min: 0, max: 0 },
      tags: ['birthday'],
    })

    return { accounts: 4, transactions: count }
  })()
}

function accountBalanceOf(db: Database.Database, id: number): number {
  const row = db
    .prepare(
      `SELECT opening_balance + COALESCE((SELECT SUM(amount) FROM transactions WHERE account_id = ?), 0) AS b
       FROM accounts WHERE id = ?`,
    )
    .get(id, id) as { b: number }
  return row.b
}
