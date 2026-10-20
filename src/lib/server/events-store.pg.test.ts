// Test d'intégration sur un Postgres JETABLE : lancé seulement si TEST_PG_URL pointe vers localhost.
// Ex : docker run --rm -e POSTGRES_PASSWORD=t -e POSTGRES_DB=t -p 54329:5432 postgres:16-alpine
// puis TEST_PG_URL=postgres://postgres:t@127.0.0.1:54329/t npx vitest run events-store.pg
import { describe, it, expect, vi, beforeAll } from 'vitest'

const URL_ = process.env.TEST_PG_URL ?? ''
const isLocal = /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)(:\d+)?\//.test(URL_)

vi.mock('$env/dynamic/private', () => ({ env: { DATABASE_URL: process.env.TEST_PG_URL } }))

import { getDB } from './db'
import { sql } from 'drizzle-orm'
import { ensureCoffreSchema, resetCoffreSchemaForTests } from './coffre-db'
import {
	createEvent, getEvent, listEvents, patchEvent, softDeleteEvent, applyTranslations,
	addEventMedia, removeEventMedia, listEventMedia, eventsForDate,
} from './events-store'

const TODAY = '2026-10-20'
const input = (o: Record<string, unknown> = {}) => ({
	name: 'Disneyland Paris', nameLang: null, dateStart: '2026-11-30', dateEnd: '2026-11-30', place: 'Marne-la-Vallée',
	emoji: '🎢', color: 'accent' as const, autoAttach: true, mediaPaths: [] as string[], ...o,
})
const names = (n: string, pending = false) => ({ fr: n, en: n, kh: n, srcLang: 'fr' as const, pending })

