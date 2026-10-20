// Validation pure des corps de requête des évènements (sans zod). Longueurs en points de code :
// le khmer empile des diacritiques, `.length` UTF-16 serait trompeur.
import { isValidCoffrePath, isMediaFile, isImageFile } from './coffre-path'

export const EVENT_COLORS = ['accent', 'lavender', 'gold', 'mint', 'peach'] as const
export type EventColor = (typeof EVENT_COLORS)[number]
export type NameLang = 'fr' | 'en' | 'kh'

export const NAME_MAX = 80
export const PLACE_MAX = 120
export const EMOJI_MAX_CP = 8
export const MAX_RANGE_DAYS = 366
export const MAX_PATHS = 500
const INT_MAX = 2147483647

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

export interface CreateEventInput {
	name: string
	nameLang: NameLang | null
	dateStart: string
	dateEnd: string
	place: string | null
	emoji: string | null
	color: EventColor
	autoAttach: boolean
	mediaPaths: string[]
}

export interface PatchEventInput {
	ifVersion: number
	name?: string
	nameLang?: NameLang | null
	names?: Partial<Record<NameLang, string>>
	dateStart?: string
	dateEnd?: string
	place?: string | null
	emoji?: string | null
	color?: EventColor
	autoAttach?: boolean
	coverPath?: string | null
}

const cpLen = (s: string) => Array.from(s).length
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function noUnknownKeys(body: Record<string, unknown>, allowed: string[]): string | null {
	for (const k of Object.keys(body)) if (!allowed.includes(k)) return `unknown field: ${k}`
	return null
}

/** Texte d'une ligne : NFC, trim, sans caractère de contrôle (donc ni \n ni \t). */
export function cleanLine(v: unknown): string | null {
	if (typeof v !== 'string') return null
	const s = v.normalize('NFC').trim()
	if (CONTROL.test(s)) return null
	return s
}

export function parseName(v: unknown, field = 'name'): Result<string> {
	const s = cleanLine(v)
	if (s === null) return fail(`${field} must be a single-line string`)
	const n = cpLen(s)
	if (n < 1) return fail(`${field} is required`)
	if (n > NAME_MAX) return fail(`${field} too long (max ${NAME_MAX})`)
	return { ok: true, value: s }
}

export function parsePlace(v: unknown): Result<string | null> {
	if (v === null || v === undefined) return { ok: true, value: null }
	const s = cleanLine(v)
	if (s === null) return fail('place must be a single-line string')
	if (s === '') return { ok: true, value: null }
	if (cpLen(s) > PLACE_MAX) return fail(`place too long (max ${PLACE_MAX})`)
	return { ok: true, value: s }
}

