/** Names of the reports API methods shared by main (handlers) and preload (bridge). No imports on purpose. */
export const REPORTS_METHODS = [
  'spendingByCategory',
  'incomeVsExpenses',
  'monthlyTrend',
  'topPayees',
  'biggestTransactions',
  'dashboard',
  'getDashboardWidgets',
  'setDashboardWidgets',
] as const

export type ReportsMethod = (typeof REPORTS_METHODS)[number]
