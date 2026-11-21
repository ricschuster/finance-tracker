import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrate } from '../db/migrations'
import { listCategories, listCategoryAliases, type Category } from './categories'
import { filterCategoryOptions } from './categoryPicker'

const cat = (id: number, name: string, parentId: number | null = null): Category => ({
  id,
  parentId,
  name,
  isSystem: false,
  sortOrder: id,
  color: null,
  icon: null,
  hideFromTrends: false,
})
const cats = [cat(1, 'Food'), cat(2, 'Groceries', 1), cat(3, 'Café', 1), cat(4, 'Auto')]
const aliases = [{ alias: 'Supermarket', categoryId: 2 }]
const names = (q: string) => filterCategoryOptions(cats, aliases, q).map((o) => o.category.name)

describe('filterCategoryOptions', () => {
  it('keeps everything, in order, for an empty query', () => {
    expect(names('')).toEqual(['Food', 'Groceries', 'Café', 'Auto'])
    expect(names('   ')).toHaveLength(4)
  })

  it('matches names case and accent insensitively, any word order', () => {
    expect(names('GROC')).toEqual(['Groceries'])
    expect(names('cafe')).toEqual(['Café'])
    expect(names('zzz')).toEqual([])
  })

  it('matches a parent name so its children appear', () => {
    expect(names('food')).toEqual(['Food', 'Groceries', 'Café'])
    expect(names('groceries food')).toEqual(['Groceries'])
  })

  it('matches aliases and reports which one', () => {
    const [hit] = filterCategoryOptions(cats, aliases, 'super')
    expect(hit!.category.name).toBe('Groceries')
    expect(hit!.matchedAlias).toBe('Supermarket')
    expect(hit!.parentName).toBe('Food')
    expect(filterCategoryOptions(cats, aliases, 'groc')[0]!.matchedAlias).toBeNull()
  })
})

describe('listCategoryAliases', () => {
  it('returns stored aliases', () => {
    const db = new Database(':memory:')
    migrate(db)
    const id = listCategories(db)[0]!.id
    db.prepare('INSERT INTO category_aliases (alias, category_id) VALUES (?, ?)').run('Eats', id)
    expect(listCategoryAliases(db)).toEqual([{ alias: 'Eats', categoryId: id }])
    db.close()
  })
})
