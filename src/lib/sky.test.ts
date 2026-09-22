import { describe, it, expect } from 'vitest'
import { skyForHour, PARIS_STOPS, moonPhase, hourInZone } from './sky'

describe('skyForHour', () => {
	it('retourne exactement la couleur du palier à une heure pile', () => {
		const noon = skyForHour(PARIS_STOPS, 12)
		expect(noon.top.toLowerCase()).toBe('#cdeafb')
		expect(noon.night).toBe(false)
	})

	it('interpole continûment entre deux paliers (pas de saut à mi-chemin)', () => {
		const mid = skyForHour(PARIS_STOPS, 7.5) // entre le palier 6h et 9h
		expect(mid.top).not.toBe('#BEDBF4') // pas figé sur le palier de départ
		expect(mid.top).not.toBe('#C7E7FC') // pas déjà sur le palier d'arrivée
	})

	it('la continuité est garantie aux frontières de palier (02:59 ≈ 03:00)', () => {
		const justBefore = skyForHour(PARIS_STOPS, 2.98)
		const at = skyForHour(PARIS_STOPS, 3)
		expect(justBefore.top).toBe(at.top)
	})

	it('couvre les 8 tranches définies sans lever d\'exception', () => {
		for (let h = 0; h <= 24; h += 0.5) {
			const c = skyForHour(PARIS_STOPS, h)
			expect(c.top).toMatch(/^#[0-9a-f]{6}$/i)
		}
	})

	it('la tranche minuit/nuit reste marquée night=true', () => {
		expect(skyForHour(PARIS_STOPS, 1).night).toBe(true)
		expect(skyForHour(PARIS_STOPS, 23).night).toBe(true)
	})
})

describe('moonPhase', () => {
	it('reste dans les bornes [0, 1)', () => {
		for (let d = 0; d < 40; d++) {
			const phase = moonPhase(new Date(Date.UTC(2026, 0, 1 + d)))
			expect(phase).toBeGreaterThanOrEqual(0)
			expect(phase).toBeLessThan(1)
		}
	})
})

describe('hourInZone', () => {
	it('retourne une heure décimale entre 0 et 24', () => {
		const h = hourInZone('Europe/Paris', new Date('2026-06-15T12:00:00Z'))
		expect(h).toBeGreaterThanOrEqual(0)
		expect(h).toBeLessThan(24)
	})

	it('Paris et Phnom Penh diffèrent bien (fuseaux différents)', () => {
		const d = new Date('2026-06-15T12:00:00Z')
		const paris = hourInZone('Europe/Paris', d)
		const kp = hourInZone('Asia/Phnom_Penh', d)
		expect(paris).not.toBe(kp)
	})
})
