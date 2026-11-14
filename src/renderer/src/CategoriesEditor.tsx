import { Check, GitMerge, Lock, Palette, Pencil, Plus, Tags, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import type { Category, CategoryKind } from '../../core/ledger/categories'
import { CATEGORY_COLORS, type CategoryIconKey } from '../../core/ledger/categoryStyle'
import { CATEGORY_LUCIDE, CategoryIcon } from './CategoryBadge'
import { CategorySelect } from './CategorySelect'
import { PageActions } from './PageActions'
import type { LedgerState } from './useLedger'
import { ActionMenu, Dialog, Empty } from './ui'

type Pending =
  | { type: 'add' }
  | { type: 'rename'; category: Category }
  | { type: 'style'; category: Category }
  | { type: 'merge'; category: Category }
  | { type: 'delete'; category: Category }

const GROUPS: { kind: CategoryKind; title: string }[] = [
  { kind: 'expense', title: 'Spending' },
  { kind: 'income', title: 'Income' },
  { kind: 'transfer', title: 'Transfers' },
]

const lines = (n: number) => `${n} transaction ${n === 1 ? 'line' : 'lines'}`

/** Add, rename, merge and delete categories. The set is flat. System categories are read-only. */
export function CategoriesEditor({ ledger }: { ledger: LedgerState }) {
  const [usage, setUsage] = useState<Record<number, number>>({})
  const [pending, setPending] = useState<Pending | null>(null)

  useEffect(() => {
    window.api.ledger.categoryUsage().then(setUsage, () => setUsage({}))
  }, [ledger.version])

  const { categories } = ledger
  const close = () => setPending(null)
  const runAndClose = (action: () => Promise<unknown>) =>
    void ledger.run(action).then((ok) => ok && close())

  const mergeTargets = (c: Category) =>
    categories.filter((x) => x.id !== c.id && !x.isSystem && x.kind === c.kind)

  const titles: Record<Pending['type'], string> = {
    add: 'Add category',
    rename: 'Rename category',
    style: 'Colour and icon',
    merge: 'Merge category',
    delete: 'Delete category',
  }

  return (
    <section aria-label="Categories">
      <h2>Categories</h2>
      <PageActions>
        <button type="button" className="primary" onClick={() => setPending({ type: 'add' })}>
          <Plus size={16} />
          Add category
        </button>
      </PageActions>
      <p className="section-intro">
        A short, flat list. Merging or deleting moves transactions to another category,
        Uncategorized by default.
      </p>

      {GROUPS.map(({ kind, title }) => {
        const list = categories.filter((c) => c.kind === kind)
        if (list.length === 0) return null
        return (
          <div key={kind} className="card flush category-card">
            <div className="card-header">
              <h3>{title}</h3>
              <span className="subtle">
                {list.length} categor{list.length === 1 ? 'y' : 'ies'}
              </span>
            </div>
            <table className="category-table">
              <tbody>
                {list.map((c) => {
                  const n = usage[c.id] ?? 0
                  return (
                    <tr key={c.id} className="category-item" aria-label={c.name}>
                      <td>
                        <span className="category-badge">
                          <CategoryIcon color={c.color} icon={c.icon} />
                          <span className="category-name">{c.name}</span>
                          {c.isSystem && (
                            <span className="pill" title="Built in, cannot be changed">
                              <Lock size={10} />
                              Built in
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="num muted">{n > 0 ? lines(n) : 'Not used'}</td>
                      <td className="actions">
                        {!c.isSystem && (
                          <ActionMenu
                            label={`Actions for ${c.name}`}
                            actions={[
                              {
                                label: 'Rename',
                                icon: <Pencil size={14} />,
                                onSelect: () => setPending({ type: 'rename', category: c }),
                              },
                              {
                                label: 'Colour and icon',
                                icon: <Palette size={14} />,
                                onSelect: () => setPending({ type: 'style', category: c }),
                              },
                              {
                                label: 'Merge into...',
                                icon: <GitMerge size={14} />,
                                disabled: mergeTargets(c).length === 0,
                                onSelect: () => setPending({ type: 'merge', category: c }),
                              },
                              {
                                label: 'Delete',
                                icon: <Trash2 size={14} />,
                                danger: true,
                                separatorBefore: true,
                                onSelect: () => setPending({ type: 'delete', category: c }),
                              },
                            ]}
                          />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}
      {categories.length === 0 && <Empty icon={<Tags size={28} />} title="No categories yet" />}

      <Dialog
        open={pending !== null}
        onOpenChange={(o) => !o && close()}
        title={pending ? titles[pending.type] : ''}
        description={
          pending?.type === 'add'
            ? 'Give it a name, then pick a colour and icon if you like.'
            : pending && pending.type !== 'rename'
              ? pending.category.name
              : undefined
        }
      >
        {pending?.type === 'add' && (
          <AddForm
            defaultColor={CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length]!}
            onCancel={close}
            onSave={(name, kind, style) =>
              runAndClose(async () => {
                const id = await window.api.ledger.createCategory({ name, kind })
                await window.api.ledger.setCategoryStyle(id, style)
              })
            }
          />
        )}
        {pending?.type === 'rename' && (
          <RenameForm
            category={pending.category}
            onCancel={close}
            onSave={(name) =>
              runAndClose(() => window.api.ledger.renameCategory(pending.category.id, name))
            }
          />
        )}
        {pending?.type === 'style' && (
          <StyleForm
            category={pending.category}
            onCancel={close}
            onSave={(style) =>
              runAndClose(() => window.api.ledger.setCategoryStyle(pending.category.id, style))
            }
          />
        )}
        {pending?.type === 'merge' && (
          <MoveForm
            mode="merge"
            category={pending.category}
            count={usage[pending.category.id] ?? 0}
            targets={mergeTargets(pending.category)}
            initial={mergeTargets(pending.category)[0]?.id ?? 0}
            onCancel={close}
            onSave={(into) =>
              runAndClose(() => window.api.ledger.mergeCategory(pending.category.id, into))
            }
          />
        )}
        {pending?.type === 'delete' && (
          <MoveForm
            mode="delete"
            category={pending.category}
            count={usage[pending.category.id] ?? 0}
            targets={categories.filter((x) => x.id !== pending.category.id)}
            initial={categories.find((c) => c.name === 'Uncategorized')?.id ?? 0}
            onCancel={close}
            onSave={(to) =>
              runAndClose(() =>
                window.api.ledger.deleteCategory(pending.category.id, to || undefined),
              )
            }
          />
        )}
      </Dialog>
    </section>
  )
}

interface Style {
  color: string | null
  icon: string | null
}

function DialogButtons({
  onCancel,
  label,
  disabled,
  danger,
}: {
  onCancel: () => void
  label: string
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <div className="dialog-actions">
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
      <button type="submit" className={danger ? 'danger solid' : 'primary'} disabled={disabled}>
        {label}
      </button>
    </div>
  )
}

function AddForm({
  defaultColor,
  onSave,
  onCancel,
}: {
  defaultColor: string
  onSave: (name: string, kind: CategoryKind, style: Style) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<CategoryKind>('expense')
  const [style, setStyle] = useState<Style>({ color: defaultColor, icon: 'tag' })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSave(name, kind, style)
  }
  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        Name
        <input
          aria-label="New category name"
          placeholder="For example Pets"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="field">
        Type
        <div className="segmented" role="radiogroup" aria-label="Category type">
          {(['expense', 'income'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
            >
              {k === 'expense' ? 'Spending' : 'Income'}
            </button>
          ))}
        </div>
      </div>
      <StylePicker name={name || 'New category'} value={style} onChange={setStyle} />
      <DialogButtons onCancel={onCancel} label="Add category" disabled={name.trim() === ''} />
    </form>
  )
}

function RenameForm({
  category,
  onSave,
  onCancel,
}: {
  category: Category
  onSave: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(category.name)
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(name)
      }}
    >
      <label className="field">
        Name
        <input
          aria-label={`New name for ${category.name}`}
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <DialogButtons
        onCancel={onCancel}
        label="Save"
        disabled={name.trim() === '' || name.trim() === category.name}
      />
    </form>
  )
}

function StyleForm({
  category,
  onSave,
  onCancel,
}: {
  category: Category
  onSave: (style: Style) => void
  onCancel: () => void
}) {
  const [style, setStyle] = useState<Style>({ color: category.color, icon: category.icon })
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(style)
      }}
    >
      <StylePicker name={category.name} value={style} onChange={setStyle} />
      <DialogButtons onCancel={onCancel} label="Save" />
    </form>
  )
}

/** Colour swatches and the Lucide icon grid, with a live preview. */
function StylePicker({
  name,
  value,
  onChange,
}: {
  name: string
  value: Style
  onChange: (s: Style) => void
}) {
  return (
    <div className="style-editor">
      <div className="style-preview">
        <CategoryIcon color={value.color} icon={value.icon} />
        <strong>{name}</strong>
      </div>
      <div className="field">
        Colour
        <div className="swatches" role="group" aria-label={`Colour for ${name}`}>
          {CATEGORY_COLORS.map((col) => (
            <button
              key={col}
              type="button"
              className="swatch"
              aria-label={`Colour ${col}`}
              aria-pressed={value.color === col}
              style={{ background: col }}
              onClick={() => onChange({ ...value, color: col })}
            >
              {value.color === col && <Check size={14} strokeWidth={3} />}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        Icon
        <div className="icon-grid" role="group" aria-label={`Icon for ${name}`}>
          {(Object.keys(CATEGORY_LUCIDE) as CategoryIconKey[]).map((key) => {
            const Icon = CATEGORY_LUCIDE[key]
            return (
              <button
                key={key}
                type="button"
                className="ghost icon"
                aria-label={`Icon ${key}`}
                aria-pressed={value.icon === key}
                title={key}
                onClick={() => onChange({ ...value, icon: key })}
              >
                <Icon size={17} />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Merge into, or delete with reassign: both move lines, rules and saved searches. */
function MoveForm({
  mode,
  category,
  count,
  targets,
  initial,
  onSave,
  onCancel,
}: {
  mode: 'merge' | 'delete'
  category: Category
  count: number
  targets: Category[]
  initial: number
  onSave: (targetId: number) => void
  onCancel: () => void
}) {
  const [target, setTarget] = useState(initial)
  const merge = mode === 'merge'
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(target)
      }}
    >
      <p className="move-text" role="alert">
        {merge
          ? `Its ${lines(count)}, and any rules or saved searches that use it, move to the category you pick. ${category.name} is then removed.`
          : count > 0
            ? `Its ${lines(count)} ${count === 1 ? 'moves' : 'move'} to the category you pick. Rules and saved searches that use it move the same way.`
            : 'Nothing uses it. Rules and saved searches that use it are moved to Uncategorized.'}
      </p>
      {(merge || count > 0) && (
        <label className="field">
          {merge ? 'Merge into' : 'Move lines to'}
          <CategorySelect
            aria-label={merge ? 'Merge into' : 'Move lines to'}
            categories={targets}
            value={target}
            onChange={setTarget}
          />
        </label>
      )}
      <DialogButtons
        onCancel={onCancel}
        label={merge ? 'Merge' : 'Delete category'}
        danger={!merge}
        disabled={merge && target === 0}
      />
    </form>
  )
}