const EMOJI_CP = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[0-9#*\u200D\uFE0F\u20E3]|[\u{E0020}-\u{E007F}])$/u
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u
export function parseEmoji(v: unknown): Result<string | null> {
	if (v === null || v === undefined) return { ok: true, value: null }
	if (typeof v !== 'string') return fail('emoji must be a string')
	const s = v.trim()
	if (s === '') return { ok: true, value: null }
	if (cpLen(s) > EMOJI_MAX_CP) return fail(`emoji too long (max ${EMOJI_MAX_CP} code points)`)
	if (/\s/.test(s) || CONTROL.test(s)) return fail('emoji must not contain whitespace')
	if (!EMOJI_RE.test(s) || !Array.from(s).every((c) => EMOJI_CP.test(c))) return fail('emoji must be an emoji')
	return { ok: true, value: s }
}

export function parseColor(v: unknown): Result<EventColor> {
	if (typeof v === 'string' && (EVENT_COLORS as readonly string[]).includes(v)) {
		return { ok: true, value: v as EventColor }
	}
	return fail(`color must be one of ${EVENT_COLORS.join(', ')}`)
}

export function parseNameLang(v: unknown): Result<NameLang> {
	if (v === 'fr' || v === 'en' || v === 'kh') return { ok: true, value: v }
	return fail('nameLang must be fr, en or kh')
}

/** Jours depuis l'epoch pour une date AAAA-MM-JJ réelle du calendrier, sinon null. */
export function dayNumber(s: unknown): number | null {
	if (typeof s !== 'string') return null
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
	if (!m) return null
	const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
	if (y < 1970 || y > 2100) return null
	const t = Date.UTC(y, mo - 1, d)
	const back = new Date(t)
	if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null
	return t / 86_400_000
}

export function isValidDate(s: unknown): s is string {
	return dayNumber(s) !== null
}

export function parseDate(v: unknown, field: string): Result<string> {
	if (!isValidDate(v)) return fail(`${field} must be a valid date YYYY-MM-DD`)
	return { ok: true, value: v }
}

export function validateRange(start: string, end: string): Result<true> {
	const a = dayNumber(start), b = dayNumber(end)
	if (a === null || b === null) return fail('invalid date')
	if (b < a) return fail('dateEnd must be on or after dateStart')
	if (b - a > MAX_RANGE_DAYS) return fail(`range too long (max ${MAX_RANGE_DAYS} days)`)
	return { ok: true, value: true }
}

/** Chemins coffre dédoublonnés (ordre conservé), chacun isValidCoffrePath et fichier média. */
export function parsePaths(v: unknown, opts: { min: number; field?: string }): Result<string[]> {
	const field = opts.field ?? 'paths'
	if (!Array.isArray(v)) return fail(`${field} must be an array`)
	if (v.length > MAX_PATHS) return fail(`${field}: max ${MAX_PATHS} paths`)
	const seen = new Set<string>()
	for (const p of v) {
		if (typeof p !== 'string' || p.length > 500) return fail(`${field}: invalid path`)
		if (!isValidCoffrePath(p) || p.includes('..') || !isMediaFile(p)) return fail(`${field}: invalid path`)
		seen.add(p)
	}
	if (seen.size < opts.min) return fail(`${field} must not be empty`)
	return { ok: true, value: [...seen] }
}

export function parseIfVersion(v: unknown): Result<number> {
	if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > INT_MAX) return fail('ifVersion must be a positive integer')
	return { ok: true, value: v }
}

export function parseEventId(s: unknown): number | null {
	if (typeof s !== 'string' || !/^[1-9]\d{0,9}$/.test(s)) return null
	const n = Number(s)
	return n <= INT_MAX ? n : null
}

const CREATE_KEYS = ['name', 'nameLang', 'dateStart', 'dateEnd', 'place', 'emoji', 'color', 'autoAttach', 'mediaPaths']

export function parseCreateEvent(body: unknown): Result<CreateEventInput> {
	if (!isPlainObject(body)) return fail('body must be an object')
	const unk = noUnknownKeys(body, CREATE_KEYS)
	if (unk) return fail(unk)

	const name = parseName(body.name)
	if (!name.ok) return name
	let nameLang: NameLang | null = null
	if (body.nameLang !== undefined && body.nameLang !== null) {
		const l = parseNameLang(body.nameLang)
		if (!l.ok) return l
		nameLang = l.value
	}
	const ds = parseDate(body.dateStart, 'dateStart')
	if (!ds.ok) return ds
	const de = body.dateEnd === undefined || body.dateEnd === null ? ds : parseDate(body.dateEnd, 'dateEnd')
	if (!de.ok) return de
	const range = validateRange(ds.value, de.value)
	if (!range.ok) return range
	const place = parsePlace(body.place)
	if (!place.ok) return place
	const emoji = parseEmoji(body.emoji)
	if (!emoji.ok) return emoji
	let color: EventColor = 'accent'
	if (body.color !== undefined) {
		const c = parseColor(body.color)
		if (!c.ok) return c
		color = c.value
	}
	let autoAttach = true
	if (body.autoAttach !== undefined) {
		if (typeof body.autoAttach !== 'boolean') return fail('autoAttach must be a boolean')
		autoAttach = body.autoAttach
	}
	let mediaPaths: string[] = []
	if (body.mediaPaths !== undefined) {
		const p = parsePaths(body.mediaPaths, { min: 0, field: 'mediaPaths' })
		if (!p.ok) return p
		mediaPaths = p.value
	}
	return {
		ok: true,
		value: { name: name.value, nameLang, dateStart: ds.value, dateEnd: de.value, place: place.value, emoji: emoji.value, color, autoAttach, mediaPaths },
	}
}

