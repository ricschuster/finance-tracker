// Generates large synthetic import files into test-data/import/large/.
// Deterministic (seeded), so reruns produce identical output.
// Usage: node test-data/generate-large.mjs [rowsPerFile]
import process from 'node:process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const N = Number(process.argv[2] ?? 2000)
const out = join(dirname(fileURLToPath(import.meta.url)), 'import', 'large')
mkdirSync(out, { recursive: true })

let seed = 42
const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32
const pick = (a) => a[Math.floor(rand() * a.length)]

// [raw description, mint payee, mint category, min, max]
const merchants = [
  ['SAFEWAY #4412', 'Safeway', 'Groceries', 20, 180],
  ['COSTCO WHOLESALE', 'Costco', 'Groceries', 60, 320],
  ['SHELL GAS 1182', 'Shell', 'Gas & Fuel', 30, 90],
  ['TIM HORTONS #221', 'Tim Hortons', 'Coffee Shops', 3, 15],
  ['STARBUCKS #8841', 'Starbucks', 'Coffee Shops', 4, 12],
  ['NETFLIX.COM', 'Netflix', 'Television', 16.99, 16.99],
  ['SPOTIFY', 'Spotify', 'Music', 12.99, 12.99],
  ['CITY HYDRO', 'City Hydro', 'Utilities', 70, 140],
  ['PHARMASAVE #310', 'Pharmasave', 'Pharmacy', 8, 70],
  ['AMAZON.CA', 'Amazon', 'Shopping', 10, 150],
  ['UBER EATS', 'Uber Eats', 'Restaurants', 18, 60],
  ['LANDLORD E-TRANSFER', 'Landlord', 'Rent', 1500, 1500],
  ['PETRO CANADA 77', 'Petro-Canada', 'Gas & Fuel', 30, 85],
  ['WEIRD SHOP 99', 'Weird Shop', 'Obscure Category', 5, 60],
]

const pad = (n) => String(n).padStart(2, '0')
const start = Date.UTC(2024, 0, 1)
const span = 730 // two years
const rows = []
for (let i = 0; i < N; i++) {
  const d = new Date(start + Math.floor(rand() * span) * 86400000)
  const income = rand() < 0.04
  const m = income ? ['PAYROLL ACME CORP', 'Acme Corp', 'Paycheck', 1800, 2800] : pick(merchants)
  const amt = Math.round((m[3] + rand() * (m[4] - m[3])) * 100) / 100
  rows.push({ d, raw: m[0], payee: m[1], cat: m[2], amt, income, id: i + 1 })
}
rows.sort((a, b) => a.d - b.d || a.id - b.id)

const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const us = (d) => `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${d.getUTCFullYear()}`
const mint = (d) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`
const signed = (r) => (r.income ? r.amt : -r.amt).toFixed(2)

writeFileSync(
  join(out, 'generic-large.csv'),
  'Date,Description,Amount\n' +
    rows.map((r) => `${iso(r.d)},${r.raw},${signed(r)}`).join('\n') +
    '\n',
)
writeFileSync(
  join(out, 'debit-credit-large.csv'),
  'Posted,Details,Debit,Credit\n' +
    rows
      .map(
        (r) =>
          `${us(r.d)},${r.raw},${r.income ? '' : r.amt.toFixed(2)},${r.income ? r.amt.toFixed(2) : ''}`,
      )
      .join('\n') +
    '\n',
)
writeFileSync(
  join(out, 'mint-large.csv'),
  '"Date","Description","Original Description","Amount","Transaction Type","Category","Account Name","Labels","Notes"\n' +
    rows
      .map(
        (r, i) =>
          `"${mint(r.d)}","${r.payee}","${r.raw}","${r.amt.toFixed(2)}","${r.income ? 'credit' : 'debit'}","${r.cat}","${i % 3 === 0 ? 'Sample Visa' : 'Sample Chequing'}","",""`,
      )
      .join('\n') +
    '\n',
)
const ofx =
  `OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nSECURITY:NONE\nENCODING:USASCII\nCHARSET:1252\nCOMPRESSION:NONE\nOLDFILEUID:NONE\nNEWFILEUID:NONE\n\n<OFX>\n<BANKMSGSRSV1><STMTTRNRS><STMTRS>\n<CURDEF>CAD\n<BANKACCTFROM><BANKID>000111<ACCTID>SAMPLE0002<ACCTTYPE>CHECKING</BANKACCTFROM>\n<BANKTRANLIST>\n` +
  rows
    .map(
      (r) =>
        `<STMTTRN>\n<TRNTYPE>${r.income ? 'CREDIT' : 'DEBIT'}\n<DTPOSTED>${iso(r.d).replaceAll('-', '')}120000[-5:EST]\n<TRNAMT>${signed(r)}\n<FITID>LARGE-${String(r.id).padStart(6, '0')}\n<NAME>${r.raw}\n</STMTTRN>`,
    )
    .join('\n') +
  `\n</BANKTRANLIST>\n</STMTRS></STMTTRNRS></BANKMSGSRSV1>\n</OFX>\n`
writeFileSync(join(out, 'statement-large.ofx'), ofx)
writeFileSync(join(out, 'statement-large.qfx'), ofx)
process.stdout.write(`Wrote ${N} rows per file to ${out}\n`)
