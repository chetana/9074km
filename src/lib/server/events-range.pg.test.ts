// « Ajouter les photos de ces dates » sur un Postgres JETABLE (TEST_PG_URL local uniquement), voir events-store.pg.test.ts.
import { describe, it, expect, vi, beforeAll } from 'vitest'

const URL_ = process.env.TEST_PG_URL ?? ''
const isLocal = /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)(:\d+)?\//.test(URL_)
vi.mock('$env/dynamic/private', () => ({ env: { DATABASE_URL: process.env.TEST_PG_URL } }))

import { getDB } from './db'
import { sql } from 'drizzle-orm'
import { ensureCoffreSchema } from './coffre-db'
import { createEvent, softDeleteEvent, listEventMedia, countUnattachedInRange, attachUnattachedInRange } from './events-store'

const names = { fr: 'x', en: 'x', kh: 'x', srcLang: 'fr' as const, pending: false }
const input = (start: string, end: string) => ({ name: 'Voyage', nameLang: null, dateStart: start, dateEnd: end, place: null, emoji: null, color: 'accent' as const, autoAttach: true, mediaPaths: [] as string[] })
const path = (day: string, n: string) => `${day.replaceAll('-', '/')}/${n}.jpg`

describe.skipIf(!isLocal)('rattacher les photos des dates (Postgres local jetable)', () => {
	let uid = 0
	const db = () => getDB()
	const addMedia = (day: string, n: string, deleted = false) => db().execute(sql`INSERT INTO media (path, day, kind, size) VALUES (${path(day, n)}, ${day}::date, 'image', 1)`)
		.then(() => deleted ? db().execute(sql`UPDATE media SET deleted_at = now() WHERE path = ${path(day, n)}`) : undefined)
	beforeAll(async () => {
		await db().execute(sql`CREATE TABLE IF NOT EXISTS users (id serial PRIMARY KEY, email text NOT NULL UNIQUE, name text, picture text, google_id text UNIQUE, logto_id text UNIQUE, created_at timestamp DEFAULT now(), last_login_at timestamp DEFAULT now())`)
		const r: any = await db().execute(sql`INSERT INTO users (email) VALUES ('r@t') ON CONFLICT (email) DO UPDATE SET name = 'x' RETURNING id`)
		uid = (r.rows ?? r)[0].id
		await ensureCoffreSchema()
		await db().execute(sql`TRUNCATE event_media, events, media RESTART IDENTITY CASCADE`)
	})

	it('N exact ; ne déplace JAMAIS une photo d\'un autre évènement ; idempotent ; photos hors dates ou supprimées ignorées', async () => {
		const other = await createEvent(uid, input('2026-07-01', '2026-07-31'), names, '2026-10-20')
		const target = await createEvent(uid, input('2026-07-08', '2026-07-09'), names, '2026-10-20')
		for (const [d, n] of [['2026-07-08', 'a'], ['2026-07-08', 'b'], ['2026-07-09', 'c'], ['2026-07-09', 'd']]) await addMedia(d, n)
		await addMedia('2026-07-10', 'hors') // hors dates
		await addMedia('2026-07-08', 'supprimee', true) // supprimée du coffre
		await addMedia('2026-07-09', 'ailleurs') // déjà dans un autre évènement vivant
		await db().execute(sql`INSERT INTO event_media (media_path, event_id, added_by) VALUES (${path('2026-07-09', 'ailleurs')}, ${other.id}, ${uid})`)
		await addMedia('2026-07-08', 'orpheline') // rattachée à un évènement supprimé : libre
		const gone = await createEvent(uid, input('2026-07-08', '2026-07-08'), names, '2026-10-20')
		await db().execute(sql`INSERT INTO event_media (media_path, event_id, added_by) VALUES (${path('2026-07-08', 'orpheline')}, ${gone.id}, ${uid})`)
		await softDeleteEvent(gone.id)

		expect(await countUnattachedInRange(target.id)).toBe(5) // a b c d + orpheline
		expect(await attachUnattachedInRange(target.id, uid)).toEqual({ added: 5 })
		expect(await listEventMedia(target.id)).toEqual(['2026/07/08/a.jpg', '2026/07/08/b.jpg', '2026/07/08/orpheline.jpg', '2026/07/09/c.jpg', '2026/07/09/d.jpg'])
		expect(await listEventMedia(other.id)).toEqual(['2026/07/09/ailleurs.jpg']) // intacte
		expect(await countUnattachedInRange(target.id)).toBe(0)
		expect(await attachUnattachedInRange(target.id, uid)).toEqual({ added: 0 }) // idempotent
		expect((await listEventMedia(target.id))!).toHaveLength(5)
	})
	it('évènement inconnu ou supprimé : null / false', async () => {
		expect(await countUnattachedInRange(999999)).toBeNull()
		expect(await attachUnattachedInRange(999999, uid)).toBe(false)
	})
})
