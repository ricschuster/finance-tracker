import * as AlertDialog from '@radix-ui/react-alert-dialog'
import * as RDialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { MoreHorizontal, X } from 'lucide-react'
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

/** A modal dialog with a title, optional description and a close button. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  wide,
  persistent,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  wide?: boolean
  /** Ignore outside clicks and Escape, for forms that would lose typed input. */
  persistent?: boolean
  children: ReactNode
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="dialog-overlay" />
        <RDialog.Content
          className={wide ? 'dialog wide' : 'dialog'}
          {...(persistent && {
            onInteractOutside: (e: Event) => e.preventDefault(),
            onEscapeKeyDown: (e: KeyboardEvent) => e.preventDefault(),
          })}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <RDialog.Title className="dialog-title">{title}</RDialog.Title>
          {description ? (
            <RDialog.Description className="dialog-description">{description}</RDialog.Description>
          ) : (
            <div style={{ height: 12 }} />
          )}
          <RDialog.Close asChild>
            <button type="button" className="ghost icon small dialog-close" aria-label="Close">
              <X size={16} />
            </button>
          </RDialog.Close>
          {children}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  )
}

export interface MenuAction {
  label: string
  icon?: ReactNode
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
  separatorBefore?: boolean
}

/** A "more actions" button that opens a dropdown of actions. */
export function ActionMenu({
  actions,
  label = 'More actions',
  trigger,
}: {
  actions: MenuAction[]
  label?: string
  trigger?: ReactNode
}) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        {trigger ?? (
          <button type="button" className="ghost icon small" aria-label={label}>
            <MoreHorizontal size={16} />
          </button>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu" align="end" sideOffset={4}>
          {actions.map((a) => (
            <div key={a.label}>
              {a.separatorBefore && <DropdownMenu.Separator className="menu-separator" />}
              <DropdownMenu.Item
                className={a.danger ? 'menu-item danger' : 'menu-item'}
                disabled={a.disabled}
                onSelect={a.onSelect}
              >
                {a.icon}
                {a.label}
              </DropdownMenu.Item>
            </div>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

interface ConfirmOptions {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  /** Alert mode: a single OK button. */
  alert?: boolean
}
type Pending = ConfirmOptions & { message: string; resolve: (ok: boolean) => void }
type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

/** In-app replacement for window.confirm and window.alert. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const ref = useRef<Pending | null>(null)
  const confirm = useCallback<ConfirmFn>(
    (message, options = {}) =>
      new Promise<boolean>((resolve) => {
        ref.current?.resolve(false)
        const p = { ...options, message, resolve }
        ref.current = p
        setPending(p)
      }),
    [],
  )
  const close = (ok: boolean) => {
    ref.current?.resolve(ok)
    ref.current = null
    setPending(null)
  }
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog.Root open={pending !== null} onOpenChange={(o) => !o && close(false)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="dialog-overlay" />
          <AlertDialog.Content className="dialog" data-testid="confirm-dialog">
            <AlertDialog.Title className="dialog-title">
              {pending?.title ?? (pending?.alert ? 'Notice' : 'Are you sure?')}
            </AlertDialog.Title>
            <AlertDialog.Description className="dialog-description">
              {pending?.message}
            </AlertDialog.Description>
            <div className="dialog-actions">
              {!pending?.alert && (
                <AlertDialog.Cancel asChild>
                  <button type="button">{pending?.cancelLabel ?? 'Cancel'}</button>
                </AlertDialog.Cancel>
              )}
              <AlertDialog.Action asChild>
                <button
                  type="button"
                  className={pending?.danger ? 'danger solid' : 'primary'}
                  onClick={() => close(true)}
                >
                  {pending?.confirmLabel ?? (pending?.alert ? 'OK' : 'Confirm')}
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </ConfirmContext.Provider>
  )
}

/** Returns `confirm(message, options)` resolving to true when the user accepts. */
export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext)
  if (!fn) throw new Error('useConfirm needs a ConfirmProvider')
  return fn
}

/** Returns `alert(message)`; resolves when dismissed. */
export function useAlert(): (message: string, title?: string) => Promise<void> {
  const confirm = useConfirm()
  return useCallback(
    async (message, title) => {
      await confirm(message, { alert: true, title })
    },
    [confirm],
  )
}

/** Centered empty state for lists with nothing in them yet. */
export function Empty({
  icon,
  title,
  children,
}: {
  icon?: ReactNode
  title: string
  children?: ReactNode
}) {
  return (
    <div className="empty">
      {icon}
      <strong>{title}</strong>
      {children && <div>{children}</div>}
    </div>
  )
}

/** A round initial for a payee, standing in for a merchant logo. */
export function PayeeAvatar({ name }: { name: string }) {
  const letter =
    name
      .trim()
      .match(/[A-Za-z0-9]/)?.[0]
      ?.toUpperCase() ?? '?'
  return (
    <span className="avatar" aria-hidden="true">
      {letter}
    </span>
  )
}

/** A headline figure with a label, optional icon and a note underneath. */
export function StatTile({
  label,
  value,
  tone,
  icon,
  iconTone,
  note,
}: {
  label: string
  value: ReactNode
  tone?: 'pos' | 'neg'
  icon?: ReactNode
  iconTone?: 'pos' | 'neg' | 'accent'
  note?: ReactNode
}) {
  return (
    <div className="stat">
      <div className="stat-head">
        <span>{label}</span>
        {icon && (
          <span className={iconTone ? `stat-icon ${iconTone}` : 'stat-icon'} aria-hidden="true">
            {icon}
          </span>
        )}
      </div>
      <strong className={tone}>{value}</strong>
      {note && <span className="muted">{note}</span>}
    </div>
  )
}
