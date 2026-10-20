import { describe, it, expect } from 'vitest'
import type { EventDTO } from './events-types'
import {
	readerLangFor, displayNames, formatRange, sortEvents, groupByMonth, matchesQuery, groupPathsByDay,
	pickerSections, coveringFromList, validateEventForm, yearsOf, dayHeading,
} from './events-ui'

const ev = (id: number, start: string, o: Partial<EventDTO> = {}): EventDTO => ({
	id, names: { fr: `E${id}`, en: `E${id}`, kh: `E${id}` }, nameSrcLang: 'fr', namesPending: false,
	dates: { start, end: o.dates?.end ?? start }, cover: null, place: null, emoji: null, color: 'accent',
	autoAttach: true, version: 1, count: 0, upcoming: false, ...o,
})

describe('readerLangFor', () => {
	it('Lys lit en khmer, Chet (même avec accent) en français', () => {
		expect(readerLangFor('Lys')).toBe('kh')
		expect(readerLangFor('Vornsok Lys')).toBe('kh')
		expect(readerLangFor('Chétana')).toBe('fr')
		expect(readerLangFor(null)).toBe('fr')
	})
})

describe('displayNames', () => {
	it('langue du lecteur en premier, l\'autre en second', () => {
		const e = ev(1, '2026-11-30', { names: { fr: 'Parc', en: 'Park', kh: 'ឧទ្យាន' } })
		expect(displayNames(e, 'kh')).toMatchObject({ primary: 'ឧទ្យាន', primaryLang: 'km', secondary: 'Parc', secondaryLang: 'fr' })
		expect(displayNames(e, 'fr')).toMatchObject({ primary: 'Parc', secondary: 'ឧទ្យាន' })
	})
	it('pas de second nom identique (traduction en attente)', () => {
		expect(displayNames(ev(1, '2026-11-30'), 'fr').secondary).toBeNull()
	})
})

describe('formatRange', () => {
	it('jour seul, même mois, même année, années différentes', () => {
		expect(formatRange('2026-11-30', '2026-11-30').fr).toBe('30 novembre 2026')
		expect(formatRange('2026-11-28', '2026-11-30').fr).toBe('28–30 novembre 2026')
		expect(formatRange('2026-11-30', '2026-12-02').fr).toBe('30 nov. – 2 déc. 2026')
		expect(formatRange('2026-12-30', '2027-01-02').fr).toBe('30 déc. 2026 – 2 janv. 2027')
		expect(formatRange('2026-11-30', '2026-11-30').kh).toBe('30 វិច្ឆិកា 2026')
	})
	it('dayHeading', () => expect(dayHeading('2026-03-05')).toEqual({ fr: '5 mars', kh: '5 មីនា' }))
})

describe('sortEvents / groupByMonth', () => {
	const list = [
		ev(1, '2026-03-10'), ev(2, '2026-11-30', { upcoming: true }), ev(3, '2026-03-20'),
		ev(4, '2026-12-24', { upcoming: true }), ev(5, '2025-12-31'),
	]
	it('à venir en tête (le plus proche d\'abord), puis passé récent → ancien', () => {
		expect(sortEvents(list).map((e) => e.id)).toEqual([2, 4, 3, 1, 5])
	})
	it('séparateurs : un groupe « à venir » puis un par mois', () => {
		const g = groupByMonth(sortEvents(list))
		expect(g.map((x) => x.key)).toEqual(['upcoming', '2026-03', '2025-12'])
		expect(g[1].events.map((e) => e.id)).toEqual([3, 1])
	})
	it('ne mute pas l\'entrée', () => {
		const copy = [...list]
		sortEvents(list)
		expect(list).toEqual(copy)
	})
	it('years', () => expect(yearsOf(list)).toEqual([2026, 2025]))
})

describe('matchesQuery', () => {
	const e = ev(1, '2026-11-30', { names: { fr: 'Fête à Châtelet', en: 'x', kh: 'ដំណើរ' }, place: 'Paris' })
	it('insensible à la casse et aux accents, cherche aussi lieu et khmer', () => {
		expect(matchesQuery(e, 'chatelet')).toBe(true)
		expect(matchesQuery(e, 'PARIS')).toBe(true)
		expect(matchesQuery(e, 'ដំណើរ')).toBe(true)
		expect(matchesQuery(e, 'lyon')).toBe(false)
		expect(matchesQuery(e, '  ')).toBe(true)
	})
})

describe('groupPathsByDay', () => {
	it('un fil par jour, jours croissants', () => {
		const g = groupPathsByDay(['2026/12/01/b.jpg', '2026/11/30/z.jpg', '2026/11/30/a.jpg'])
		expect(g).toEqual([
			{ date: '2026-11-30', paths: ['2026/11/30/a.jpg', '2026/11/30/z.jpg'] },
			{ date: '2026-12-01', paths: ['2026/12/01/b.jpg'] },
		])
	})
	it('vide', () => expect(groupPathsByDay([])).toEqual([]))
})

describe('picker', () => {
	const all = [ev(1, '2026-11-28', { dates: { start: '2026-11-28', end: '2026-12-02' } }), ev(2, '2026-01-01'), ev(3, '2026-11-30', { autoAttach: false, dates: { start: '2026-11-30', end: '2026-11-30' } })]
	it('coveringFromList : auto_attach d\'abord', () => {
		expect(coveringFromList(all, '2026-11-30').map((e) => e.id)).toEqual([1, 3])
		expect(coveringFromList(all, '2026-06-01')).toEqual([])
	})
	it('suggérés puis récents sans doublon, évènement courant exclu', () => {
		const { suggested, recent } = pickerSections(all, coveringFromList(all, '2026-11-30'), 3)
		expect(suggested.map((e) => e.id)).toEqual([1])
		expect(recent.map((e) => e.id)).toEqual([2])
	})
})

describe('validateEventForm', () => {
	const ok = { name: 'x', dateStart: '2026-11-30', dateEnd: '2026-11-30' }
	it('refuse nom vide, plage inversée ou trop longue', () => {
		expect(validateEventForm(ok)).toBeNull()
		expect(validateEventForm({ ...ok, name: '   ' })).toBe('name')
		expect(validateEventForm({ ...ok, dateEnd: '2026-11-29' })).toBe('range')
		expect(validateEventForm({ ...ok, dateEnd: '2028-01-01' })).toBe('range-long')
		expect(validateEventForm({ ...ok, name: 'a'.repeat(81) })).toBe('name-long')
		expect(validateEventForm({ ...ok, dateStart: '' })).toBe('dates')
	})
})
