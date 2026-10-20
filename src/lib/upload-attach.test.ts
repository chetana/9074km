import { describe, it, expect, vi } from 'vitest'
import type { EventDTO } from './events-types'
import { preselectEvent, resolveGroupEvents, attachUploaded, skippedMessage } from './upload-attach'

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
		const { failed, skipped } = await attachUploaded([{ eventId: 1, paths: ['2026/10/02/a.jpg'] }, { eventId: 2, paths: ['2026/10/03/b.jpg', '2026/10/03/c.jpg'] }], add)
		expect(failed).toEqual([])
		expect(skipped).toEqual([])
		expect(add.mock.calls).toEqual([[1, ['2026/10/02/a.jpg']], [2, ['2026/10/03/b.jpg', '2026/10/03/c.jpg']]])
	})
	it('lot vide (envoi totalement échoué) : aucun appel, jamais de lien fantôme', async () => {
		const add = vi.fn(async () => {})
		expect(await attachUploaded([{ eventId: 1, paths: [] }], add)).toEqual({ failed: [], skipped: [] })
		expect(add).not.toHaveBeenCalled()
	})
	it('échec partiel : les lots réussis passent, seul le lot en échec est rendu pour « Réessayer »', async () => {
		const add = vi.fn(async (id: number) => { if (id === 2) throw new Error('net') })
		const { failed } = await attachUploaded([{ eventId: 1, paths: ['a'] }, { eventId: 2, paths: ['b'] }, { eventId: 3, paths: ['c'] }], add)
		expect(failed).toEqual([{ eventId: 2, paths: ['b'] }])
		expect(add).toHaveBeenCalledTimes(3)
	})
})

describe('photos déjà rangées dans un autre évènement (deux appareils, même nom de fichier)', () => {
	const T = { skipOther: { fr: '{n} photo(s) déjà dans un autre évènement, non déplacée(s)', kh: '{n} រូបថត' }, skipNamed: { fr: 'Déjà dans « {x} » : {n} photo(s) non déplacée(s)', kh: '«{x}» ៖ {n} រូបថត' } }
	it('attachUploaded remonte les photos laissées en place avec leur évènement actuel', async () => {
		const add = vi.fn(async () => ({ added: 1, skipped: [{ path: '2026/10/02/IMG_1.jpg', eventId: 6 }] }))
		const { failed, skipped } = await attachUploaded([{ eventId: 2, paths: ['2026/10/02/IMG_1.jpg', '2026/10/02/IMG_2.jpg'] }], add)
		expect(failed).toEqual([])
		expect(skipped).toEqual([{ eventId: 2, path: '2026/10/02/IMG_1.jpg', otherEventId: 6 }])
	})
	it('message : pluriels français, nom de l\'évènement quand il est connu', () => {
		expect(skippedMessage(1, null, T)).toEqual({ fr: '1 photo déjà dans un autre évènement, non déplacée', kh: '1 រូបថត' })
		expect(skippedMessage(3, null, T).fr).toBe('3 photos déjà dans un autre évènement, non déplacées')
		expect(skippedMessage(2, 'Anniversaire', T)).toEqual({ fr: 'Déjà dans « Anniversaire » : 2 photos non déplacées', kh: '«Anniversaire» ៖ 2 រូបថត' })
	})
})
