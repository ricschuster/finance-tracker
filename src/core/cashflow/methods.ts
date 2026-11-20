/** Names of the cashflow API methods shared by main (handlers) and preload (bridge). No imports on purpose. */
export const CASHFLOW_METHODS = ['getCashflowMonth'] as const

export type CashflowMethod = (typeof CASHFLOW_METHODS)[number]
