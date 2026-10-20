import { describe, it, expect } from 'vitest'
import {
	parseCreateEvent, parsePatchEvent, parsePathsBody, parseName, parsePlace, parseEmoji, parseColor,
	isValidDate, validateRange, parseEventId, detectNameLang, todayInParis, dayNumber,
} from './events-validate'

const base = { name: 'Disneyland Paris', dateStart: '2026-11-30' }
const ok = (r: { ok: boolean }) => expect(r.ok).toBe(true)
const ko = (r: { ok: boolean }) => expect(r.ok).toBe(false)

describe('parseName', () => {
	it('refuse vide, espaces seuls, non-string, multiligne', () => {
		for (const v of ['', '   ', '\t', 12, null, undefined, 'a\nb', 'a\u0000b']) ko(parseName(v))
	})
	it('trim et normalise NFC', () => {
		const r = parseName('  Café  ')
		expect(r).toEqual({ ok: true, value: 'Café' })
	})
	it('1 à 80 points de code (pas des unités UTF-16)', () => {
		ok(parseName('a'))
		ok(parseName('a'.repeat(80)))
		ko(parseName('a'.repeat(81)))
		ok(parseName('😀'.repeat(80)))
		ko(parseName('😀'.repeat(81)))
	})
	it('accepte le khmer (diacritiques empilés)', () => {
		ok(parseName('ដំណើរកម្សាន្តទៅឌីស្នីឡែន'))
		ok(parseName('ក្'.repeat(40)))
	})
})

describe('dates', () => {
	it('refuse les dates impossibles ou mal formées', () => {
		for (const d of ['2026-02-31', '2026-13-01', '2026-00-10', '2026-04-31', '2026-1-1', '30/11/2026', '2026-11-30T00:00', '', null, 20261130, '2026-11-3O'])
			expect(isValidDate(d)).toBe(false)
	})
	it('29 février : année bissextile seulement', () => {
		expect(isValidDate('2028-02-29')).toBe(true)
		expect(isValidDate('2027-02-29')).toBe(false)
	})
	it('bornes d\'année', () => {
		expect(dayNumber('1969-12-31')).toBeNull()
		expect(dayNumber('2101-01-01')).toBeNull()
	})
	it('plage : fin >= début, <= 366 jours', () => {
		ok(validateRange('2026-11-30', '2026-11-30'))
		ko(validateRange('2026-12-01', '2026-11-30'))
		ok(validateRange('2026-01-01', '2027-01-02')) // 366 jours
		ko(validateRange('2026-01-01', '2027-01-03')) // 367 jours
	})
})

describe('parseCreateEvent', () => {
	it('minimal : dateEnd = dateStart, défauts', () => {
		const r = parseCreateEvent(base)
		expect(r).toEqual({ ok: true, value: expect.objectContaining({ dateEnd: '2026-11-30', color: 'accent', autoAttach: true, place: null, emoji: null, mediaPaths: [], nameLang: null }) })
	})
	it('plage inversée refusée', () => ko(parseCreateEvent({ ...base, dateEnd: '2026-11-29' })))
	it('31/02 refusé', () => ko(parseCreateEvent({ ...base, dateStart: '2026-02-31' })))
	it('plage > 366 jours refusée', () => ko(parseCreateEvent({ ...base, dateEnd: '2028-01-01' })))
	it('clé inconnue refusée', () => ko(parseCreateEvent({ ...base, hacker: 1 })))
	it('corps non objet refusé', () => { for (const b of [null, 'x', [], 3]) ko(parseCreateEvent(b)) })
	it('couleur hors liste refusée, tokens existants acceptés', () => {
		ko(parseCreateEvent({ ...base, color: 'red' }))
		ko(parseCreateEvent({ ...base, color: 'sky' }))
		for (const c of ['accent', 'lavender', 'gold', 'mint', 'peach']) ok(parseColor(c))
	})
	it('autoAttach doit être booléen', () => ko(parseCreateEvent({ ...base, autoAttach: 'yes' })))
	it('lieu : ≤ 120, vide -> null', () => {
		ko(parseCreateEvent({ ...base, place: 'x'.repeat(121) }))
		expect(parsePlace('  ')).toEqual({ ok: true, value: null })
		expect(parsePlace('Marne-la-Vallée')).toEqual({ ok: true, value: 'Marne-la-Vallée' })
	})
	it('nameLang validé', () => {
		ok(parseCreateEvent({ ...base, nameLang: 'kh' }))
		ko(parseCreateEvent({ ...base, nameLang: 'de' }))
	})
	it('mediaPaths : valides et dédoublonnés', () => {
		const r = parseCreateEvent({ ...base, mediaPaths: ['2026/11/30/a.jpg', '2026/11/30/a.jpg', '2026/11/30/b.jpg'] })
		expect(r.ok && r.value.mediaPaths).toEqual(['2026/11/30/a.jpg', '2026/11/30/b.jpg'])
	})
	it('mediaPaths : 500 max', () => {
		const mk = (n: number) => Array.from({ length: n }, (_, i) => `2026/11/30/p${i}.jpg`)
		ok(parseCreateEvent({ ...base, mediaPaths: mk(500) }))
		ko(parseCreateEvent({ ...base, mediaPaths: mk(501) }))
	})
})

