/** Names of the budgets API methods shared by main (handlers) and preload (bridge). No imports on purpose. */
export const BUDGETS_METHODS = ['getBudgetMonth', 'setBudget'] as const

export type BudgetsMethod = (typeof BUDGETS_METHODS)[number]
