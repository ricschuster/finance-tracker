import { useState } from 'react'
import { CATEGORY_COLORS } from '../../core/ledger/categoryStyle'
import { formatCents } from '../../core/money'
import { percent } from './Bars'

export interface PieSlice {
  categoryId: number
  name: string
  /** Positive spending in cents. */
  amount: number
  color?: string | null
}

const SIZE = 180
const STROKE = 34
const R = (SIZE - STROKE) / 2
const CIRC = 2 * Math.PI * R

/**
 * A donut of spending by category with a legend. Slices and legend rows are
 * buttons, so both can be clicked or activated with Enter or Space. Pass only
 * positive amounts; a pie cannot show negatives.
 */
export function SpendingPie({
  slices,
  onSelect,
}: {
  slices: PieSlice[]
  onSelect: (categoryId: number) => void
}) {
  const [active, setActive] = useState<number | null>(null)
  const total = slices.reduce((s, x) => s + x.amount, 0)
  if (total <= 0) return null
  const colored = slices.map((s, i) => ({
    ...s,
    fill: s.color ?? CATEGORY_COLORS[i % CATEGORY_COLORS.length],
  }))
  let offset = 0
  const arcs = colored.map((s) => {
    const len = (s.amount / total) * CIRC
    const arc = { ...s, len, start: offset }
    offset += len
    return arc
  })
  const shown = colored.find((s) => s.categoryId === active)
  const describe = (s: PieSlice) =>
    `${s.name}, ${formatCents(s.amount)}, ${percent(s.amount / total)} of spending. Show transactions`

  return (
    <div className="pie">
      <div className="pie-chart">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width={SIZE}
          height={SIZE}
          role="group"
          aria-label="Spending by category"
        >
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {arcs.map((a) => (
              <circle
                key={a.categoryId}
                className={`pie-slice${active === a.categoryId ? ' active' : ''}`}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={a.fill}
                strokeWidth={STROKE}
                strokeDasharray={`${Math.max(a.len - (arcs.length > 1 ? 1 : 0), 0.5)} ${CIRC}`}
                strokeDashoffset={-a.start}
                role="button"
                tabIndex={0}
                aria-label={describe(a)}
                onClick={() => onSelect(a.categoryId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(a.categoryId)
                  }
                }}
                onMouseEnter={() => setActive(a.categoryId)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(a.categoryId)}
                onBlur={() => setActive(null)}
              />
            ))}
          </g>
        </svg>
        <div className="pie-center" aria-hidden="true">
          <strong>{formatCents(shown ? shown.amount : total)}</strong>
          <span className="subtle">{shown ? shown.name : 'Spent'}</span>
        </div>
      </div>
      <ul className="pie-legend">
        {colored.map((s) => (
          <li key={s.categoryId}>
            <button
              type="button"
              className="pie-legend-row"
              aria-label={describe(s)}
              onClick={() => onSelect(s.categoryId)}
              onMouseEnter={() => setActive(s.categoryId)}
              onMouseLeave={() => setActive(null)}
            >
              <span className="pie-swatch" style={{ background: s.fill }} aria-hidden="true" />
              <span className="pie-name">{s.name}</span>
              <span className="spacer" />
              <span className="num">{formatCents(s.amount)}</span>
              <span className="subtle pie-pct">{percent(s.amount / total)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
