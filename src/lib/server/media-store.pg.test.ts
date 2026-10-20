// Intégration sur Postgres JETABLE local (TEST_PG_URL vers localhost), comme events-store.pg.test.ts.
import { describe, it, expect, vi, beforeAll } from 'vitest'

const URL_ = process.env.TEST_PG_URL ?? ''
const isLocal = /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)(:\d+)?\//.test(URL_)
vi.mock('$env/dynamic/private', () => ({ env: { DATABASE_URL: process.env.TEST_PG_URL } }))

import { sql } from 'drizzle-orm'
import { getDB } from './db'
import { ensureCoffreSchema, resetCoffreSchemaForTests } from './coffre-db'
import { recordMedia, markMediaDeleted } from './media-store'

const row = async (path: string) => {
	const r: any = await getDB().execute(sql`SELECT path, day::text AS day, kind, size, uploaded_by, to_char(taken_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS taken_at, taken_offset, lat, lng, make, model, deleted_at FROM media WHERE path = ${path}`)
	return (r.rows ?? r)[0]
}
const item = (path: string, o: Record<string, unknown> = {}) => ({ path, size: 100, takenAt: null, takenOffset: null, lat: null, lng: null, make: null, model: null, ...o }) as any

describe.skipIf(!isLocal)('media-store (Postgres local jetable)', () => {
	beforeAll(async () => {
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
})
