/** Fixed colour palette and icon set for categories. Mid tones that read on light and dark. */
export const CATEGORY_COLORS = [
  '#4e79a7',
  '#f28e2b',
  '#e15759',
  '#76b7b2',
  '#59a14f',
  '#edc948',
  '#b07aa1',
  '#ff9da7',
  '#9c755f',
  '#8cd17d',
  '#86bcb6',
  '#bab0ac',
] as const

/** Icon keys map to a glyph. Bundled, so nothing is fetched. */
export const CATEGORY_ICONS = {
  car: '🚗',
  bolt: '💡',
  food: '🍽️',
  cart: '🛒',
  heart: '❤️',
  home: '🏠',
  cash: '💵',
  bag: '🛍️',
  plane: '✈️',
  ticket: '🎟️',
  fee: '🏦',
  gift: '🎁',
  kids: '🧸',
  care: '💈',
  tax: '🧾',
  swap: '🔁',
  tag: '🏷️',
  work: '💼',
  pet: '🐾',
  book: '📚',
} as const

export type CategoryIconKey = keyof typeof CATEGORY_ICONS

export function isCategoryColor(v: string): boolean {
  return (CATEGORY_COLORS as readonly string[]).includes(v)
}

export function isCategoryIcon(v: string): v is CategoryIconKey {
  return Object.prototype.hasOwnProperty.call(CATEGORY_ICONS, v)
}
