/** Names of the rules API methods shared by main (handlers) and preload (bridge). No imports on purpose. */
export const RULES_METHODS = [
  'listRules',
  'createRule',
  'updateRule',
  'setRuleEnabled',
  'deleteRule',
  'reorderRules',
  'previewRules',
  'applyRules',
  'suggestRule',
  'reviewQueue',
] as const

export type RulesMethod = (typeof RULES_METHODS)[number]
