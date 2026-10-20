import { describe, it, expect, beforeEach } from 'vitest'
import { createUserLimiter, takeTranslation, eventCreateLimiter, resetEventLimitsForTests } from './events-limits'

beforeEach(resetEventLimitsForTests)

describe('createUserLimiter', () => {
	it('bloque au-delà du plafond puis libère après la fenêtre, par utilisateur', () => {
		const l = createUserLimiter(1000, 2)
		expect(l.take(1, 0)).toBe(true)
		expect(l.take(1, 10)).toBe(true)
		expect(l.take(1, 20)).toBe(false)
		expect(l.take(2, 20)).toBe(true)
		expect(l.take(1, 1500)).toBe(true)
	})
})

describe('plafonds évènements', () => {
	it('30 créations par heure', () => {
		for (let i = 0; i < 30; i++) expect(eventCreateLimiter.take(7, i)).toBe(true)
		expect(eventCreateLimiter.take(7, 31)).toBe(false)
		expect(eventCreateLimiter.take(7, 3_600_100)).toBe(true)
	})
	it('traductions : 20 par minute', () => {
		for (let i = 0; i < 20; i++) expect(takeTranslation(1, i)).toBe(true)
		expect(takeTranslation(1, 25)).toBe(false)
		expect(takeTranslation(1, 61_000)).toBe(true)
	})
	it('traductions : 200 par jour même en respectant la minute', () => {
		let t = 0
		let ok = 0
		for (let i = 0; i < 220; i++) { t += 4_000; if (takeTranslation(1, t)) ok++ }
		expect(ok).toBe(200)
	})
})
