import { describe, it, expect } from 'vitest'
import { groupMessages } from './group'

function m(author: string, ts: string) {
	return { author, ts }
}

describe('groupMessages', () => {
	it('regroupe les messages du même auteur à moins de 5 min d\'écart', () => {
		const groups = groupMessages([
			m('Lys', '2026-09-22T09:00:00Z'),
			m('Lys', '2026-09-22T09:02:00Z'),
			m('Lys', '2026-09-22T09:04:00Z'),
		])
		expect(groups).toHaveLength(1)
		expect(groups[0]).toHaveLength(3)
	})

	it('coupe le groupe au changement d\'auteur', () => {
		const groups = groupMessages([
			m('Lys', '2026-09-22T09:00:00Z'),
			m('Chet', '2026-09-22T09:01:00Z'),
		])
		expect(groups).toHaveLength(2)
	})

	it('coupe le groupe au-delà de 5 min d\'écart', () => {
		const groups = groupMessages([
			m('Lys', '2026-09-22T09:00:00Z'),
			m('Lys', '2026-09-22T09:06:00Z'),
		])
		expect(groups).toHaveLength(2)
	})

	it('exactement 5 min reste dans le même groupe (borne inclusive)', () => {
		const groups = groupMessages([
			m('Lys', '2026-09-22T09:00:00Z'),
			m('Lys', '2026-09-22T09:05:00Z'),
		])
		expect(groups).toHaveLength(1)
	})

	it('liste vide → aucun groupe', () => {
		expect(groupMessages([])).toEqual([])
	})

	it('un seul message → un seul groupe d\'un élément', () => {
		const groups = groupMessages([m('Chet', '2026-09-22T09:00:00Z')])
		expect(groups).toEqual([[m('Chet', '2026-09-22T09:00:00Z')]])
	})
})