const PATCH_KEYS = ['ifVersion', 'name', 'nameLang', 'names', 'dateStart', 'dateEnd', 'place', 'emoji', 'color', 'autoAttach', 'coverPath']

export function parsePatchEvent(body: unknown): Result<PatchEventInput> {
	if (!isPlainObject(body)) return fail('body must be an object')
	const unk = noUnknownKeys(body, PATCH_KEYS)
	if (unk) return fail(unk)
	const iv = parseIfVersion(body.ifVersion)
	if (!iv.ok) return iv
	const out: PatchEventInput = { ifVersion: iv.value }

	if (body.name !== undefined && body.names !== undefined) return fail('name and names are mutually exclusive')
	if (body.name !== undefined) {
		const n = parseName(body.name)
		if (!n.ok) return n
		out.name = n.value
	}
	if (body.nameLang !== undefined && body.nameLang !== null) {
		if (body.name === undefined) return fail('nameLang requires name')
		const l = parseNameLang(body.nameLang)
		if (!l.ok) return l
		out.nameLang = l.value
	}
	if (body.names !== undefined) {
		if (!isPlainObject(body.names)) return fail('names must be an object')
		const k = noUnknownKeys(body.names, ['fr', 'en', 'kh'])
		if (k) return fail(`names: ${k}`)
		const names: Partial<Record<NameLang, string>> = {}
		for (const l of ['fr', 'en', 'kh'] as const) {
			if (body.names[l] === undefined) continue
			const n = parseName(body.names[l], `names.${l}`)
			if (!n.ok) return n
			names[l] = n.value
		}
		if (Object.keys(names).length === 0) return fail('names must not be empty')
		out.names = names
	}
	if (body.dateStart !== undefined) {
		const d = parseDate(body.dateStart, 'dateStart')
		if (!d.ok) return d
		out.dateStart = d.value
	}
	if (body.dateEnd !== undefined) {
		const d = parseDate(body.dateEnd, 'dateEnd')
		if (!d.ok) return d
		out.dateEnd = d.value
	}
	if (out.dateStart && out.dateEnd) {
		const r = validateRange(out.dateStart, out.dateEnd)
		if (!r.ok) return r
	}
	if (body.place !== undefined) {
		const p = parsePlace(body.place)
		if (!p.ok) return p
		out.place = p.value
	}
	if (body.emoji !== undefined) {
		const e = parseEmoji(body.emoji)
		if (!e.ok) return e
		out.emoji = e.value
	}
	if (body.color !== undefined) {
		const c = parseColor(body.color)
		if (!c.ok) return c
		out.color = c.value
	}
	if (body.autoAttach !== undefined) {
		if (typeof body.autoAttach !== 'boolean') return fail('autoAttach must be a boolean')
		out.autoAttach = body.autoAttach
	}
	if (body.coverPath !== undefined) {
		if (body.coverPath === null) out.coverPath = null
		else {
			const p = parsePaths([body.coverPath], { min: 1, field: 'coverPath' })
			if (!p.ok) return p
			if (!isImageFile(p.value[0])) return fail('coverPath must be an image')
			out.coverPath = p.value[0]
		}
	}
	if (Object.keys(out).length === 1) return fail('nothing to update')
	return { ok: true, value: out }
}

export function parsePathsBody(body: unknown): Result<{ paths: string[] }> {
	if (!isPlainObject(body)) return fail('body must be an object')
	const unk = noUnknownKeys(body, ['paths'])
	if (unk) return fail(unk)
	const p = parsePaths(body.paths, { min: 1 })
	if (!p.ok) return p
	return { ok: true, value: { paths: p.value } }
}

export const containsKhmer = (s: string) => /[\u1780-\u17FF]/.test(s)

/** Langue source par défaut quand le client ne la précise pas : khmer si le nom contient du khmer. */
export function detectNameLang(name: string): NameLang {
	return /[ក-៿]/.test(name) ? 'kh' : 'fr'
}

/** Date murale du jour à Paris (AAAA-MM-JJ), pour décider « à venir ». */
export function todayInParis(now: Date = new Date()): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
