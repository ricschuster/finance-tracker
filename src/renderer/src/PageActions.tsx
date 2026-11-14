import { createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** The page header's action area; screens render buttons into it with <PageActions>. */
export const PageActionsContext = createContext<HTMLElement | null>(null)

export function PageActions({ children }: { children: ReactNode }) {
  const slot = useContext(PageActionsContext)
  return slot ? createPortal(children, slot) : null
}
