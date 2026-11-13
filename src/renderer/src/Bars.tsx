/** A horizontal CSS bar, `fraction` is 0 to 1 of the track width. */
export function Bar({ fraction, tone = 'neg' }: { fraction: number; tone?: 'neg' | 'pos' }) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100
  return (
    <span className="bar-track" aria-hidden="true">
      <span className={`bar-fill bar-${tone}`} style={{ width: `${pct}%` }} />
    </span>
  )
}

export const percent = (x: number) => `${Math.round(x * 100)}%`
