import type { Candidate, RowIssue } from './mapping'

export interface OfxStatement {
  accountId: string | null
  currency: string | null
  candidates: Candidate[]
  errors: RowIssue[]
}

export function looksLikeOfx(text: string): boolean {
  const head = text.slice(0, 2000)
  return /OFXHEADER\s*:/i.test(head) || /<OFX[\s>]/i.test(head)
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Value of the first `<TAG>` in a block. Works for SGML (no closing tag) and XML alike. */
function tag(block: string, name: string): string | null {
  const m = new RegExp(`<${name}>([^<\\r\\n]*)`, 'i').exec(block)
  return m ? decodeEntities(m[1]!.trim()) : null
}

/** OFX amounts use a dot, but some exports use a comma decimal. Returns signed integer cents. */
function amountToCents(raw: string): number {
  let s = raw.trim()
  if (/^-?\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.')
  const m = /^([+-]?)(\d*)(?:\.(\d{1,2})\d*)?$/.exec(s)
  if (!m || (m[2] === '' && m[3] === undefined)) throw new Error(`Invalid amount "${raw}"`)
  const cents = Number(m[2] || '0') * 100 + Number((m[3] ?? '').padEnd(2, '0'))
  return m[1] === '-' ? -cents : cents
}

/** `DTPOSTED` is YYYYMMDD optionally followed by a time and zone; only the date part is used. */
function ofxDate(raw: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(raw.trim())
  if (!m) throw new Error(`Invalid date "${raw}"`)
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) throw new Error(`Invalid date "${raw}"`)
  return `${m[1]}-${m[2]}-${m[3]}`
}

/** Parse the first statement in an OFX/QFX file (SGML v1 or XML v2). TRNAMT is already signed as we want. */
export function parseOfx(text: string): OfxStatement {
  const body = text.slice(Math.max(0, text.search(/<OFX/i)))
  const out: OfxStatement = {
    accountId: tag(body, 'ACCTID'),
    currency: tag(body, 'CURDEF'),
    candidates: [],
    errors: [],
  }
  const blocks = body.split(/<STMTTRN>/i).slice(1)
  blocks.forEach((raw, i) => {
    const block = raw.split(/<\/STMTTRN>/i)[0]!
    const line = i + 1
    try {
      const posted = tag(block, 'DTPOSTED')
      const amt = tag(block, 'TRNAMT')
      if (!posted) throw new Error('Missing DTPOSTED')
      if (amt === null) throw new Error('Missing TRNAMT')
      const name = tag(block, 'NAME')
      const memo = tag(block, 'MEMO')
      const check = tag(block, 'CHECKNUM')
      const description = [name, memo && memo !== name ? memo : null].filter(Boolean).join(' ')
      out.candidates.push({
        line,
        date: ofxDate(posted),
        amount: amountToCents(amt),
        rawDescription: description || (check ? `Cheque ${check}` : ''),
        payee: '',
        memo: '',
        externalId: tag(block, 'FITID') || null,
        status: 'cleared',
      })
    } catch (e) {
      out.errors.push({ line, message: e instanceof Error ? e.message : String(e) })
    }
  })
  return out
}