describe('emoji', () => {
	it('accepte emoji simples, ZWJ, drapeaux, keycap', () => {
		for (const e of ['🎢', '👩‍❤️‍👨', '🇫🇷', '1️⃣', '❤️']) ok(parseEmoji(e))
	})
	it('refuse texte, espace, trop long', () => {
		for (const e of ['abc', 'a🎢', '🎢 🎢', '🎢'.repeat(9), 5]) ko(parseEmoji(e))
	})
	it('8 points de code max', () => ok(parseEmoji('🎢'.repeat(8))))
	it('vide/null -> null', () => {
		expect(parseEmoji('')).toEqual({ ok: true, value: null })
		expect(parseEmoji(null)).toEqual({ ok: true, value: null })
	})
})

describe('parsePathsBody', () => {
	const p = (paths: unknown) => parsePathsBody({ paths })
	it('refuse .., autre feature, sous-dossier, méta, vide, non-tableau', () => {
		ko(p(['2026/11/../12/a.jpg']))
		ko(p(['../2026/11/30/a.jpg']))
		ko(p(['chat/2026/09/22.json']))
		ko(p(['2026/11/30/x/a.jpg']))
		ko(p(['2026/11/30/meta.json']))
		ko(p(['2026/11/30/note.txt']))
		ko(p([]))
		ko(p('2026/11/30/a.jpg'))
		ko(p([42]))
		ko(p(['2026/11/30/' + 'a'.repeat(500) + '.jpg']))
	})
	it('doublons fusionnés, ordre conservé, unicode accepté', () => {
		const r = p(['2026/11/30/b.jpg', '2026/11/30/a.jpg', '2026/11/30/b.jpg', '2026/11/30/ភូមិ.jpg'])
		expect(r).toEqual({ ok: true, value: { paths: ['2026/11/30/b.jpg', '2026/11/30/a.jpg', '2026/11/30/ភូមិ.jpg'], mode: 'move' } })
	})
	it('clé inconnue refusée', () => ko(parsePathsBody({ paths: ['2026/11/30/a.jpg'], x: 1 })))
	it('mode : move (défaut) ou keep, rien d\'autre', () => {
		expect(parsePathsBody({ paths: ['2026/11/30/a.jpg'], mode: 'keep' })).toEqual({ ok: true, value: { paths: ['2026/11/30/a.jpg'], mode: 'keep' } })
		for (const mode of ['overwrite', '', 1, null, true]) ko(parsePathsBody({ paths: ['2026/11/30/a.jpg'], mode }))
	})
})

