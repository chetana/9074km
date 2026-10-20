export interface TripPhoto {
	path: string
	takenAt: string // heure murale locale YYYY-MM-DDTHH:MM:SS
	lat: number | null
	lng: number | null
}

export interface TripStage {
	dateStart: string
	dateEnd: string
	paths: string[]
	lat: number | null
	lng: number | null
}

export interface StageOptions {
	radiusKm: number
	minPhotos: number
	gapDays: number
	maxDays: number
	confirm: number
}

export const DEFAULT_STAGE_OPTIONS: StageOptions = { radiusKm: 60, minPhotos: 5, gapDays: 3, maxDays: 60, confirm: 3 }

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
	const rad = Math.PI / 180
	const dLat = (bLat - aLat) * rad
	const dLng = (bLng - aLng) * rad
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2
	return 12742 * Math.asin(Math.sqrt(h))
}

const dayOf = (p: TripPhoto) => p.takenAt.slice(0, 10)
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)

class Acc {
	photos: TripPhoto[] = []
	private sumLat = 0
	private sumLng = 0
	private gps = 0
	add(p: TripPhoto) {
		this.photos.push(p)
		if (p.lat !== null && p.lng !== null) { this.sumLat += p.lat; this.sumLng += p.lng; this.gps++ }
	}
	get center(): [number, number] | null {
		return this.gps ? [this.sumLat / this.gps, this.sumLng / this.gps] : null
	}
	get firstDay() { return dayOf(this.photos[0]) }
	get lastDay() { return dayOf(this.photos[this.photos.length - 1]) }
}

/** Découpe chronologique en étapes : un déplacement confirmé par `confirm` photos consécutives hors du rayon, ou une pause de `gapDays`. */
export function detectStages(input: TripPhoto[], partial?: Partial<StageOptions>): TripStage[] {
	const o = { ...DEFAULT_STAGE_OPTIONS, ...partial }
	const photos = [...input].sort((a, b) => a.takenAt.localeCompare(b.takenAt) || a.path.localeCompare(b.path))
	const stages: Acc[] = []
	let cur = new Acc()
	let far: TripPhoto[] = []
	const close = () => { if (cur.photos.length) stages.push(cur); cur = new Acc() }
	const isFar = (p: TripPhoto) => {
		const c = cur.center
		return c !== null && p.lat !== null && p.lng !== null && distanceKm(c[0], c[1], p.lat, p.lng) > o.radiusKm
	}
	for (const p of photos) {
		const last = far.length ? far[far.length - 1] : cur.photos[cur.photos.length - 1]
		if (last && (daysBetween(dayOf(last), dayOf(p)) > o.gapDays || daysBetween(cur.photos[0] ? cur.firstDay : dayOf(p), dayOf(p)) > o.maxDays)) {
			for (const f of far) cur.add(f)
			far = []
			close()
		}
		if (isFar(p)) {
			far.push(p)
			if (far.length >= o.confirm) { close(); for (const f of far) cur.add(f); far = [] }
			continue
		}
		for (const f of far) cur.add(f)
		far = []
		cur.add(p)
	}
	for (const f of far) cur.add(f)
	close()
	return mergeSmall(stages, o.minPhotos, o.gapDays).map((a) => ({
		dateStart: a.firstDay,
		dateEnd: a.photos.reduce((m, p) => (dayOf(p) > m ? dayOf(p) : m), a.firstDay),
		paths: a.photos.map((p) => p.path),
		lat: a.center?.[0] ?? null,
		lng: a.center?.[1] ?? null
	}))
}

function mergeSmall(stages: Acc[], minPhotos: number, gapDays: number): Acc[] {
	const near = (a: Acc, b: Acc) => daysBetween(a.lastDay, b.firstDay) <= gapDays
	const out: Acc[] = []
	for (const s of stages) {
		const prev = out[out.length - 1]
		if (s.photos.length >= minPhotos) out.push(s)
		else if (prev && near(prev, s)) for (const p of s.photos) prev.add(p)
		else out.push(s)
	}
	const keep: Acc[] = []
	for (let i = 0; i < out.length; i++) {
		const s = out[i]
		if (s.photos.length >= minPhotos) { keep.push(s); continue }
		const next = out[i + 1]
		if (next && next.photos.length >= minPhotos && near(s, next)) { for (const p of s.photos) next.add(p); next.photos.sort((a, b) => a.takenAt.localeCompare(b.takenAt)) }
	}
	return keep
}