describe.skipIf(!isLocal)('events-store (Postgres local jetable)', () => {
	let uid = 0
	beforeAll(async () => {
		const db = getDB()
		await db.execute(sql`CREATE TABLE IF NOT EXISTS users (id serial PRIMARY KEY, email text NOT NULL UNIQUE, name text, picture text, google_id text UNIQUE, logto_id text UNIQUE, created_at timestamp DEFAULT now(), last_login_at timestamp DEFAULT now())`)
		const r: any = await db.execute(sql`INSERT INTO users (email) VALUES ('t@t') ON CONFLICT (email) DO UPDATE SET name = 'x' RETURNING id`)
		uid = (r.rows ?? r)[0].id
	})

	it('ensureCoffreSchema est idempotent (2 exécutions, mémoïsé, et rejouable à froid)', async () => {
		await ensureCoffreSchema()
		await ensureCoffreSchema()
		resetCoffreSchemaForTests()
		await ensureCoffreSchema() // 2e vraie exécution du SQL : ne doit rien casser
		const t: any = await getDB().execute(sql`SELECT table_name FROM information_schema.tables WHERE table_name IN ('events','event_media') ORDER BY 1`)
		expect((t.rows ?? t).map((x: any) => x.table_name)).toEqual(['event_media', 'events'])
	})

	it('création, lecture, dates en chaîne, upcoming, couverture auto = dernière image', async () => {
		const ev = await createEvent(uid, input({ mediaPaths: ['2026/11/30/a.jpg', '2026/11/30/b.jpg', '2026/11/30/z.mp4'] }), names('Disney'), TODAY)
		expect(ev.dates).toEqual({ start: '2026-11-30', end: '2026-11-30' })
		expect(ev.upcoming).toBe(true)
		expect(ev.count).toBe(3)
		expect(ev.cover).toBe('2026/11/30/b.jpg')
		expect(ev.version).toBe(1)
		expect((await getEvent(ev.id, '2026-12-05'))!.upcoming).toBe(false)
	})

	it('PATCH : version incrémentée, 409 avec current, 404, plage invalide', async () => {
		const ev = await createEvent(uid, input(), names('P'), TODAY)
		const ok = await patchEvent(ev.id, { ifVersion: 1, place: 'Paris' }, {}, TODAY)
		expect(ok.kind === 'ok' && ok.event.version).toBe(2)
		const conflict = await patchEvent(ev.id, { ifVersion: 1, place: 'X' }, {}, TODAY)
		expect(conflict.kind === 'conflict' && conflict.current.place).toBe('Paris')
		expect((await patchEvent(999999, { ifVersion: 1, place: 'X' }, {}, TODAY)).kind).toBe('not_found')
		expect((await patchEvent(ev.id, { ifVersion: 2, dateEnd: '2026-01-01' }, {}, TODAY)).kind).toBe('invalid')
		const e2 = await patchEvent(ev.id, { ifVersion: 2, place: null }, {}, TODAY)
		expect(e2.kind === 'ok' && e2.event.place).toBeNull()
	})

	it('media : déplacement ON CONFLICT, retrait, couverture reset, couverture doit appartenir à l\'évènement', async () => {
		const a = await createEvent(uid, input({ name: 'A', mediaPaths: ['2027/01/01/x.jpg', '2027/01/01/y.jpg'] }), names('A'), TODAY)
		const b = await createEvent(uid, input({ name: 'B' }), names('B'), TODAY)
		const setCover = await patchEvent(a.id, { ifVersion: 1, coverPath: '2027/01/01/x.jpg' }, {}, TODAY)
		expect(setCover.kind === 'ok' && setCover.event.cover).toBe('2027/01/01/x.jpg')
		expect((await patchEvent(b.id, { ifVersion: 1, coverPath: '2027/01/01/x.jpg' }, {}, TODAY)).kind).toBe('invalid')
		expect(await addEventMedia(b.id, uid, ['2027/01/01/x.jpg'])).toBe(true)
		expect(await listEventMedia(a.id)).toEqual(['2027/01/01/y.jpg'])
		expect(await listEventMedia(b.id)).toEqual(['2027/01/01/x.jpg'])
		expect((await getEvent(a.id, TODAY))!.cover).toBe('2027/01/01/y.jpg')
		expect(await removeEventMedia(b.id, ['2027/01/01/x.jpg', '2027/01/01/inconnu.jpg'])).toBe(1)
		expect(await addEventMedia(424242, uid, ['2027/01/01/x.jpg'])).toBe(false)
		expect(await listEventMedia(424242)).toBeNull()
	})

	it('soft delete : disparaît des listes, 404 ensuite', async () => {
		const ev = await createEvent(uid, input({ name: 'Zap', dateStart: '2030-05-05', dateEnd: '2030-05-05' }), names('Zap'), TODAY)
		expect(await softDeleteEvent(ev.id)).toBe(true)
		expect(await softDeleteEvent(ev.id)).toBe(false)
		expect((await listEvents({ today: TODAY })).some((e) => e.id === ev.id)).toBe(false)
		expect(await getEvent(ev.id, TODAY)).toBeNull()
	})

	it('liste : filtres année / lieu', async () => {
		await createEvent(uid, input({ name: 'Y', dateStart: '2031-03-01', dateEnd: '2031-03-02', place: 'Siem Reap' }), names('Y'), TODAY)
		expect((await listEvents({ year: '2031', today: TODAY })).map((e) => e.names.fr)).toEqual(['Y'])
		expect((await listEvents({ place: 'siem reap', today: TODAY })).length).toBeGreaterThanOrEqual(1)
		expect(await listEvents({ year: '2099', today: TODAY })).toEqual([])
	})

	it('traductions tardives : appliquées seulement si le nom source n\'a pas changé', async () => {
		const ev = await createEvent(uid, input({ name: 'T' }), names('Gâteau', true), TODAY)
		expect(await applyTranslations(ev.id, 'fr', 'Autre', { fr: 'a', en: 'b', kh: 'c' })).toBe(false)
		expect(await applyTranslations(ev.id, 'fr', 'Gâteau', { fr: 'Gâteau', en: 'Cake', kh: 'នំ' })).toBe(true)
		const after = (await getEvent(ev.id, TODAY))!
		expect(after.names).toEqual({ fr: 'Gâteau', en: 'Cake', kh: 'នំ' })
		expect(after.namesPending).toBe(false)
		expect(after.version).toBe(1)
		expect(await applyTranslations(ev.id, 'fr', 'Gâteau', { fr: 'x', en: 'x', kh: 'x' })).toBe(false)
	})

	it('for-date : évènements couvrant (auto_attach d\'abord) et étiquettes du jour', async () => {
		const x = await createEvent(uid, input({ name: 'Manuel', dateStart: '2032-08-10', dateEnd: '2032-08-12', autoAttach: false }), names('Manuel'), TODAY)
		const y = await createEvent(uid, input({ name: 'Auto', dateStart: '2032-08-11', dateEnd: '2032-08-11', mediaPaths: ['2032/08/11/p.jpg'] }), names('Auto'), TODAY)
		const r = await eventsForDate('2032-08-11', TODAY)
		expect(r.events.map((e) => e.id)).toEqual([y.id, x.id])
		expect(r.tags).toEqual({ '2032/08/11/p.jpg': y.id })
		const none = await eventsForDate('2032-09-01', TODAY)
		expect(none.events).toEqual([])
	})
})