describe('parsePatchEvent', () => {
	it('ifVersion obligatoire, entier ≥ 1', () => {
		ko(parsePatchEvent({ name: 'x' }))
		for (const v of [0, -1, 1.5, '2', NaN, Infinity, 2147483648]) ko(parsePatchEvent({ ifVersion: v, name: 'x' }))
		ok(parsePatchEvent({ ifVersion: 1, name: 'x' }))
	})
	it('rien à modifier refusé', () => ko(parsePatchEvent({ ifVersion: 1 })))
	it('name et names exclusifs', () => ko(parsePatchEvent({ ifVersion: 1, name: 'a', names: { fr: 'b' } })))
	it('names : seules fr/en/kh, chacun validé', () => {
		ok(parsePatchEvent({ ifVersion: 1, names: { fr: 'Parc', kh: 'ឧទ្យាន' } }))
		ko(parsePatchEvent({ ifVersion: 1, names: { de: 'x' } }))
		ko(parsePatchEvent({ ifVersion: 1, names: { fr: '' } }))
		ko(parsePatchEvent({ ifVersion: 1, names: {} }))
	})
	it('nameLang exige name', () => {
		ko(parsePatchEvent({ ifVersion: 1, nameLang: 'fr', place: 'x' }))
	})
	it('dates dans le même PATCH : plage vérifiée', () => {
		ko(parsePatchEvent({ ifVersion: 1, dateStart: '2026-12-02', dateEnd: '2026-12-01' }))
		ok(parsePatchEvent({ ifVersion: 1, dateStart: '2026-12-01' }))
	})
	it('place null efface, emoji null efface', () => {
		const r = parsePatchEvent({ ifVersion: 3, place: null, emoji: null })
		expect(r).toEqual({ ok: true, value: { ifVersion: 3, place: null, emoji: null } })
	})
	it('coverPath : image valide ou null ; vidéo refusée', () => {
		ok(parsePatchEvent({ ifVersion: 1, coverPath: '2026/11/30/a.jpg' }))
		ok(parsePatchEvent({ ifVersion: 1, coverPath: null }))
		ko(parsePatchEvent({ ifVersion: 1, coverPath: '2026/11/30/a.mp4' }))
		ko(parsePatchEvent({ ifVersion: 1, coverPath: '../a.jpg' }))
	})
})

describe('utilitaires', () => {
	it('parseEventId strict', () => {
		expect(parseEventId('12')).toBe(12)
		for (const s of ['0', '-1', '01', '1.5', 'abc', '', '12 ', '99999999999', '2147483648', undefined]) expect(parseEventId(s)).toBeNull()
	})
	it('detectNameLang : khmer sinon fr', () => {
		expect(detectNameLang('ឌីស្នីឡែន')).toBe('kh')
		expect(detectNameLang('Disneyland')).toBe('fr')
	})
	it('todayInParis suit le fuseau de Paris, pas UTC', () => {
		expect(todayInParis(new Date('2026-11-30T23:30:00Z'))).toBe('2026-12-01')
		expect(todayInParis(new Date('2026-07-01T12:00:00Z'))).toBe('2026-07-01')
	})
})

import { parseMediaBatch } from './events-validate'

