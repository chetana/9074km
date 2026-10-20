import { describe, it, expect } from 'vitest'
import { layoutAt, ALBUM, snapTarget, clampPos, nearestByDate, cssTransform, cardScale, fitStage, CARD_FULL_H, TIGHT_BELOW } from './carousel-layout'

describe('layoutAt (carrousel Album)', () => {
	it('d = 0 : carte centrale neutre, agrandie, opaque, au premier plan', () => {
		const t = layoutAt(0)
		expect(t).toMatchObject({ visible: true, tx: 0, tz: 0, rotY: 0, opacity: 1, brightness: 1, zIndex: 100 })
		expect(t.scale).toBeCloseTo(1 + ALBUM.boost)
	})
	it('symétrie : d et −d donnent des valeurs opposées (tx, rotY) ou égales (reste)', () => {
		for (const d of [0.3, 1, 1.7, 3.2]) {
			const p = layoutAt(d), n = layoutAt(-d)
			expect(n.tx).toBeCloseTo(-p.tx); expect(n.rotY).toBeCloseTo(-p.rotY)
			expect(n.tz).toBeCloseTo(p.tz); expect(n.scale).toBeCloseTo(p.scale); expect(n.opacity).toBeCloseTo(p.opacity); expect(n.zIndex).toBe(p.zIndex)
		}
	})
	it('l\'opacité décroît et le zIndex décroît quand |d| augmente ; la profondeur s\'éloigne', () => {
		let prev = layoutAt(0)
		for (const d of [0.5, 1, 1.5, 2, 2.5, 3, 3.5]) {
			const t = layoutAt(d)
			expect(t.opacity).toBeLessThan(prev.opacity); expect(t.zIndex).toBeLessThan(prev.zIndex); expect(t.tz).toBeLessThan(prev.tz)
			prev = t
		}
	})
	it('au-delà de 3,6 : non rendue', () => {
		expect(layoutAt(3.61).visible).toBe(false); expect(layoutAt(-4).visible).toBe(false); expect(layoutAt(3.6).visible).toBe(true)
	})
	it('prefers-reduced-motion : jamais d\'inclinaison ni de profondeur', () => {
		for (const d of [-3, -1, 0, 0.4, 2]) { const t = layoutAt(d, true); expect(t.rotY).toBe(0); expect(t.tz).toBe(0); expect(t.scale).toBe(1) }
		expect(layoutAt(2, true).opacity).toBeLessThan(layoutAt(1, true).opacity)
	})
	it('constantes de la maquette : voisine à 122 px et 44°', () => {
		const t = layoutAt(1)
		expect(t.tx).toBe(122); expect(t.rotY).toBe(-44); expect(cssTransform(t)).toContain('rotateY(-44deg)')
	})
})

describe('snap et date', () => {
	it('snapTarget : carte la plus proche, prolongée par la vitesse, bornée', () => {
		expect(snapTarget(2.4, 0, 10)).toBe(2)
		expect(snapTarget(2.4, -0.3, 10)).toBe(3) // glisse vers la gauche = carte suivante
		expect(snapTarget(0.2, 2, 10)).toBe(0); expect(snapTarget(8.8, -2, 10)).toBe(9)
		expect(clampPos(5, 0)).toBe(0)
	})
	it('nearestByDate : évènement le plus proche de l\'ancien centre', () => {
		const starts = ['2026-11-30', '2026-10-10', '2026-07-08', '2025-12-24']
		expect(nearestByDate(starts, '2026-07-01')).toBe(2)
		expect(nearestByDate(starts, '2025-12-31')).toBe(3)
		expect(nearestByDate([], '2026-01-01')).toBe(0); expect(nearestByDate(starts, null)).toBe(0)
	})
})

describe('taille depuis la hauteur disponible', () => {
	it('cardScale : jamais > 1, ratio conservé, plancher 0,4, proportionnelle entre les deux', () => {
		expect(cardScale(1000)).toBe(1); expect(cardScale(10)).toBe(0.4)
		expect(cardScale(CARD_FULL_H / 2)).toBeCloseTo(0.5)
		expect(cardScale(300)).toBeLessThan(cardScale(340))
	})
	it('cssTransform : décalages, profondeur et échelle suivent k', () => {
		const t = layoutAt(1)
		expect(cssTransform(t, 0.5)).toBe(`translate3d(${122 * 0.5}px,0,${-70 * 0.5}px) rotateY(-44deg) scale(${t.scale * 0.5})`)
	})
	it('fitStage : scène = disponible − curseur, bornée ; serré sous le seuil, avec hystérésis', () => {
		expect(fitStage(343, 44, false)).toEqual({ stageH: 295, tight: false })
		expect(fitStage(900, 44, false).stageH).toBe(440); expect(fitStage(50, 44, false).stageH).toBe(120)
		expect(fitStage(TIGHT_BELOW - 1, 44, false).tight).toBe(true)
		expect(fitStage(TIGHT_BELOW + 50, 44, true).tight).toBe(true) // reste serré tant qu'on n'a pas regagné de la place
		expect(fitStage(TIGHT_BELOW + 111, 44, true).tight).toBe(false)
	})
})
