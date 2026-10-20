// Script de rétro-indexation de bout en bout : faux S3 local (> 2000 objets, parasites, meta.json) + Postgres JETABLE.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'

const URL_ = process.env.TEST_PG_URL ?? ''
const isLocal = /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)(:\d+)?\//.test(URL_)
vi.mock('$env/dynamic/private', () => ({ env: { DATABASE_URL: process.env.TEST_PG_URL } }))

import { readFileSync } from 'node:fs'
import pg from 'pg'
import { S3Client } from '@aws-sdk/client-s3'
import { run, formatReport } from '../../../scripts/index-coffre-media.mjs'
import { startMockS3 } from '../../../scripts/test-support/mock-s3.mjs'
import { ensureCoffreSchema } from './coffre-db'

const MIGRATION = readFileSync(new URL('../../../scripts/sql/002-media.sql', import.meta.url), 'utf8')

describe.skipIf(!isLocal)('index-coffre-media (faux S3 + Postgres local jetable)', () => {
	let client: pg.Client
	let mock: Awaited<ReturnType<typeof startMockS3>>
	let s3: S3Client
	const objects = new Map<string, any>()
	let expected = 0
	const q = async (text: string, params: unknown[] = []) => (await client.query(text, params)).rows
	const count = async () => (await q('SELECT count(*)::int AS n FROM media'))[0].n
	const base = { bucket: 'b' }

	beforeAll(async () => {
		client = new pg.Client({ connectionString: URL_ })
		await client.connect()
		await client.query('CREATE TABLE IF NOT EXISTS users (id serial PRIMARY KEY, email text NOT NULL UNIQUE, name text, picture text, google_id text UNIQUE, logto_id text UNIQUE, created_at timestamp DEFAULT now(), last_login_at timestamp DEFAULT now())')
		await ensureCoffreSchema()
		await client.query('TRUNCATE event_media, events RESTART IDENTITY CASCADE')
		await client.query('DROP TABLE IF EXISTS media') // base jetable locale uniquement (garde isLocal)
		for (let i = 0; i < 2100; i++) {
			const m = String((i % 3) + 1).padStart(2, '0'), d = String((i % 27) + 1).padStart(2, '0')
			objects.set(`2026/${m}/${d}/p${String(i).padStart(4, '0')}.jpg`, { body: 'x', size: 100 + i, lastModified: '2026-10-05T10:00:00.000Z' })
		}
		expected = 2100
		objects.set('2025/12/24/noel.mp4', { body: 'v', size: 5000, lastModified: '2025-12-25T01:00:00.000Z' }); expected++
		for (const k of ['2026/01/01/meta.json', '2026/01/01/reactions.json', '2026/01/01/note.txt', '2026/01/01/.DS_Store', 'chat/2026/09/22.json', 'apprendre/lessons/a.json', '2026/02/31/x.jpg', '2026/01/01/doc.pdf', '2026/01/01/sub/z.jpg']) {
			objects.set(k, { body: '{}', size: 2 })
		}
		objects.set('2026/01/01/meta.json', { body: JSON.stringify({ 'p0000.jpg': 'Chet', 'p0027.jpg': 'Lys' }) })
		mock = await startMockS3(objects)
		s3 = new S3Client({ region: 'x', endpoint: mock.url, forcePathStyle: true, credentials: { accessKeyId: 'a', secretAccessKey: 'b' } })
	})
	afterAll(async () => { await client?.end(); await mock?.close() })

	it('dry-run (table media absente) : n\'écrit rien, n\'impose pas de table, compte tout comme à insérer', async () => {
		const r = await run({ s3, ...base, client, apply: false })
		expect(r.tableMissing).toBe(true)
		expect(r.listed).toBe(objects.size)
		expect(r.candidates).toBe(expected)
		expect(r.wouldInsert).toBe(expected)
		expect(r.images).toBe(2100)
		expect(r.videos).toBe(1)
		expect(r.skipped).toMatchObject({ méta: 3, 'hors format': 3, 'fichier caché': 1, 'jour invalide': 1, 'extension inconnue': 1 })
		const t = await q(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'media'`)
		expect(t[0].n).toBe(0)
		expect(formatReport(r)).toContain('DRY-RUN')
	})

	it('--apply : crée la table, insère tout (day, kind, size, uploaded_at = LastModified, uploaded_by = meta.json)', async () => {
		// Ligne déjà indexée au lot 1b (avec EXIF) : ne doit JAMAIS être modifiée.
		await client.query(MIGRATION.split(/;\s*\n/).filter((s) => s.includes('CREATE')).join(';\n'))
		await client.query(`INSERT INTO media (path, day, kind, size, uploaded_by, taken_at, taken_offset, lat, lng, make) VALUES ('2026/01/01/p0000.jpg', '2026-01-01', 'image', 1, 'Lys', '2026-01-01T07:15:30', '+07:00', 11.5, 104.9, 'Apple')`)
		const r = await run({ s3, ...base, client, apply: true, migrationSql: MIGRATION })
		expect(r.inserted).toBe(expected - 1)
		expect(r.existing).toBe(1)
		expect(await count()).toBe(expected)
		const exif = (await q(`SELECT size, uploaded_by, to_char(taken_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS t, lat, make FROM media WHERE path = '2026/01/01/p0000.jpg'`))[0]
		expect(exif).toEqual({ size: '1', uploaded_by: 'Lys', t: '2026-01-01T07:15:30', lat: 11.5, make: 'Apple' })
		const lys = (await q(`SELECT uploaded_by, size, kind, day::text AS day, uploaded_at AT TIME ZONE 'UTC' AS up, taken_at FROM media WHERE path = '2026/01/01/p0027.jpg'`))[0]
		expect(lys).toMatchObject({ uploaded_by: 'Lys', size: '127', kind: 'image', day: '2026-01-01', taken_at: null })
		expect(new Date(lys.up + 'Z').toISOString()).toBe('2026-10-05T10:00:00.000Z')
		const v = (await q(`SELECT kind, size, uploaded_by FROM media WHERE path = '2025/12/24/noel.mp4'`))[0]
		expect(v).toEqual({ kind: 'video', size: '5000', uploaded_by: null })
		expect(await q(`SELECT 1 FROM media WHERE path LIKE '%meta.json' OR path LIKE '%.DS_Store' OR path LIKE 'chat/%' OR path LIKE '%doc.pdf'`)).toEqual([])
	})

	it('relançable : 2e --apply = 0 insertion, dry-run = 0 à insérer', async () => {
		const again = await run({ s3, ...base, client, apply: true, migrationSql: MIGRATION })
		expect(again.inserted).toBe(0)
		expect(again.existing).toBe(expected)
		expect(await count()).toBe(expected)
		const dry = await run({ s3, ...base, client, apply: false })
		expect(dry.wouldInsert).toBe(0)
		expect(dry.tableMissing).toBe(false)
	})

	it('dry-run avec de nouveaux fichiers : compte sans écrire, connexion en lecture seule', async () => {
		objects.set('2026/03/28/nouveau.jpg', { body: 'x', size: 7 })
		const before = await count()
		const dry = await run({ s3, ...base, client, apply: false })
		expect(dry.wouldInsert).toBe(1)
		expect(await count()).toBe(before)
		// Preuve que la transaction du dry-run refuse l'écriture
		await client.query('BEGIN')
		await client.query('SET TRANSACTION READ ONLY')
		await expect(client.query(`INSERT INTO media (path, day, kind) VALUES ('2026/03/28/x.jpg', '2026-03-28', 'image')`)).rejects.toBeTruthy()
		await client.query('ROLLBACK')
	})

	it('« à classer » = lignes sans évènement vivant (évènement supprimé = à classer)', async () => {
		await client.query(`INSERT INTO users (email) VALUES ('idx@t') ON CONFLICT (email) DO NOTHING`)
		const uid = (await q(`SELECT id FROM users WHERE email = 'idx@t'`))[0].id
		const e1 = (await q(`INSERT INTO events (name_fr, name_en, name_kh, name_src_lang, date_start, date_end, created_by) VALUES ('a','a','a','fr','2026-01-01','2026-01-01',$1) RETURNING id`, [uid]))[0].id
		const e2 = (await q(`INSERT INTO events (name_fr, name_en, name_kh, name_src_lang, date_start, date_end, created_by, deleted_at) VALUES ('b','b','b','fr','2026-01-01','2026-01-01',$1, now()) RETURNING id`, [uid]))[0].id
		await client.query(`INSERT INTO event_media (media_path, event_id) VALUES ('2026/01/01/p0000.jpg', $1), ('2026/01/01/p0027.jpg', $2)`, [e1, e2])
		await client.query(`UPDATE media SET deleted_at = now() WHERE path = '2025/12/24/noel.mp4'`)
		await client.query(`UPDATE media SET skipped_at = now() WHERE path = '2026/01/01/p0054.jpg'`)
		const r = await run({ s3, ...base, client, apply: true, migrationSql: MIGRATION })
		const total = await count()
		// à classer = tout − (rattaché à un évènement vivant : 1) − (supprimé : 1) − (ignoré : 1)
		expect(r.unclassifiedTotal).toBe(total - 3)
		expect(r.inserted).toBe(1) // « nouveau.jpg »
	})

	it('course : une ligne EXIF insérée entre la vérification et l\'INSERT n\'est jamais écrasée (ON CONFLICT DO NOTHING)', async () => {
		await client.query('DELETE FROM media')
		await client.query(`INSERT INTO media (path, day, kind, size, uploaded_by, taken_at, make) VALUES ('2026/01/01/p0000.jpg', '2026-01-01', 'image', 1, 'Lys', '2026-01-01T07:15:30', 'Apple')`)
		// Le script « ne voit pas » la ligne existante (vérification aveugle) : seul le ON CONFLICT la protège.
		const blind = new Proxy(client, { get: (t, k) => k === 'query' ? (text: any, ...a: any[]) => (typeof text === 'string' && text.startsWith('SELECT path FROM media') ? Promise.resolve({ rows: [] }) : (t as any).query(text, ...a)) : (t as any)[k].bind?.(t) ?? (t as any)[k] }) as unknown as pg.Client
		const r = await run({ s3, ...base, client: blind, apply: true, migrationSql: MIGRATION, year: '2026', limit: 60 })
		expect(r.inserted).toBe(59)
		const row = (await q(`SELECT size, uploaded_by, make, to_char(taken_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS t FROM media WHERE path = '2026/01/01/p0000.jpg'`))[0]
		expect(row).toEqual({ size: '1', uploaded_by: 'Lys', make: 'Apple', t: '2026-01-01T07:15:30' })
	})

	it('--limit et --year', async () => {
		await client.query('DELETE FROM media')
		const lim = await run({ s3, ...base, client, apply: true, migrationSql: MIGRATION, limit: 10 })
		expect(lim.inserted).toBe(10)
		await client.query('DELETE FROM media')
		const y = await run({ s3, ...base, client, apply: true, migrationSql: MIGRATION, year: '2025' })
		expect(y.inserted).toBe(1)
		expect(y.byYear).toEqual({ '2025': 1 })
	})
})
