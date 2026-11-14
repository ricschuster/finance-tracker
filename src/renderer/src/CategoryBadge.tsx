import {
  Baby,
  Banknote,
  BookOpen,
  Briefcase,
  Car,
  CircleHelp,
  Gift,
  HeartPulse,
  House,
  Landmark,
  PawPrint,
  Plane,
  Receipt,
  Repeat,
  Scissors,
  ShoppingBag,
  ShoppingCart,
  Tag,
  Ticket,
  Utensils,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { createContext, useContext, useMemo } from 'react'
import type { Category } from '../../core/ledger/categories'
import type { CategoryIconKey } from '../../core/ledger/categoryStyle'

const CategoryStyles = createContext<Category[]>([])
export const CategoryStyleProvider = CategoryStyles.Provider

/** Icon keys (stored in the database) drawn as Lucide icons in the UI. */
export const CATEGORY_LUCIDE: Record<CategoryIconKey, LucideIcon> = {
  car: Car,
  bolt: Zap,
  food: Utensils,
  cart: ShoppingCart,
  heart: HeartPulse,
  home: House,
  cash: Banknote,
  bag: ShoppingBag,
  plane: Plane,
  ticket: Ticket,
  fee: Landmark,
  gift: Gift,
  kids: Baby,
  care: Scissors,
  tax: Receipt,
  swap: Repeat,
  tag: Tag,
  work: Briefcase,
  pet: PawPrint,
  book: BookOpen,
}

/** A category's icon in a circle of its colour. */
export function CategoryIcon({
  color,
  icon,
  size = 'md',
}: {
  color?: string | null
  icon?: string | null
  size?: 'sm' | 'md'
}) {
  const Icon = icon && icon in CATEGORY_LUCIDE ? CATEGORY_LUCIDE[icon as CategoryIconKey] : null
  const px = size === 'sm' ? 12 : 14
  return (
    <span
      className={size === 'sm' ? 'category-icon sm' : 'category-icon'}
      aria-hidden="true"
      style={{ background: color ?? 'var(--text-3)' }}
    >
      {Icon ? <Icon size={px} strokeWidth={2.2} /> : <CircleHelp size={px} strokeWidth={2.2} />}
    </span>
  )
}

/** Look up a category's style by id. */
export function useCategoryLookup(): (id: number) => Category | undefined {
  const categories = useContext(CategoryStyles)
  return useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]))
    return (id: number) => byId.get(id)
  }, [categories])
}

/** Icon and optional name for a category, looked up by id or by name (names are unique). */
export function CategoryBadge(props: {
  id?: number
  name?: string
  showName?: boolean
  size?: 'sm' | 'md'
}) {
  const categories = useContext(CategoryStyles)
  const c = useMemo(
    () =>
      categories.find((x) => (props.id !== undefined ? x.id === props.id : x.name === props.name)),
    [categories, props.id, props.name],
  )
  return (
    <span className="category-badge">
      <CategoryIcon color={c?.color} icon={c?.icon} size={props.size} />
      {props.showName && <span>{c?.name ?? props.name}</span>}
    </span>
  )
}
