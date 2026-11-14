import { CheckCircle2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { ReviewItem } from '../../core/rules/review'
import { suggestPattern } from '../../core/rules/pattern'
import { formatCents } from '../../core/money'
import { CategorySelect } from './CategorySelect'
import { Empty, useToast } from './ui'
import type { LedgerState } from './useLedger'

/**
 * Steps through uncategorized transactions one at a time. The app proposes (a guess from the
 * user's own history); the user decides. Keys: Enter applies, R applies and saves a rule,
 * S or the right arrow skips.
 */
export function ReviewQueue({
  ledger,
  onOpenList,
  onDone,
}: {
  ledger: LedgerState
  onOpenList: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const [items, setItems] = useState<ReviewItem[] | null>(null)
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [done, setDone] = useState(0)

  useEffect(() => {
    void window.api.rules.reviewQueue().then(setItems)
  }, [])

  const item = items?.[index]
  const categoryId = picked ?? item?.guess?.categoryId ?? 0
  const accountName = (id: number) => ledger.accounts.find((a) => a.id === id)?.name ?? ''

  const next = useCallback(() => {
    setPicked(null)
    setIndex((i) => i + 1)
  }, [])

  const apply = useCallback(
    async (makeRule: boolean) => {
      if (!item || categoryId === 0) return
      const t = item.transaction
      const line = t.lines[0]!
      const ok = await ledger.run(async () => {
        await window.api.ledger.updateTransaction(t.id, {
          lines: [{ categoryId, amount: t.amount, memo: line.memo }],
        })
        const pattern = suggestPattern(t.rawDescription)
        if (makeRule && pattern) {
          await window.api.rules.createRule({
            name: pattern,
            conditions: [{ type: 'text', field: 'description', op: 'contains', value: pattern }],
            actions: [{ type: 'setCategory', categoryId }],
          })
        }
      })
      if (!ok) return
      if (makeRule) toast({ message: 'Rule saved. It applies to future imports.' })
      setDone((n) => n + 1)
      next()
    },
    [item, categoryId, ledger, toast, next],
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, [role="listbox"], [role="dialog"]')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Enter') void apply(false)
      else if (e.key === 'r' || e.key === 'R') void apply(true)
      else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowRight') next()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [apply, next])

  if (items === null) return null
  if (!item) {
    return (
      <Empty icon={<CheckCircle2 size={28} />} title="Nothing left to review">
        {done > 0
          ? `You categorized ${done} transaction${done === 1 ? '' : 's'}.`
          : items.length === 0
            ? 'Every transaction has a category.'
            : 'You skipped the rest.'}{' '}
        <button type="button" className="small" onClick={onDone}>
          Back to dashboard
        </button>
      </Empty>
    )
  }

  const t = item.transaction
  return (
    <div className="card review-card">
      <div className="subtle">
        {index + 1} of {items.length}
      </div>
      <h3>{t.payee || t.rawDescription}</h3>
      <div className="review-meta">
        <span className="nowrap">{t.date}</span>
        <span>{accountName(t.accountId)}</span>
        <span className={`amount ${t.amount < 0 ? '' : 'pos'}`}>{formatCents(t.amount)}</span>
      </div>
      {t.payee && t.payee !== t.rawDescription && <div className="subtle">{t.rawDescription}</div>}
      <div className="review-pick">
        <CategorySelect
          aria-label="Category"
          categories={ledger.categories}
          anyLabel="Choose a category"
          value={categoryId}
          onChange={setPicked}
        />
        {picked === null && item.guess && (
          <span className="subtle" title="Guessed from earlier transactions">
            {item.guess.similar ? 'similar guess' : 'guess'} {item.guess.agree}/{item.guess.of}
          </span>
        )}
      </div>
      <div className="review-actions">
        <button
          type="button"
          className="primary"
          disabled={categoryId === 0}
          onClick={() => void apply(false)}
        >
          Apply <kbd>Enter</kbd>
        </button>
        <button
          type="button"
          disabled={categoryId === 0 || !suggestPattern(t.rawDescription)}
          onClick={() => void apply(true)}
        >
          Apply and make a rule <kbd>R</kbd>
        </button>
        <button type="button" onClick={next}>
          Skip <kbd>S</kbd>
        </button>
        <button type="button" className="ghost" onClick={onOpenList}>
          Open as list
        </button>
      </div>
    </div>
  )
}
