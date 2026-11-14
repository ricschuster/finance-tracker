export type TextField = 'description' | 'payee'
export type TextOp = 'contains' | 'starts_with' | 'equals' | 'regex' | 'similar'

export type Condition =
  | { type: 'text'; field: TextField; op: TextOp; value: string }
  | { type: 'amount'; direction?: 'expense' | 'income'; min?: number; max?: number }
  | { type: 'account'; accountId: number }

export type Action =
  | { type: 'setPayee'; payee: string }
  | { type: 'setCategory'; categoryId: number }
  | { type: 'addTags'; tags: string[] }
  /** Import only: leave the row out of the import. Does nothing to transactions already saved. */
  | { type: 'skipImport' }

export interface RuleInput {
  name?: string
  enabled?: boolean
  conditions: Condition[]
  actions: Action[]
}

export interface Rule {
  id: number
  name: string
  position: number
  enabled: boolean
  conditions: Condition[]
  actions: Action[]
}

/** Fields of a transaction a rule can lock out; matches EditableField in the ledger. */
export type RuleField = 'payee' | 'categories' | 'tags'

/** The facts about a transaction the engine needs. Plain data so the engine stays pure. */
export interface RuleTarget {
  accountId: number
  /** Signed integer cents. */
  amount: number
  rawDescription: string
  payee: string
  editedFields: string[]
  isTransfer: boolean
  lineCount: number
  /** Category of the first line. */
  categoryId: number | null
  tags: string[]
}

export interface RuleChanges {
  payee?: string
  categoryId?: number
  /** Tags to add that the transaction does not have yet. */
  addTags?: string[]
}

export interface RulePlan {
  ruleId: number
  /** Only real differences; empty when the rule matched but nothing needs to change. */
  changes: RuleChanges
  /** Actions the rule wanted but could not apply. */
  locked: RuleField[]
}
