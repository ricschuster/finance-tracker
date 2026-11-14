/**
 * Fuzzy text matching for the "similar to" rule operator. Deliberately simple so a rule can be
 * explained in one sentence: every word of the pattern must appear in the text, in any order,
 * allowing a typo or two per word (more for longer words). Digits, punctuation and store
 * numbers are ignored, so "SAFEWAY #4412" and "safeway store 9" both match "safeway".
 */

/** Lowercase words made of letters only; digits and punctuation split and are dropped. */
export function fuzzyWords(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((w) => w.length > 0)
}

/** Typos allowed for a pattern word: none for short words, one up to 8 letters, then two. */
export function allowedEdits(len: number): number {
  return len <= 4 ? 0 : len <= 8 ? 1 : 2
}

/** Damerau-Levenshtein (adjacent swap counts as one edit), with an early exit past `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const rows: number[][] = []
  for (let i = 0; i <= a.length; i++) {
    rows.push(new Array<number>(b.length + 1).fill(0))
    rows[i]![0] = i
  }
  for (let j = 0; j <= b.length; j++) rows[0]![j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let d = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, rows[i - 2]![j - 2]! + 1)
      }
      rows[i]![j] = d
    }
  }
  return rows[a.length]![b.length]!
}

/** True when every word of `pattern` has a close match among the words of `text`. */
export function fuzzyMatches(text: string, pattern: string): boolean {
  const need = fuzzyWords(pattern)
  if (need.length === 0) return false
  const have = fuzzyWords(text)
  return need.every((n) => {
    const max = allowedEdits(n.length)
    return have.some((h) => editDistance(h, n, max) <= max)
  })
}
