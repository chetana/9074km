import { describe, it, expect } from 'vitest'
import { rateLimitDecision } from './rate-limit'

describe('rateLimitDecision', () => {
	it('autorise la 1ère requête et enregistre son timestamp', () => {
		const r = rateLimitDecision([], 1000, 60_000, 120)
		expect(r.limited).toBe(false)
		expect(r.hits).toEqual([1000])
	})

	it('autorise jusqu\'à max requêtes exactement (120), bloque la 121e', () => {
		const hits119 = Array.from({ length: 119 }, (_, i) => 1000 + i)
		const r120 = rateLimitDecision(hits119, 1000 + 119, 60_000, 120)
		expect(r120.limited).toBe(false) // 120e requête OK
		expect(r120.hits).toHaveLength(120)

		const r121 = rateLimitDecision(r120.hits, 1000 + 120, 60_000, 120)
		expect(r121.limited).toBe(true) // 121e bloquée
	})

	it('ignore les hits hors de la fenêtre glissante (le vieux trafic ne compte plus)', () => {
		const oldHits = Array.from({ length: 120 }, (_, i) => 0 + i) // tous à t=0..119
		const now = 61_000 // 61s plus tard, hors fenêtre de 60s
		const r = rateLimitDecision(oldHits, now, 60_000, 120)
		expect(r.limited).toBe(false)
		expect(r.hits).toEqual([now]) // l'ancien trafic a été purgé
	})

	it('une fenêtre partiellement expirée ne compte que les hits encore récents', () => {
		const hits = [0, 30_000, 40_000] // 3 hits à différents moments
		const now = 61_000 // le hit à t=0 est hors fenêtre (61s > 60s), les 2 autres restent
		const r = rateLimitDecision(hits, now, 60_000, 3)
		// 30_000 et 40_000 sont dans la fenêtre [1000, 61000], donc 2 hits récents < max(3) → autorisé
		expect(r.limited).toBe(false)
		expect(r.hits).toEqual([30_000, 40_000, now])
	})

	it('quand bloqué, ne pousse PAS le nouveau timestamp (n\'étend pas artificiellement le blocage)', () => {
		const hits = Array.from({ length: 120 }, (_, i) => 1000 + i)
		const r = rateLimitDecision(hits, 2000, 60_000, 120)
		expect(r.limited).toBe(true)
		expect(r.hits).toHaveLength(120) // pas 121 — le hit refusé n'est pas compté
	})
})
