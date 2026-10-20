import { describe, it, expect, vi } from 'vitest'

vi.mock('$env/dynamic/private', () => ({ env: {} }))

import { splitSqlStatements, COFFRE_MIGRATIONS } from './coffre-db'

describe('migration 001-events.sql', () => {
	const stmts = COFFRE_MIGRATIONS.flatMap(splitSqlStatements)
	it('5 instructions, toutes idempotentes (CREATE … IF NOT EXISTS)', () => {
		expect(stmts).toHaveLength(5)
		for (const s of stmts) expect(s).toMatch(/^CREATE (TABLE|INDEX) IF NOT EXISTS /)
	})
	it('non destructive : ni DROP, ni ALTER, ni DELETE/TRUNCATE, aucune écriture sur users', () => {
		const all = stmts.join('\n').replace(/ON DELETE CASCADE/g, '')
		expect(all).not.toMatch(/\b(DROP|ALTER|DELETE|TRUNCATE|UPDATE|INSERT)\b/i)
		expect(stmts.every((x) => /^CREATE (TABLE|INDEX) IF NOT EXISTS (events|event_media|events_|event_media_)/.test(x))).toBe(true)
	})
	it('le découpage ignore les commentaires', () => {
		expect(splitSqlStatements('-- c\nSELECT 1;\n-- d;\nSELECT 2;\n')).toEqual(['SELECT 1', 'SELECT 2'])
	})
})
