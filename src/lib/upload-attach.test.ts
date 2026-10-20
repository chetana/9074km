import { describe, it, expect, vi } from 'vitest'
import type { EventDTO } from './events-types'
import { preselectEvent, resolveGroupEvents, attachUploaded } from './upload-attach'

const ev = (id: number, autoAttach = true): EventDTO => ({ id, names: { fr: 'e', en: 'e', kh: 'e' }, nameSrcLang: 'fr', namesPending: false, dates: { start: '2026-10-02', end: '2026-10-02' }, cover: null, place: null, emoji: null, color: 'accent', autoAttach, version: 1, count: 0, upcoming: false })

describe('preselectEvent', () => {
	it('premier évènement couvrant avec « ajouter ici » ; aucun si aucun ne le propose', () => {
		expect(preselectEvent([ev(3), ev(4)])).toBe(3)
		expect(preselectEvent([ev(3, false), ev(4)])).toBe(4)
		expect(preselectEvent([ev(3, false)])).toBeNull()
		expect(preselectEvent([])).toBeNull()
	})
})

describe('resolveGroupEvents', () => {
	const cov = new Map([['2026-10-02', [ev(7)]], ['2026-10-03', [ev(8)]], ['2026-10-20', [ev(9)]]])
	it('la date choisie garde le choix explicite (même « Aucun »), les autres dates prennent leur évènement couvrant', () => {
		expect(resolveGroupEvents(['2026-10-02', '2026-10-03', '2026-10-20'], '2026-10-20', null, cov)).toEqual([
			{ date: '2026-10-02', eventId: 7 }, { date: '2026-10-03', eventId: 8 }, { date: '2026-10-20', eventId: null },
		])
		expect(resolveGroupEvents(['2026-10-20'], '2026-10-20', 42, cov)).toEqual([{ date: '2026-10-20', eventId: 42 }])
	})
	it('date sans évènement couvrant : aucun', () => {
		expect(resolveGroupEvents(['2026-11-11'], '2026-10-20', 9, cov)).toEqual([{ date: '2026-11-11', eventId: null }])
	})
})

describe('attachUploaded', () => {
	it('un POST par évènement avec exactement les chemins envoyés', async () => {
		const add = vi.fn(async () => {})
		const failed = await attachUploaded([{ eventId: 1, paths: ['2026/10/02/a.jpg'] }, { eventId: 2, paths: ['2026/10/03/b.jpg', '2026/10/03/c.jpg'] }], add)
		expect(failed).toEqual([])
		expect(add.mock.calls).toEqual([[1, ['2026/10/02/a.jpg']], [2, ['2026/10/03/b.jpg', '2026/10/03/c.jpg']]])
	})
	it('lot vide (envoi totalement échoué) : aucun appel, jamais de lien fantôme', async () => {
		const add = vi.fn(async () => {})
		expect(await attachUploaded([{ eventId: 1, paths: [] }], add)).toEqual([])
		expect(add).not.toHaveBeenCalled()
	})
	it('échec partiel : les lots réussis passent, seul le lot en échec est rendu pour « Réessayer »', async () => {
		const add = vi.fn(async (id: number) => { if (id === 2) throw new Error('net') })
		const failed = await attachUploaded([{ eventId: 1, paths: ['a'] }, { eventId: 2, paths: ['b'] }, { eventId: 3, paths: ['c'] }], add)
		expect(failed).toEqual([{ eventId: 2, paths: ['b'] }])
		expect(add).toHaveBeenCalledTimes(3)
	})
})
