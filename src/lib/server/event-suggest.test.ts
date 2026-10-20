import { describe, it, expect } from 'vitest'
import { suggestEvents, proposeName, dayNum, dayStr, type SuggestMedia, type Dismissal, type SuggestEvent } from './event-suggest'

const photos = (day: string, n: number, kind: 'image' | 'video' = 'image'): SuggestMedia[] =>
	Array.from({ length: n }, (_, i) => ({ path: `${day.replaceAll('-', '/')}/p${String(i).padStart(3, '0')}${kind === 'video' ? '.mp4' : '.jpg'}`, day, kind }))
const run = (media: SuggestMedia[], events: SuggestEvent[] = [], dismissals: Dismissal[] = []) => suggestEvents({ media, events, dismissals })

describe('jour dense', () => {
	it('4 photos : dense ; 3 photos : non', () => {
		expect(run(photos('2026-11-30', 4))).toHaveLength(1)
		expect(run(photos('2026-11-30', 3))).toEqual([])
	})
	it('2 photos dont une vidéo : dense ; 2 photos seules ou 1 vidéo seule : non', () => {
		expect(run([...photos('2026-11-30', 1), ...photos('2026-11-30', 1, 'video')])).toHaveLength(1)
		expect(run(photos('2026-11-30', 2))).toEqual([])
		expect(run(photos('2026-11-30', 1, 'video'))).toEqual([])
		expect(run(photos('2026-11-30', 3, 'video'))).toHaveLength(1)
	})
	it('rien en entrée / jours invalides ignorés', () => {
		expect(run([])).toEqual([])
		expect(run([{ path: 'x', day: '2026-02-31', kind: 'image' }, { path: 'y', day: 'nope', kind: 'image' }])).toEqual([])
	})
})

describe('jour isolé, fusion, découpe', () => {
	it('jour isolé : une suggestion « nouvel évènement », nom = la date', () => {
		const [s] = run(photos('2026-11-30', 38))
		expect(s).toMatchObject({ id: '2026-11-30_2026-11-30', start: '2026-11-30', end: '2026-11-30', days: 1, count: 38, kind: 'create', eventId: null, proposedName: '30 novembre' })
		expect(s.paths).toHaveLength(38)
	})
	it('3 jours denses consécutifs : fusionnés en UNE plage', () => {
		const [s, ...rest] = run([...photos('2026-11-02', 5), ...photos('2026-11-03', 6), ...photos('2026-11-04', 4)])
		expect(rest).toEqual([])
		expect(s).toMatchObject({ start: '2026-11-02', end: '2026-11-04', days: 3, count: 15, proposedName: '2–4 novembre' })
	})
	it('un jour NON dense au milieu coupe la fusion', () => {
		const r = run([...photos('2026-11-02', 5), ...photos('2026-11-03', 2), ...photos('2026-11-04', 6)])
		expect(r.map((x) => x.id).sort()).toEqual(['2026-11-02_2026-11-02', '2026-11-04_2026-11-04'])
	})
	it('jour sans aucune photo au milieu : deux plages distinctes', () => {
		expect(run([...photos('2026-11-02', 5), ...photos('2026-11-04', 5)])).toHaveLength(2)
	})
	it('12 jours denses consécutifs : découpés en 2 tranches (7 + 5), jamais plus de 7 jours', () => {
		const media = Array.from({ length: 12 }, (_, i) => photos(dayStr(dayNum('2026-07-01')! + i), 5)).flat()
		const r = run(media)
		expect(r.map((x) => [x.start, x.end, x.days, x.count]).sort()).toEqual([['2026-07-01', '2026-07-07', 7, 35], ['2026-07-08', '2026-07-12', 5, 25]])
		expect(r.every((x) => x.days <= 7)).toBe(true)
	})
	it('exactement 7 jours : une seule tranche ; 8 jours : 7 + 1', () => {
		const mk = (n: number) => Array.from({ length: n }, (_, i) => photos(dayStr(dayNum('2026-07-01')! + i), 4)).flat()
		expect(run(mk(7))).toHaveLength(1)
		expect(run(mk(8)).map((x) => x.days).sort()).toEqual([1, 7])
	})
	it('fusion à travers un changement de mois et d\'année', () => {
		const [s] = run([...photos('2026-12-31', 4), ...photos('2027-01-01', 4)])
		expect(s).toMatchObject({ start: '2026-12-31', end: '2027-01-01', days: 2, proposedName: '31 décembre 2026 – 1 janvier 2027' })
		expect(run([...photos('2026-10-31', 4), ...photos('2026-11-01', 4)])[0].proposedName).toBe('31 octobre – 1 novembre')
		expect(run([...photos('2028-02-28', 4), ...photos('2028-02-29', 4), ...photos('2028-03-01', 4)])[0]).toMatchObject({ days: 3 }) // 29 février bissextile
	})
})

