import { parseAmountToCents, sanityWarnings } from '../../core/money'

export function safeCents(amount: string): number {
  try {
    return parseAmountToCents(amount)
  } catch {
    return 0
  }
}

/** Non-blocking warning shown before a save the user must confirm ("Save anyway"). */
export function SanityNotice({ cents, date }: { cents: number; date: string }) {
  return (
    <div className="notice" role="status">
      {sanityWarnings(cents, date).map((w) => (
        <div key={w}>{w}</div>
      ))}
      <div>Check it is right, or press Save anyway to continue.</div>
    </div>
  )
}
