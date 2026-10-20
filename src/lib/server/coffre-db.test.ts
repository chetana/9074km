import { describe, it, expect, vi } from 'vitest'

vi.mock('$env/dynamic/private', () => ({ env: {} }))

import { splitSqlStatements, COFFRE_MIGRATIONS } from './coffre-db'

describe('migrations 001-events.sql + 002-media.sql', () => {
	const stmts = COFFRE_MIGRATIONS.flatMap(splitSqlStatements)
	it('7 instructions (5 évènements + 2 media), toutes idempotentes (CREATE … IF NOT EXISTS)', () => {
		expect(stmts).toHaveLength(7)
		for (const s of stmts) expect(s).toMatch(/^CREATE (TABLE|INDEX) IF NOT EXISTS /)
	})
	it('non destructive : ni DROP, ni ALTER, ni DELETE/TRUNCATE, aucune écriture sur users', () => {
		const all = stmts.join('\n').replace(/ON DELETE CASCADE/g, '')
		expect(all).not.toMatch(/\b(DROP|ALTER|DELETE|TRUNCATE|UPDATE|INSERT)\b/i)
		expect(stmts.every((x) => /^CREATE (TABLE|INDEX) IF NOT EXISTS (events|event_media|events_|event_media_|media)/.test(x))).toBe(true)
	})
	it('le découpage ignore les commentaires', () => {
		expect(splitSqlStatements('-- c\nSELECT 1;\n-- d;\nSELECT 2;\n')).toEqual(['SELECT 1', 'SELECT 2'])
	})
})