describe('parseMediaBatch', () => {
	const item = (o: Record<string, unknown> = {}) => ({ path: '2026/11/02/a.jpg', size: 1234, takenAt: '2026-11-02T07:15:30', takenOffset: '+07:00', lat: 11.55, lng: 104.9, make: 'Apple', model: 'iPhone 14 Pro', ...o })
	const batch = (...items: unknown[]) => parseMediaBatch({ items })
	it('item complet et item minimal acceptés', () => {
		ok(batch(item()))
		const r = batch({ path: '2026/11/02/b.mp4' })
		expect(r).toEqual({ ok: true, value: [{ path: '2026/11/02/b.mp4', size: null, takenAt: null, takenOffset: null, lat: null, lng: null, make: null, model: null }] })
	})
	it('chemin : isValidCoffrePath, média seulement, jour réel', () => {
		for (const path of ['chat/2026/09/22.json', '../2026/11/02/a.jpg', '2026/11/02/meta.json', '2026/11/02/x/a.jpg', '2026/13/45/a.jpg', '2026/02/31/a.jpg', 5, undefined]) ko(batch(item({ path })))
	})
	it('takenAt : ISO local strict (pas de Z, pas de date impossible)', () => {
		for (const takenAt of ['2026-11-02T07:15:30Z', '2026-11-02 07:15:30', '2026-02-31T07:15:30', '2026-11-02T24:00:00', '2026-11-02T07:60:00', '2026-11-02', 12, '']) ko(batch(item({ takenAt })))
	})
	it('offset ±HH:MM', () => {
		for (const takenOffset of ['0700', '+7:00', '+15:00', '+07:60', 'UTC', 7]) ko(batch(item({ takenOffset })))
		ok(batch(item({ takenOffset: '-05:30' })))
	})
	it('lat/lng : bornes, nombres finis, ensemble', () => {
		for (const o of [{ lat: 91 }, { lat: -91 }, { lng: 181 }, { lng: -181 }, { lat: NaN }, { lat: '11' }, { lat: Infinity }]) ko(batch(item(o)))
		ko(batch(item({ lat: 10, lng: null })))
		ok(batch(item({ lat: -90, lng: 180 })))
		ok(batch(item({ lat: null, lng: null })))
	})
	it('size : entier ≥ 0', () => {
		for (const size of [-1, 1.5, '12', Infinity]) ko(batch(item({ size })))
		ok(batch(item({ size: 0 })))
	})
	it('make/model : une ligne ≤ 64 points de code', () => {
		ko(batch(item({ make: 'a'.repeat(65) })))
		ko(batch(item({ model: 'a\nb' })))
	})
	it('clé inconnue, 0 ou > 500 éléments, corps invalide', () => {
		ko(batch(item({ gps: 1 })))
		ko(parseMediaBatch({ items: [] }))
		ko(parseMediaBatch({ items: Array.from({ length: 501 }, (_, i) => item({ path: `2026/11/02/p${i}.jpg` })) }))
		ok(parseMediaBatch({ items: Array.from({ length: 500 }, (_, i) => item({ path: `2026/11/02/p${i}.jpg` })) }))
		for (const b of [null, [], 'x', { items: 'x' }, { items: [null] }, { items: [1] }, { items: [item()], extra: 1 }]) ko(parseMediaBatch(b))
	})
	it('doublons de chemin fusionnés (le dernier gagne)', () => {
		const r = batch(item({ size: 1 }), item({ size: 2 }))
		expect(r.ok && r.value).toHaveLength(1)
		expect(r.ok && r.value[0].size).toBe(2)
	})
})

import { parseDismissBody, parseSkipBody } from './events-validate'

describe('parseDismissBody / parseSkipBody', () => {
	it('dismiss : plage valide ≤ 31 jours, count entier ≥ 0', () => {
		ok(parseDismissBody({ start: '2026-11-02', end: '2026-11-02', count: 0 }))
		ok(parseDismissBody({ start: '2026-11-01', end: '2026-12-02', count: 40 }))
		ko(parseDismissBody({ start: '2026-11-01', end: '2026-12-03', count: 40 }))
		ko(parseDismissBody({ start: '2026-11-02', end: '2026-11-01', count: 1 }))
		ko(parseDismissBody({ start: '2026-11-02', end: '2026-11-02', count: -3 }))
	})
	it('skip : 1..500 chemins valides, undo booléen', () => {
		expect(parseSkipBody({ paths: ['2026/10/02/a.jpg'], undo: true })).toEqual({ ok: true, value: { paths: ['2026/10/02/a.jpg'], undo: true } })
		expect(parseSkipBody({ paths: ['2026/10/02/a.jpg'] })).toEqual({ ok: true, value: { paths: ['2026/10/02/a.jpg'], undo: false } })
		ko(parseSkipBody({ paths: [] }))
		ko(parseSkipBody({ paths: ['../a.jpg'] }))
	})
})