describe('évènement existant → « ajouter à »', () => {
	const ev = (id: number, start: string, end: string): SuggestEvent => ({ id, start, end })
	it('plage recouverte : kind attach avec l\'id', () => {
		const [s] = run(photos('2026-11-30', 38), [ev(7, '2026-11-30', '2026-11-30')])
		expect(s).toMatchObject({ kind: 'attach', eventId: 7 })
	})
	it('recouvrement partiel suffit ; évènement hors plage : create', () => {
		expect(run(photos('2026-11-30', 5), [ev(7, '2026-11-28', '2026-11-30')])[0]).toMatchObject({ kind: 'attach', eventId: 7 })
		expect(run(photos('2026-11-30', 5), [ev(7, '2026-12-01', '2026-12-05')])[0]).toMatchObject({ kind: 'create', eventId: null })
	})
	it('plusieurs candidats : le plus de jours en commun, puis le plus ancien, puis le plus petit id (déterministe)', () => {
		const media = [...photos('2026-11-02', 5), ...photos('2026-11-03', 5), ...photos('2026-11-04', 5)]
		expect(run(media, [ev(1, '2026-11-02', '2026-11-02'), ev(2, '2026-11-02', '2026-11-04')])[0].eventId).toBe(2)
		expect(run(media, [ev(9, '2026-11-02', '2026-11-03'), ev(5, '2026-11-03', '2026-11-04')])[0].eventId).toBe(9) // 2 jours chacun : le plus ancien
		expect(run(media, [ev(9, '2026-11-02', '2026-11-03'), ev(5, '2026-11-02', '2026-11-03')])[0].eventId).toBe(5) // à égalité parfaite : plus petit id
	})
	it('un évènement supprimé n\'est pas passé par l\'appelant : ses photos libérées redeviennent une suggestion « nouvel évènement »', () => {
		expect(run(photos('2026-11-30', 6), [])[0].kind).toBe('create')
	})
})

describe('refus (dismissals) et réapparition', () => {
	const d = (start: string, end: string, count: number): Dismissal => ({ start, end, count })
	it('plage écartée : exclue', () => {
		expect(run(photos('2026-11-30', 10), [], [d('2026-11-30', '2026-11-30', 10)])).toEqual([])
	})
	it('réapparaît à +50 % (>= 1,5 ×), pas avant', () => {
		expect(run(photos('2026-11-30', 14), [], [d('2026-11-30', '2026-11-30', 10)])).toEqual([]) // +40 %
		expect(run(photos('2026-11-30', 15), [], [d('2026-11-30', '2026-11-30', 10)])).toHaveLength(1) // +50 %
		expect(run(photos('2026-11-30', 4), [], [d('2026-11-30', '2026-11-30', 0)])).toHaveLength(1)
	})
	it('la plage a dérivé (jour ajouté) : le refus recouvrant continue de s\'appliquer', () => {
		expect(run([...photos('2026-11-30', 4), ...photos('2026-12-01', 4)], [], [d('2026-11-30', '2026-11-30', 6)])).toEqual([]) // 8 < 9 : reste écartée
		expect(run([...photos('2026-11-30', 6), ...photos('2026-12-01', 4)], [], [d('2026-11-30', '2026-11-30', 6)])).toHaveLength(1) // 10 >= 9 : revient
	})
	it('refus sans rapport (autres dates) : sans effet', () => {
		expect(run(photos('2026-11-30', 10), [], [d('2026-10-01', '2026-10-05', 99)])).toHaveLength(1)
	})
})

describe('ordre, plafond, déterminisme, fuseaux', () => {
	it('3 suggestions maximum, plus de photos d\'abord, ex æquo : plus récente d\'abord', () => {
		const media = [...photos('2026-01-10', 5), ...photos('2026-02-10', 9), ...photos('2026-03-10', 5), ...photos('2026-04-10', 7), ...photos('2026-05-10', 4)]
		const r = run(media)
		expect(r.map((x) => x.start)).toEqual(['2026-02-10', '2026-04-10', '2026-03-10'])
		expect(r).toHaveLength(3)
	})
	it('déterministe : même résultat quel que soit l\'ordre d\'entrée', () => {
		const media = [...photos('2026-01-10', 5), ...photos('2026-02-10', 9), ...photos('2026-02-11', 4), ...photos('2026-03-10', 5)]
		const a = run(media)
		const b = run([...media].reverse())
		const c = run([...media].sort(() => 0))
		expect(b).toEqual(a)
		expect(c).toEqual(a)
	})
	it('jour-dossier = date murale du chemin, sans aucune conversion de fuseau (23:59 le 30 reste le 30)', () => {
		const [s] = run(photos('2026-11-30', 4))
		expect(s.start).toBe('2026-11-30')
		expect(dayStr(dayNum('2026-11-30')!)).toBe('2026-11-30')
	})
	it('la fonction n\'accepte ni date d\'envoi ni LastModified : seules les clés jour/chemin/type comptent', () => {
		const m = { path: '2026/11/30/a.jpg', day: '2026-11-30', kind: 'image', uploadedAt: '2030-01-01T00:00:00Z' } as unknown as SuggestMedia
		expect(run(Array.from({ length: 4 }, () => m))[0].start).toBe('2026-11-30')
	})
	it('chemins triés, un jour isolé de 1 photo ne donne rien', () => {
		const r = run([...photos('2026-11-30', 4), ...photos('2026-12-20', 1)])
		expect(r).toHaveLength(1)
		expect([...r[0].paths]).toEqual([...r[0].paths].sort())
	})
})

describe('proposeName', () => {
	it('formats', () => {
		expect(proposeName('2026-11-30', '2026-11-30')).toBe('30 novembre')
		expect(proposeName('2026-11-02', '2026-11-04')).toBe('2–4 novembre')
		expect(proposeName('2026-11-30', '2026-12-02')).toBe('30 novembre – 2 décembre')
	})
})
