import { expect, it } from 'vitest'
import { guessAccountType } from './accountType'

it('guesses an account type from its name', () => {
  expect(guessAccountType('Credit card WS0002')).toBe('credit_card')
  expect(guessAccountType('TD Visa')).toBe('credit_card')
  expect(guessAccountType('TFSA Savings')).toBe('savings')
  expect(guessAccountType('Car loan')).toBe('loan')
  expect(guessAccountType('Chequing')).toBe('checking')
})
