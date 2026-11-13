import { describe, expect, it } from 'vitest'
import { decodeBytes, guessHeaderRow, parseCsv, sniffDelimiter } from './csv'

describe('parseCsv', () => {
  it('handles quotes, doubled quotes and embedded newlines', () => {
    const { rows } = parseCsv('a,b\n"x, y","say ""hi"""\n"line1\nline2",z\n')
    expect(rows).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['line1\nline2', 'z'],
    ])
  })
  it('skips blank lines and allows ragged rows', () => {
    const { rows } = parseCsv('a,b,c\n\n1,2\n\n3,4,5,6\n')
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', '2'],
      ['3', '4', '5', '6'],
    ])
  })
  it('sniffs semicolons and tabs', () => {
    expect(sniffDelimiter('a;b;c\n1;2;3\n')).toBe(';')
    expect(sniffDelimiter('a\tb\n1\t2\n')).toBe('\t')
    expect(sniffDelimiter('"a;b",c\n"1;2",3\n')).toBe(',')
  })
})

describe('decodeBytes', () => {
  it('strips a UTF-8 BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x61])
    expect(decodeBytes(bytes)).toBe('a')
  })
  it('falls back to Windows-1252', () => {
    expect(decodeBytes(new Uint8Array([0x43, 0x61, 0x66, 0xe9]))).toBe('Café')
  })
  it('rejects oversized files', () => {
    expect(() => decodeBytes(new Uint8Array(20 * 1024 * 1024 + 1))).toThrow(/larger/)
  })
})

describe('guessHeaderRow', () => {
  it('skips a preamble narrower than the data', () => {
    expect(guessHeaderRow([['Account: 123'], ['Date', 'Desc', 'Amt'], ['1', '2', '3']])).toBe(1)
  })
})
