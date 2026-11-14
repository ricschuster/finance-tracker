import { useState, type ReactNode } from 'react'
import { formatCents } from '../../core/money'

/** A horizontal CSS bar, `fraction` is 0 to 1 of the track width. */
export function Bar({
  fraction,
  tone = 'neg',
  color,
}: {
  fraction: number
  tone?: 'neg' | 'pos' | 'accent' | 'warn'
  color?: string | null
}) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100
  return (
    <span className="bar-track" aria-hidden="true">
      <span
        className={`bar-fill bar-${tone}`}
        style={{ width: `${pct}%`, ...(color ? { background: color } : {}) }}
      />
    </span>
  )
}

export const percent = (x: number) => `${Math.round(x * 100)}%`

/** Whole dollars, compact for axis labels: $1.2k, $950. */
const axisMoney = (cents: number) => {
  const d = cents / 100
  if (Math.abs(d) >= 1000) return `$${(d / 1000).toFixed(d >= 10000 ? 0 : 1)}k`
  return `$${Math.round(d)}`
}

/** A tidy axis maximum and step for 4 gridlines. */
function niceScale(max: number): { top: number; step: number } {
  const raw = Math.max(max, 10000) / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag
  return { top: step * 4, step }
}

export interface TrendDatum {
  key: string
  label: string
  income: number
  spending: number
  net: number
}

/**
 * Income and spending side by side per month, one axis, with a legend and a
 * hover tooltip per month. Colours come from --series-income / --series-spending.
 */
export function TrendChart({
  data,
  height = 200,
  onSelect,
}: {
  data: TrendDatum[]
  height?: number
  onSelect?: (key: string) => void
}) {
  const [hover, setHover] = useState<number | null>(null)
  const { top, step } = niceScale(Math.max(0, ...data.flatMap((d) => [d.income, d.spending])))
  const ticks = [0, 1, 2, 3, 4].map((i) => i * step)
  const h = (v: number) => `${(Math.max(0, v) / top) * 100}%`
  const hovered = hover === null ? null : data[hover]

  return (
    <div className="trend">
      <div className="legend" aria-hidden="true">
        <span>
          <i style={{ background: 'var(--series-income)' }} /> Income
        </span>
        <span>
          <i style={{ background: 'var(--series-spending)' }} /> Spending
        </span>
      </div>
      <div className="trend-plot" style={{ height }}>
        <div className="trend-grid" aria-hidden="true">
          {ticks
            .slice()
            .reverse()
            .map((t) => (
              <div key={t}>
                <span>{axisMoney(t)}</span>
              </div>
            ))}
        </div>
        <div className="trend-cols" role="list">
          {data.map((d, i) => (
            <div
              key={d.key}
              role="listitem"
              className={hover === i ? 'trend-col hover' : 'trend-col'}
              aria-label={`${d.label}: income ${formatCents(d.income)}, spending ${formatCents(d.spending)}, net ${formatCents(d.net)}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={onSelect ? () => onSelect(d.key) : undefined}
              style={onSelect ? { cursor: 'pointer' } : undefined}
            >
              <div className="trend-bars">
                <span className="bar-income" style={{ height: h(d.income) }} />
                <span className="bar-spending" style={{ height: h(d.spending) }} />
              </div>
              {hover === i && hovered && (
                <div
                  className={i >= data.length - 2 ? 'chart-tip left' : 'chart-tip'}
                  role="tooltip"
                >
                  <strong>{d.label}</strong>
                  <TipRow color="var(--series-income)" label="Income">
                    {formatCents(d.income)}
                  </TipRow>
                  <TipRow color="var(--series-spending)" label="Spending">
                    {formatCents(d.spending)}
                  </TipRow>
                  <TipRow label="Net">
                    <span className={d.net < 0 ? 'neg' : 'pos'}>{formatCents(d.net)}</span>
                  </TipRow>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="trend-labels" aria-hidden="true">
        {data.map((d, i) => (
          <span key={d.key} className={hover === i ? 'active' : undefined}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function TipRow({
  color,
  label,
  children,
}: {
  color?: string
  label: string
  children: ReactNode
}) {
  return (
    <div className="tip-row">
      <span>
        {color && <i style={{ background: color }} />}
        {label}
      </span>
      <span className="num">{children}</span>
    </div>
  )
}
