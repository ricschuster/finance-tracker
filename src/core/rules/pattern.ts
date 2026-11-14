/**
 * Reduce a raw bank description to a stable matching phrase: drop reference numbers and store
 * numbers, keep the first three words. Returns '' when nothing usable is left.
 */
export function suggestPattern(raw: string): string {
  const words = raw
    .replace(/#\s*\d+/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !/\d/.test(w) && /[\p{L}]/u.test(w))
  return words.slice(0, 3).join(' ')
}
