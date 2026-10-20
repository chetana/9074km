import { describe, it, expect } from 'vitest'
import { pickPreview, randomOther, layoutAt, ALBUM, snapTarget, clampPos, nearestByDate, cssTransform, cardSize, fitStage, TIGHT_BELOW, restoreIndex, parseRemembered } from './carousel-layout'

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
	it('cardSize : taille nominale quand la place suffit, ratio conservé, plancher, texte jamais réduit', () => {
		expect(cardSize(1000)).toMatchObject({ w: 208, h: 310, cap: 146, meta2: true })
		const s = cardSize(300)
		expect(s.h).toBe(Math.floor(296 / 1.1)); expect(s.w / s.h).toBeCloseTo(208 / 310, 1)
		const small = cardSize(60)
		expect(small.h).toBe(150); expect(small.w).toBeGreaterThanOrEqual(170); expect(small.meta2).toBe(false)
		expect(small.h - small.cap).toBeGreaterThanOrEqual(40) // la couverture garde de la place
		expect(cardSize(200).cap).toBeLessThanOrEqual(cardSize(400).cap)
	})
	it('cssTransform : décalages et profondeur suivent le facteur, pas l\'échelle', () => {
		const t = layoutAt(1)
		expect(cssTransform(t, 0.5)).toBe(`translate3d(${122 * 0.5}px,0,${-70 * 0.5}px) rotateY(-44deg) scale(${t.scale})`)
	})
	it('fitStage : scène = disponible − curseur, bornée ; serré sous le seuil, avec hystérésis', () => {
		expect(fitStage(343, 44, false)).toEqual({ stageH: 295, tight: false })
		expect(fitStage(900, 44, false).stageH).toBe(440); expect(fitStage(50, 44, false).stageH).toBe(120)
		expect(fitStage(TIGHT_BELOW - 1, 44, false).tight).toBe(true)
		expect(fitStage(TIGHT_BELOW + 50, 44, true).tight).toBe(true)
		expect(fitStage(TIGHT_BELOW + 111, 44, true).tight).toBe(false)
	})
})

describe('mémoire de position', () => {
	const L = [{ id: 1, start: '2026-11-30' }, { id: 2, start: '2026-10-10' }, { id: 3, start: '2026-07-08' }, { id: 4, start: '2025-12-24' }]
	it('même évènement gardé au centre, même si la liste change (nouvel évènement, filtre qui le garde)', () => {
		expect(restoreIndex(L, { id: 3, start: '2026-07-08' })).toBe(2)
		const withNew = [{ id: 9, start: '2027-01-01' }, ...L]
		expect(restoreIndex(withNew, { id: 3, start: '2026-07-08' })).toBe(3) // un évènement créé ne déplace pas la position
	})
	it('évènement exclu par un filtre : le plus proche en date de la date mémorisée', () => {
		const filtered = [L[0], L[3]]
		expect(restoreIndex(filtered, { id: 3, start: '2026-07-08' })).toBe(0) // 2026-11-30 est à 145 j, 2025-12-24 à 196 j
		expect(restoreIndex(filtered, { id: 3, start: '2026-01-10' })).toBe(1)
		expect(restoreIndex([L[0], L[1]], { id: 4, start: '2025-12-24' })).toBe(1)
	})
	it('mémorisé supprimé/introuvable : date la plus proche ; sans mémoire ou liste vide : premier', () => {
		expect(restoreIndex(L, { id: 77, start: '2026-10-09' })).toBe(1)
		expect(restoreIndex(L, null)).toBe(0); expect(restoreIndex([], { id: 1, start: '2026-01-01' })).toBe(0)
	})
	it('parseRemembered : tolère le stockage vide ou corrompu', () => {
		expect(parseRemembered('{"id":3,"start":"2026-07-08"}')).toEqual({ id: 3, start: '2026-07-08' })
		for (const raw of [null, '', '{', '[]', '{"id":"3","start":"2026-07-08"}', '{"id":3,"start":"nimporte"}']) expect(parseRemembered(raw)).toBeNull()
	})
})

describe('pickPreview / randomOther', () => {
	const p = (n: number) => Array.from({ length: n }, (_, i) => `2026/10/11/p${i}.jpg`);
	it('3 photos réparties début-milieu-fin, sans la couverture ni les vidéos', () => {
		expect(pickPreview([...p(9), '2026/10/12/c.mp4'], '2026/10/11/p0.jpg')).toEqual(['2026/10/11/p1.jpg', '2026/10/11/p5.jpg', '2026/10/11/p8.jpg']);
	});
	it('moins de photos que demandé : toutes, jamais de doublon', () => {
		expect(pickPreview(p(2), null)).toEqual(p(2));
		expect(pickPreview([], null)).toEqual([]);
	});
	it('randomOther : jamais la carte courante, couvre toutes les autres', () => {
		for (const r of [0, 0.3, 0.99]) expect(randomOther(5, 2, r)).not.toBe(2);
		expect(new Set([0, 0.25, 0.5, 0.75, 0.99].map((r) => randomOther(5, 2, r)))).toEqual(new Set([0, 1, 3, 4]));
		expect(randomOther(1, 0, 0.5)).toBe(0);
	});
});
