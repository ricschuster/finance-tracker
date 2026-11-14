import { describe, expect, it } from 'vitest'
import { editDistance, fuzzyMatches } from './fuzzy'

describe('fuzzyMatches', () => {
  it('ignores store numbers, punctuation and extra words', () => {
    expect(fuzzyMatches('SAFEWAY #4412 VANCOUVER BC', 'safeway')).toBe(true)
    expect(fuzzyMatches('Safeway Store 9', 'safeway')).toBe(true)
  })
  it('tolerates a typo in longer words', () => {
    expect(fuzzyMatches('SAFWAY 4412', 'safeway')).toBe(true)
    expect(fuzzyMatches('SAFEWYA 4412', 'safeway')).toBe(true)
    expect(fuzzyMatches('STARBUCKZ', 'starbucks')).toBe(true)
  })
  it('requires exact short words and every word of the pattern', () => {
    expect(fuzzyMatches('SHELL GAS', 'shall')).toBe(true) // 5 letters allow one typo
    expect(fuzzyMatches('IKEA', 'ikea')).toBe(true)
    expect(fuzzyMatches('IKEA', 'ikex')).toBe(false)
    expect(fuzzyMatches('TIM HORTONS', 'tim hortons')).toBe(true)
    expect(fuzzyMatches('HORTONS', 'tim hortons')).toBe(false)
  })
  it('matches words in any order and never matches an empty pattern', () => {
    expect(fuzzyMatches('HORTONS TIM', 'tim hortons')).toBe(true)
    expect(fuzzyMatches('anything', '  #12 ')).toBe(false)
  })
  it('counts an adjacent swap as one edit', () => {
    expect(editDistance('ab', 'ba', 1)).toBe(1)
  })
})
