import { useEffect, useRef } from 'react'
import { Dialog } from './ui'

export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['/'], label: 'Search transactions' },
  { keys: ['n'], label: 'Add a transaction' },
  { keys: ['g', 'd'], label: 'Go to Dashboard' },
  { keys: ['g', 't'], label: 'Go to Transactions' },
  { keys: ['g', 'b'], label: 'Go to Cashflow' },
  { keys: ['g', 'r'], label: 'Go to Reports' },
  { keys: ['g', 'a'], label: 'Go to Accounts' },
  { keys: ['g', 'i'], label: 'Go to Import' },
  { keys: ['?'], label: 'Show this list' },
]

export interface ShortcutActions {
  search: () => void
  add: () => void
  help: () => void
  go: (key: string) => boolean
}

function typingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  if (!el || !el.tagName) return false
  return (
    el.isContentEditable ||
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.getAttribute('role') === 'combobox' ||
    el.getAttribute('role') === 'textbox'
  )
}

/**
 * Global single-key shortcuts. They never fire while typing, with a modifier held, or while a
 * dialog or menu is open, so they cannot collide with forms or the review queue's own keys.
 */
export function useShortcuts(actions: ShortcutActions) {
  const ref = useRef(actions)
  ref.current = actions
  useEffect(() => {
    let chord = 0
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      if (typingTarget(e.target)) return
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return
      const a = ref.current
      if (chord && Date.now() - chord < 1500) {
        chord = 0
        if (a.go(e.key.toLowerCase())) e.preventDefault()
        return
      }
      chord = 0
      if (e.key === '/') {
        e.preventDefault()
        a.search()
      } else if (e.key === 'n') {
        e.preventDefault()
        a.add()
      } else if (e.key === '?') {
        e.preventDefault()
        a.help()
      } else if (e.key === 'g') {
        chord = Date.now()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
}

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Keyboard shortcuts"
      description="They work when you are not typing in a field."
    >
      <dl className="shortcut-list">
        {SHORTCUTS.map((s) => (
          <div key={s.label} className="shortcut-row">
            <dt>
              {s.keys.map((k, i) => (
                <span key={i}>
                  {i > 0 && <span className="shortcut-then"> then </span>}
                  <kbd>{k}</kbd>
                </span>
              ))}
            </dt>
            <dd>{s.label}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  )
}

export function SearchHelpBody() {
  return (
    <ul className="search-help">
      <li>Every word must appear somewhere in the payee, description, notes, tags or category.</li>
      <li>
        A word matches inside longer text, so <kbd>sho</kbd> finds Shopify and Shoppers.
      </li>
      <li>
        Use quotes for an exact phrase: <kbd>"cafe latte"</kbd>.
      </li>
      <li>AND, OR and NOT are ordinary words, and stray punctuation is ignored.</li>
      <li>Apostrophes are optional: mcdonalds finds McDonald&apos;s.</li>
      <li>Amounts are not searched here; use Filters for an amount range.</li>
    </ul>
  )
}
