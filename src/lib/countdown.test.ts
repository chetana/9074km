import { describe, it, expect } from 'vitest'
import { ARRIVAL_PARIS, getCountdown, showArrivalCard, ARRIVAL_CELEBRATION_DAYS } from './countdown'

describe('getCountdown (arrivée de Lys à Paris, 2 novembre 2026)', () => {
	it("l'arrivée est le 2 novembre 2026 à 00:00 heure de Paris (UTC+1)", () => {
		expect(ARRIVAL_PARIS.toISOString()).toBe('2026-11-01T23:00:00.000Z')
	})

	it('il reste exactement 21 jours le 12 octobre à minuit heure de Paris', () => {
		// 12/10 00:00 Paris (heure d'été, UTC+2) = 11/10 22:00 UTC ; le changement d'heure (25/10) ne fausse pas le compte
		const c = getCountdown(new Date('2026-10-11T22:00:00Z'))
		expect(c.arrived).toBe(false)
		expect(c.days).toBe(21)
		expect(c.hours).toBe(1) // le passage à l'heure d'hiver ajoute 1 h réelle
		expect(c.minutes).toBe(0)
	})

	it('décompose jours / heures / minutes / secondes', () => {
		// 2 j 3 h 4 min 5 s avant l'arrivée
		const now = new Date(ARRIVAL_PARIS.getTime() - ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000)
		expect(getCountdown(now)).toMatchObject({ arrived: false, days: 2, hours: 3, minutes: 4, seconds: 5, sinceDays: 0 })
	})

	it('une seconde avant : 0 jour, 0 h, 0 min, 1 s — pas encore arrivée', () => {
		const c = getCountdown(new Date(ARRIVAL_PARIS.getTime() - 1000))
		expect(c).toMatchObject({ arrived: false, days: 0, hours: 0, minutes: 0, seconds: 1 })
	})

	it("à l'instant d'arrivée : arrivée, tout à 0", () => {
		expect(getCountdown(ARRIVAL_PARIS)).toMatchObject({ arrived: true, days: 0, hours: 0, minutes: 0, seconds: 0, sinceDays: 0 })
	})

	it("après l'arrivée : compte les jours écoulés", () => {
		const c = getCountdown(new Date(ARRIVAL_PARIS.getTime() + 3 * 86_400_000 + 5000))
		expect(c).toMatchObject({ arrived: true, sinceDays: 3 })
	})
})

describe('showArrivalCard', () => {
	it('visible avant, pendant les jours de célébration, puis masquée', () => {
		const at = (offsetMs: number) => showArrivalCard(getCountdown(new Date(ARRIVAL_PARIS.getTime() + offsetMs)))
		expect(at(-30 * 86_400_000)).toBe(true)
		expect(at(0)).toBe(true)
		expect(at((ARRIVAL_CELEBRATION_DAYS - 1) * 86_400_000 + 3_600_000)).toBe(true)
		expect(at(ARRIVAL_CELEBRATION_DAYS * 86_400_000)).toBe(false)
	})
})
