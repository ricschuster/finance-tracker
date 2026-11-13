import { describe, expect, it } from 'vitest'
import { looksLikeOfx, parseOfx } from './ofx'

const sgml = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>CAD
<BANKACCTFROM><BANKID>123<ACCTID>9988<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260108120000[-5:EST]
<TRNAMT>-45.00
<FITID>A1
<NAME>SAFEWAY #4412
<MEMO>POS PURCHASE
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260109
<TRNAMT>2000.5
<FITID>A2
<NAME>PAYROLL
</STMTTRN>
<STMTTRN>
<DTPOSTED>2026
<TRNAMT>1
</STMTTRN>
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`

const xml = `<?xml version="1.0"?><OFX><STMTRS><CURDEF>USD</CURDEF><ACCTID>77</ACCTID>
<STMTTRN><DTPOSTED>20260110</DTPOSTED><TRNAMT>-1,25</TRNAMT><FITID>X</FITID><NAME>A &amp; B</NAME><CHECKNUM>101</CHECKNUM></STMTTRN></STMTRS></OFX>`

describe('parseOfx', () => {
  it('parses SGML with signed amounts, ids and timezones', () => {
    expect(looksLikeOfx(sgml)).toBe(true)
    const s = parseOfx(sgml)
    expect(s).toMatchObject({ accountId: '9988', currency: 'CAD' })
    expect(s.candidates.map((c) => [c.date, c.amount, c.externalId, c.rawDescription])).toEqual([
      ['2026-01-08', -4500, 'A1', 'SAFEWAY #4412 POS PURCHASE'],
      ['2026-01-09', 200050, 'A2', 'PAYROLL'],
    ])
    expect(s.errors).toEqual([{ line: 3, message: 'Invalid date "2026"' }])
  })
  it('parses XML, entities and comma decimals', () => {
    const s = parseOfx(xml)
    expect(s.currency).toBe('USD')
    expect(s.candidates[0]).toMatchObject({ amount: -125, rawDescription: 'A & B' })
  })
  it('does not treat CSV as OFX', () => {
    expect(looksLikeOfx('Date,Desc\n1,2')).toBe(false)
  })
})
