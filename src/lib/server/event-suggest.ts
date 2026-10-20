// Suggestions d'évènements (lot 4) : fonction PURE, déterministe, sans horloge ni accès base.
// Entrée = photos « à classer » rangées par JOUR-DOSSIER (date murale locale de l'uploader, lue dans le chemin
// YYYY/MM/DD/…) : aucune conversion de fuseau, et ni uploaded_at ni LastModified n'entrent jamais ici.
import { MONTHS_FR } from '../i18n'

export interface SuggestMedia { path: string; day: string; kind: 'image' | 'video' }
export interface SuggestEvent { id: number; start: string; end: string }
export interface Dismissal { start: string; end: string; count: number }

export interface Suggestion {
	id: string // `${start}_${end}`
	start: string
	end: string
	days: number
	count: number
	kind: 'attach' | 'create'
	eventId: number | null // évènement existant qui recouvre la plage (kind = attach)
	proposedName: string // « 30 novembre », « 2–4 novembre » (kind = create)
	paths: string[]
}

export const DENSE_MIN = 4 // un jour est « dense » dès 4 photos…
export const DENSE_MIN_WITH_VIDEO = 2 // …ou 2 avec au moins une vidéo
export const MAX_RANGE_DAYS = 7
export const MAX_SUGGESTIONS = 3
export const REAPPEAR_RATIO = 1.5 // une suggestion écartée revient si la plage grossit d'au moins 50 %

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Numéro de jour (jours depuis l'epoch) d'une date AAAA-MM-JJ réelle, sinon null. Pur calendrier : aucun fuseau. */
export function dayNum(s: string): number | null {
	const m = DAY_RE.exec(s)
	if (!m) return null
	const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
	const t = Date.UTC(y, mo - 1, d)
	const b = new Date(t)
	if (b.getUTCFullYear() !== y || b.getUTCMonth() !== mo - 1 || b.getUTCDate() !== d) return null
	return t / 86_400_000
}

export function dayStr(n: number): string {
	return new Date(n * 86_400_000).toISOString().slice(0, 10)
}

/** Nom proposé pour une plage : « 30 novembre », « 2–4 novembre », « 30 novembre – 2 décembre ». */
export function proposeName(start: string, end: string): string {
	const [y1, m1, d1] = start.split('-').map(Number)
	const [y2, m2, d2] = end.split('-').map(Number)
	const mo = (m: number) => MONTHS_FR[m - 1].toLowerCase()
	if (start === end) return `${d1} ${mo(m1)}`
	if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${mo(m1)}`
	if (y1 === y2) return `${d1} ${mo(m1)} – ${d2} ${mo(m2)}`
	return `${d1} ${mo(m1)} ${y1} – ${d2} ${mo(m2)} ${y2}`
}

interface Day { n: number; count: number; video: boolean; paths: string[] }

export function suggestEvents(input: { media: SuggestMedia[]; events: SuggestEvent[]; dismissals: Dismissal[] }): Suggestion[] {
	// 1. jours-dossiers (jours sans photo : absents, donc jamais denses)
	const byDay = new Map<number, Day>()
	for (const m of input.media) {
		const n = dayNum(m.day)
		if (n === null) continue
		const d = byDay.get(n) ?? { n, count: 0, video: false, paths: [] }
		d.count++
		d.video ||= m.kind === 'video'
		d.paths.push(m.path)
		byDay.set(n, d)
	}
	// 2. jours denses, croissants
	const dense = [...byDay.values()].filter((d) => d.count >= DENSE_MIN || (d.count >= 2 && d.video)).sort((a, b) => a.n - b.n)
	// 3. fusion des jours denses CONSÉCUTIFS (veille/lendemain calendaires)
	const merged: Day[][] = []
	for (const d of dense) {
		const last = merged[merged.length - 1]
		if (last && last[last.length - 1].n + 1 === d.n) last.push(d)
		else merged.push([d])
	}
	// 4. découpe des plages > 7 jours en tranches de 7
	const slices: Day[][] = []
	for (const run of merged) for (let i = 0; i < run.length; i += MAX_RANGE_DAYS) slices.push(run.slice(i, i + MAX_RANGE_DAYS))

	const events = input.events.map((e) => ({ id: e.id, s: dayNum(e.start), e: dayNum(e.end) })).filter((e): e is { id: number; s: number; e: number } => e.s !== null && e.e !== null)
	const dismissals = input.dismissals.map((x) => ({ s: dayNum(x.start), e: dayNum(x.end), count: x.count })).filter((x): x is { s: number; e: number; count: number } => x.s !== null && x.e !== null)

	const out: Suggestion[] = []
	for (const slice of slices) {
		const s = slice[0].n, e = slice[slice.length - 1].n
		const count = slice.reduce((n, d) => n + d.count, 0)
		// 6. écartée ? (chevauchement avec un refus, sauf si la plage a grossi d'au moins 50 %)
		if (dismissals.some((x) => x.s <= e && x.e >= s && count < x.count * REAPPEAR_RATIO)) continue
		// 5. évènement existant qui recouvre la plage : le plus de jours en commun, puis le plus ancien, puis id
		let best: { id: number; overlap: number; s: number } | null = null
		for (const ev of events) {
			const overlap = Math.min(e, ev.e) - Math.max(s, ev.s) + 1
			if (overlap <= 0) continue
			if (!best || overlap > best.overlap || (overlap === best.overlap && (ev.s < best.s || (ev.s === best.s && ev.id < best.id)))) best = { id: ev.id, overlap, s: ev.s }
		}
		const start = dayStr(s), end = dayStr(e)
		out.push({
			id: `${start}_${end}`, start, end, days: e - s + 1, count,
			kind: best ? 'attach' : 'create', eventId: best?.id ?? null,
			proposedName: proposeName(start, end),
			paths: slice.flatMap((d) => d.paths).sort(),
		})
	}
	// 7. plus de photos d'abord ; à égalité la plage la plus récente, puis la plus longue ; 3 maximum
	return out.sort((a, b) => b.count - a.count || (a.start < b.start ? 1 : a.start > b.start ? -1 : 0) || (a.end < b.end ? 1 : a.end > b.end ? -1 : 0)).slice(0, MAX_SUGGESTIONS)
}
