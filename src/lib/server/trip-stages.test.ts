import { describe, it, expect } from 'vitest'
import { detectStages, distanceKm, type TripPhoto } from './trip-stages'

const CHENGDU: [number, number] = [30.57, 104.07]
const CHONGQING: [number, number] = [29.56, 106.55]
let n = 0
const photo = (takenAt: string, c: [number, number] | null, jitter = 0): TripPhoto => ({
	path: `p${n++}`,
	takenAt,
	lat: c ? c[0] + jitter : null,
	lng: c ? c[1] + jitter : null
})
const burst = (day: string, c: [number, number] | null, count: number, hour = 9) =>
	Array.from({ length: count }, (_, i) => photo(`${day}T${String(hour).padStart(2, '0')}:${String(i).padStart(2, '0')}:00`, c, i * 0.001))

describe('detectStages', () => {
	it('sépare Chengdu et Chongqing et garde les photos sans GPS dans l’étape du jour', () => {
		const photos = [...burst('2026-05-01', CHENGDU, 6), ...burst('2026-05-02', null, 3), ...burst('2026-05-03', CHENGDU, 5), ...burst('2026-05-04', CHONGQING, 6), ...burst('2026-05-05', CHONGQING, 4)]
		const s = detectStages(photos)
		expect(s).toHaveLength(2)
		expect([s[0].dateStart, s[0].dateEnd, s[0].paths.length]).toEqual(['2026-05-01', '2026-05-03', 14])
		expect([s[1].dateStart, s[1].dateEnd, s[1].paths.length]).toEqual(['2026-05-04', '2026-05-05', 10])
	})
	it('gère un déplacement le même jour', () => {
		const photos = [...burst('2026-05-03', CHENGDU, 6, 8), ...burst('2026-05-03', CHONGQING, 6, 18)]
		const s = detectStages(photos)
		expect(s.map((x) => x.paths.length)).toEqual([6, 6])
	})
	it('ignore une photo isolée hors zone (une seule photo prise ailleurs ne crée pas d’étape)', () => {
		const photos = [...burst('2026-05-01', CHENGDU, 6), photo('2026-05-01T12:00:00', CHONGQING), ...burst('2026-05-01', CHENGDU, 4, 14)]
		expect(detectStages(photos, { minPhotos: 1 })).toHaveLength(1)
	})
	it('coupe sur une pause de plus de gapDays', () => {
		const s = detectStages([...burst('2026-05-01', CHENGDU, 6), ...burst('2026-05-20', CHENGDU, 6)])
		expect(s).toHaveLength(2)
	})
	it('fusionne une étape trop petite dans la précédente et ne perd aucune photo', () => {
		const photos = [...burst('2026-05-01', CHENGDU, 8), ...burst('2026-05-02', CHONGQING, 3)]
		const s = detectStages(photos)
		expect(s).toHaveLength(1)
		expect(s.flatMap((x) => x.paths).sort()).toEqual(photos.map((p) => p.path).sort())
	})
	it('coupe une étape de plus de maxDays', () => {
		const days = Array.from({ length: 70 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10))
		const s = detectStages(days.flatMap((d) => burst(d, CHENGDU, 5)), { maxDays: 60 })
		expect(s.length).toBeGreaterThan(1)
		for (const x of s) expect(Date.parse(x.dateEnd) - Date.parse(x.dateStart)).toBeLessThanOrEqual(61 * 86400000)
	})
	it('distance Chengdu–Chongqing ≈ 270 km', () => {
		expect(distanceKm(...CHENGDU, ...CHONGQING)).toBeGreaterThan(250)
		expect(distanceKm(...CHENGDU, ...CHONGQING)).toBeLessThan(300)
	})
})
