// Intégration sur Postgres JETABLE local (TEST_PG_URL vers localhost), comme events-store.pg.test.ts.
import { describe, it, expect, vi, beforeAll } from 'vitest'

const URL_ = process.env.TEST_PG_URL ?? ''
const isLocal = /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)(:\d+)?\//.test(URL_)
vi.mock('$env/dynamic/private', () => ({ env: { DATABASE_URL: process.env.TEST_PG_URL } }))

import { sql } from 'drizzle-orm'
import { getDB } from './db'
import { ensureCoffreSchema, resetCoffreSchemaForTests } from './coffre-db'
import { recordMedia, markMediaDeleted, countUnclassified, listUnclassified } from './media-store'

const row = async (path: string) => {
	const r: any = await getDB().execute(sql`SELECT path, day::text AS day, kind, size, uploaded_by, to_char(taken_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS taken_at, taken_offset, lat, lng, make, model, deleted_at FROM media WHERE path = ${path}`)
	return (r.rows ?? r)[0]
}
const item = (path: string, o: Record<string, unknown> = {}) => ({ path, size: 100, takenAt: null, takenOffset: null, lat: null, lng: null, make: null, model: null, ...o }) as any

describe.skipIf(!isLocal)('media-store (Postgres local jetable)', () => {
	beforeAll(async () => {
		await getDB().execute(sql`CREATE TABLE IF NOT EXISTS users (id serial PRIMARY KEY, email text NOT NULL UNIQUE, name text, picture text, google_id text UNIQUE, logto_id text UNIQUE, created_at timestamp DEFAULT now(), last_login_at timestamp DEFAULT now())`)
		await ensureCoffreSchema()
		await getDB().execute(sql`TRUNCATE media`)
	})

	it('migration 002 idempotente (rejouée à froid sans erreur)', async () => {
		resetCoffreSchemaForTests()
		await ensureCoffreSchema()
		await ensureCoffreSchema()
		const t: any = await getDB().execute(sql`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'media'`)
		expect((t.rows ?? t)[0].n).toBe(1)
	})

	it('heure murale locale conservée telle quelle (aucune conversion de fuseau), day/kind déduits du chemin', async () => {
		await getDB().execute(sql`SET TIME ZONE 'America/Santiago'`)
		await recordMedia('Chet', [item('2026/11/02/a.jpg', { takenAt: '2026-11-02T07:15:30', takenOffset: '+07:00', lat: -33.86667, lng: -70.65, make: 'Apple', model: 'iPhone 14 Pro' }), item('2026/11/02/v.mp4')])
		const a = await row('2026/11/02/a.jpg')
		expect(a).toMatchObject({ day: '2026-11-02', kind: 'image', size: '100', uploaded_by: 'Chet', taken_at: '2026-11-02T07:15:30', taken_offset: '+07:00', lat: -33.86667, lng: -70.65, make: 'Apple' })
		expect((await row('2026/11/02/v.mp4')).kind).toBe('video')
		await getDB().execute(sql`SET TIME ZONE DEFAULT`)
	})

	it('ré-enregistrement : mise à jour et deleted_at remis à NULL ; suppression = marquage, la ligne reste', async () => {
		await markMediaDeleted('2026/11/02/a.jpg')
		const del = await row('2026/11/02/a.jpg')
		expect(del).toBeTruthy()
		expect(del.deleted_at).not.toBeNull()
		await recordMedia('Lys', [item('2026/11/02/a.jpg', { size: 555 })])
		const back = await row('2026/11/02/a.jpg')
		expect(back).toMatchObject({ size: '555', uploaded_by: 'Lys', taken_at: null })
		expect(back.deleted_at).toBeNull()
		await markMediaDeleted('2026/11/02/inconnu.jpg') // pas d'erreur sur une photo jamais indexée
	})

	it('lot de 500 lignes d\'un coup', async () => {
		await recordMedia(null, Array.from({ length: 500 }, (_, i) => item(`2027/01/01/p${i}.jpg`)))
		const r: any = await getDB().execute(sql`SELECT count(*)::int AS n FROM media WHERE day = '2027-01-01'`)
		expect((r.rows ?? r)[0].n).toBe(500)
	})

	it('contraintes en base : lat/lng hors bornes refusés (CHECK), bornes incluses acceptées, kind inconnu refusé', async () => {
		const ins = (path: string, lat: number, lng: number) => getDB().execute(sql`INSERT INTO media (path, day, kind, lat, lng) VALUES (${path}, '2026-01-01', 'image', ${lat}, ${lng})`)
		await expect(ins('2026/01/01/a.jpg', 90.0001, 0)).rejects.toBeTruthy()
		await expect(ins('2026/01/01/b.jpg', -90.0001, 0)).rejects.toBeTruthy()
		await expect(ins('2026/01/01/c.jpg', 0, 180.0001)).rejects.toBeTruthy()
		await expect(ins('2026/01/01/d.jpg', 0, -180.0001)).rejects.toBeTruthy()
		await ins('2026/01/01/e.jpg', 90, 180)
		await ins('2026/01/01/f.jpg', -90, -180)
		await expect(getDB().execute(sql`INSERT INTO media (path, day, kind) VALUES ('2026/01/01/y.jpg', '2026-01-01', 'doc')`)).rejects.toBeTruthy()
	})

	it('taken_at est un timestamp SANS fuseau (heure murale), pas timestamptz', async () => {
		const r: any = await getDB().execute(sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'media' AND column_name IN ('taken_at', 'uploaded_at', 'day')`)
		const types = Object.fromEntries((r.rows ?? r).map((x: any) => [x.column_name, x.data_type]))
		expect(types.taken_at).toBe('timestamp without time zone')
		expect(types.uploaded_at).toBe('timestamp with time zone')
		expect(types.day).toBe('date')
	})

	it('photo sans EXIF et vidéo : une ligne avec kind et size (chemin d\'upload du lot 1b)', async () => {
		await recordMedia('Chet', [item('2028/05/05/noexif.jpg', { size: 321 }), item('2028/05/05/clip.mov', { size: 9999 })])
		expect(await row('2028/05/05/noexif.jpg')).toMatchObject({ kind: 'image', size: '321', taken_at: null, lat: null, uploaded_by: 'Chet' })
		expect(await row('2028/05/05/clip.mov')).toMatchObject({ kind: 'video', size: '9999', taken_at: null })
	})

	it('« à classer » : ordre jour décroissant, curseur sans trou ni doublon, hors supprimées / ignorées / rattachées', async () => {
		await getDB().execute(sql`TRUNCATE media`)
		await getDB().execute(sql`TRUNCATE event_media, events RESTART IDENTITY CASCADE`)
		const paths: string[] = []
		for (let d = 1; d <= 4; d++) for (const f of ['a', 'b', 'c']) paths.push(`2029/03/0${d}/${f}.jpg`)
		await recordMedia(null, paths.map((p) => item(p)))
		await getDB().execute(sql`INSERT INTO users (email) VALUES ('u@lot2') ON CONFLICT (email) DO NOTHING`)
		const uid = ((await getDB().execute(sql`SELECT id FROM users WHERE email = 'u@lot2'`)) as any).rows[0].id
		const ev: any = await getDB().execute(sql`INSERT INTO events (name_fr, name_en, name_kh, name_src_lang, date_start, date_end, created_by) VALUES ('x','x','x','fr','2029-03-01','2029-03-01', ${uid}) RETURNING id`)
		const evId = (ev.rows ?? ev)[0].id
		await getDB().execute(sql`INSERT INTO event_media (media_path, event_id) VALUES ('2029/03/04/a.jpg', ${evId})`)
		await markMediaDeleted('2029/03/04/b.jpg')
		await getDB().execute(sql`UPDATE media SET skipped_at = now() WHERE path = '2029/03/03/c.jpg'`)
		expect(await countUnclassified()).toBe(12 - 3)
		const all: string[] = []
		let cursor: { day: string; path: string } | null = null
		for (let guard = 0; guard < 10; guard++) {
			const page = await listUnclassified(4, cursor)
			all.push(...page.map((x) => x.path))
			if (page.length < 4) break
			cursor = { day: page[page.length - 1].day, path: page[page.length - 1].path }
		}
		expect(all).toEqual(['2029/03/04/c.jpg', '2029/03/03/b.jpg', '2029/03/03/a.jpg', '2029/03/02/c.jpg', '2029/03/02/b.jpg', '2029/03/02/a.jpg', '2029/03/01/c.jpg', '2029/03/01/b.jpg', '2029/03/01/a.jpg'])
		// un évènement supprimé libère ses photos : elles redeviennent « à classer »
		await getDB().execute(sql`UPDATE events SET deleted_at = now() WHERE id = ${evId}`)
		expect(await countUnclassified()).toBe(10)
	})
})

import { exportEvents, liveEventRanges, createEvent, softDeleteEvent } from './events-store'
import { skipMedia, listUnclassifiedForSuggestions, listDismissals, addDismissal } from './media-store'
import { suggestEvents } from './event-suggest'

describe.skipIf(!isLocal)('lot 3-4 (Postgres local jetable)', () => {
	let uid = 0
	beforeAll(async () => {
		await getDB().execute(sql`CREATE TABLE IF NOT EXISTS users (id serial PRIMARY KEY, email text NOT NULL UNIQUE, name text, picture text, google_id text UNIQUE, logto_id text UNIQUE, created_at timestamp DEFAULT now(), last_login_at timestamp DEFAULT now())`)
		await ensureCoffreSchema()
		await getDB().execute(sql`INSERT INTO users (email) VALUES ('lot34@t') ON CONFLICT (email) DO NOTHING`)
		uid = ((await getDB().execute(sql`SELECT id FROM users WHERE email = 'lot34@t'`)) as any).rows[0].id
	})
	const evInput = (o: Record<string, unknown> = {}) => ({ name: 'E', nameLang: null, dateStart: '2036-06-05', dateEnd: '2036-06-05', place: null, emoji: null, color: 'accent' as const, autoAttach: true, mediaPaths: [] as string[], ...o }) as any
	const nm = (n: string) => ({ fr: n, en: n, kh: n, srcLang: 'fr' as const, pending: false })
	const photos = (day: string, n: number) => Array.from({ length: n }, (_, i) => item(`${day.replaceAll('-', '/')}/p${String(i).padStart(2, '0')}.jpg`))

	it('migration 003 idempotente et refus partagés (liste, contrainte de plage)', async () => {
		resetCoffreSchemaForTests()
		await ensureCoffreSchema()
		await ensureCoffreSchema()
		await getDB().execute(sql`TRUNCATE suggestion_dismissals`)
		await addDismissal(uid, '2036-06-05', '2036-06-05', 12)
		expect(await listDismissals()).toEqual([{ start: '2036-06-05', end: '2036-06-05', count: 12 }])
		await expect(getDB().execute(sql`INSERT INTO suggestion_dismissals (range_start, range_end, photo_count) VALUES ('2036-06-05', '2036-06-01', 1)`)).rejects.toBeTruthy()
		await expect(getDB().execute(sql`INSERT INTO suggestion_dismissals (range_start, range_end, photo_count) VALUES ('2036-06-05', '2036-06-05', -1)`)).rejects.toBeTruthy()
	})

	it('« Passer » : skipped_at exclut la photo, annulation la rend, et elle revient après 30 jours', async () => {
		await getDB().execute(sql`TRUNCATE media`)
		await getDB().execute(sql`TRUNCATE event_media, events RESTART IDENTITY CASCADE`)
		await recordMedia('Chet', photos('2036-06-05', 3))
		expect(await countUnclassified()).toBe(3)
		expect(await skipMedia(['2036/06/05/p00.jpg', '2036/06/05/inconnu.jpg'])).toBe(1)
		expect(await countUnclassified()).toBe(2)
		expect((await listUnclassified(10, null)).map((x) => x.path)).not.toContain('2036/06/05/p00.jpg')
		expect(await skipMedia(['2036/06/05/p00.jpg'], true)).toBe(1)
		expect(await countUnclassified()).toBe(3)
		await skipMedia(['2036/06/05/p01.jpg'])
		await getDB().execute(sql`UPDATE media SET skipped_at = now() - interval '29 days' WHERE path = '2036/06/05/p01.jpg'`)
		expect(await countUnclassified()).toBe(2) // 29 jours : toujours écartée
		await getDB().execute(sql`UPDATE media SET skipped_at = now() - interval '31 days' WHERE path = '2036/06/05/p01.jpg'`)
		expect(await countUnclassified()).toBe(3) // > 30 jours : revient
		await markMediaDeleted('2036/06/05/p02.jpg')
		expect(await skipMedia(['2036/06/05/p02.jpg'])).toBe(0) // une photo supprimée n'est pas « passée »
	})

	it('uploadedBy remonté pour le mode tri', async () => {
		const [first] = await listUnclassified(1, null)
		expect(first.uploadedBy).toBe('Chet')
	})

	it('suggestions de bout en bout : jour isolé, évènement qui couvre, évènement supprimé qui libère ses photos', async () => {
		await getDB().execute(sql`TRUNCATE media`)
		await getDB().execute(sql`TRUNCATE event_media, events RESTART IDENTITY CASCADE`)
		await recordMedia(null, [...photos('2036-06-05', 6), ...photos('2036-06-20', 2)])
		const compute = async () => suggestEvents({ media: await listUnclassifiedForSuggestions(), events: await liveEventRanges(), dismissals: await listDismissals() })
		await getDB().execute(sql`TRUNCATE suggestion_dismissals`)
		let s = await compute()
		expect(s).toHaveLength(1)
		expect(s[0]).toMatchObject({ start: '2036-06-05', count: 6, kind: 'create' })
		const e = await createEvent(uid, evInput({ name: 'Couvre', dateStart: '2036-06-04', dateEnd: '2036-06-06' }), nm('Couvre'), '2036-01-01')
		s = await compute()
		expect(s[0]).toMatchObject({ kind: 'attach', eventId: e.id })
		// on y range 4 photos : il n'en reste que 2 (non dense) → plus de suggestion
		await getDB().execute(sql`INSERT INTO event_media (media_path, event_id) SELECT path, ${e.id} FROM media WHERE path IN ('2036/06/05/p00.jpg','2036/06/05/p01.jpg','2036/06/05/p02.jpg','2036/06/05/p03.jpg')`)
		expect(await compute()).toEqual([])
		// l'évènement est supprimé : ses photos redeviennent à classer, la suggestion revient en « nouvel évènement »
		await softDeleteEvent(e.id)
		s = await compute()
		expect(s[0]).toMatchObject({ start: '2036-06-05', count: 6, kind: 'create' })
		// refus enregistré à 6 photos : masquée ; elle revient à +50 % (9 photos)
		await addDismissal(uid, '2036-06-05', '2036-06-05', 6)
		expect(await compute()).toEqual([])
		await recordMedia(null, photos('2036-06-05', 9).slice(6))
		expect((await compute())[0]).toMatchObject({ count: 9 })
	})

	it('export : évènements vivants + chemins ; rien de sensible (pas de GPS, uploader, utilisateur)', async () => {
		await getDB().execute(sql`TRUNCATE media`)
		await getDB().execute(sql`TRUNCATE event_media, events RESTART IDENTITY CASCADE`)
		await recordMedia('Lys', [item('2037/01/01/a.jpg', { lat: 11.5, lng: 104.9, make: 'Apple' }), item('2037/01/01/b.jpg')])
		const a = await createEvent(uid, evInput({ name: 'Nouvel an', dateStart: '2037-01-01', dateEnd: '2037-01-02', place: 'Phnom Penh', emoji: '🎆', mediaPaths: ['2037/01/01/a.jpg', '2037/01/01/b.jpg'] }), nm('Nouvel an'), '2036-01-01')
		const gone = await createEvent(uid, evInput({ name: 'Supprimé' }), nm('Supprimé'), '2036-01-01')
		await softDeleteEvent(gone.id)
		const out = await exportEvents()
		expect(out).toHaveLength(1)
		await getDB().execute(sql`UPDATE events SET cover_path = '2037/01/01/b.jpg', names_pending = true WHERE id = ${a.id}`)
		const out2 = await exportEvents()
		expect(out2[0]).toMatchObject({ nameSrcLang: 'fr', namesPending: true, coverPath: '2037/01/01/b.jpg' })
		expect(out[0]).toMatchObject({ id: a.id, names: { fr: 'Nouvel an' }, nameSrcLang: 'fr', namesPending: false, coverPath: null, dates: { start: '2037-01-01', end: '2037-01-02' }, place: 'Phnom Penh', emoji: '🎆', version: 1, photos: ['2037/01/01/a.jpg', '2037/01/01/b.jpg'] })
		expect(out[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
		const text = JSON.stringify(out)
		expect(text).not.toMatch(/11\.5|104\.9|Apple|Lys|created_?by|uploaded|lat|lng/i)
	})
})
