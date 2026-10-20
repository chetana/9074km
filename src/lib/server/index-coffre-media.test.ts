// Parties pures du script de rétro-indexation + liste paginée contre un faux S3 local (> 1000 objets).
import { describe, it, expect, afterEach } from 'vitest'
import { S3Client } from '@aws-sdk/client-s3'
import { parseArgs, classifyKey, selectRows, listAllObjects } from '../../../scripts/index-coffre-media.mjs'
import { startMockS3 } from '../../../scripts/test-support/mock-s3.mjs'

describe('parseArgs', () => {
	it('dry-run par défaut (apply faux), --apply, --limit, --year', () => {
		expect(parseArgs([])).toMatchObject({ apply: false, limit: null, year: null })
		expect(parseArgs(['--apply', '--limit', '50', '--year', '2026'])).toMatchObject({ apply: true, limit: 50, year: '2026' })
	})
	it('refuse les options inconnues, valeurs invalides et --apply + --dry-run', () => {
		for (const a of [['--wat'], ['--limit', '0'], ['--limit', 'x'], ['--year', '26'], ['--year'], ['--apply', '--dry-run']]) expect(() => parseArgs(a)).toThrow()
	})
})

describe('classifyKey', () => {
	it('photo et vidéo : day et kind déduits du chemin', () => {
		expect(classifyKey('2026/10/02/IMG_1.jpg')).toEqual({ path: '2026/10/02/IMG_1.jpg', day: '2026-10-02', kind: 'image' })
		expect(classifyKey('2026/10/02/clip.MOV')).toMatchObject({ kind: 'video' })
		expect(classifyKey('2026/10/02/ភូមិ.webp')).toMatchObject({ kind: 'image' })
	})
	it('ignore méta, dotfiles, clés hors format, jours impossibles, extensions inconnues', () => {
		for (const k of ['2026/10/02/meta.json', '2026/10/02/reactions.json', '2026/10/02/note.txt', '2026/10/02/.DS_Store', 'chat/2026/10/02.json', 'apprendre/lessons/a.json', '2026/10/02/sub/a.jpg', '2026/02/31/a.jpg', '2026/13/01/a.jpg', '2026/10/02/doc.pdf', '2026/10/02/', 'x.jpg']) {
			expect(classifyKey(k), k).toHaveProperty('skip')
		}
	})
})

describe('selectRows', () => {
	const objs = ['2026/10/02/a.jpg', '2026/10/02/meta.json', '2026/10/03/b.mp4', 'chat/x.json', '2026/10/03/c.png'].map((Key, i) => ({ Key, Size: i + 1, LastModified: new Date('2026-10-05T10:00:00Z') }))
	it('lignes retenues + comptes des ignorés ; uploadedAt = LastModified (UTC, informatif)', () => {
		const { rows, skipped } = selectRows(objs)
		expect(rows.map((r) => r.path)).toEqual(['2026/10/02/a.jpg', '2026/10/03/b.mp4', '2026/10/03/c.png'])
		expect(rows[0]).toMatchObject({ size: 1, uploadedAt: '2026-10-05T10:00:00.000Z', uploadedBy: null })
		expect(skipped).toEqual({ méta: 1, 'hors format': 1 })
	})
	it('--limit coupe après N fichiers retenus', () => {
		expect(selectRows(objs, { limit: 2 }).rows).toHaveLength(2)
	})
})

describe('listAllObjects : pagination ContinuationToken contre un faux S3', () => {
	let mock: Awaited<ReturnType<typeof startMockS3>> | undefined
	afterEach(async () => { await mock?.close() })
	const client = (url: string) => new S3Client({ region: 'x', endpoint: url, forcePathStyle: true, credentials: { accessKeyId: 'a', secretAccessKey: 'b' } })

	it('2500 objets en 3 pages : tous listés, dans l\'ordre, sans doublon', async () => {
		const objects = new Map<string, any>()
		for (let i = 0; i < 2500; i++) objects.set(`2026/${String((i % 12) + 1).padStart(2, '0')}/01/p${String(i).padStart(4, '0')}.jpg`, { body: 'x' })
		mock = await startMockS3(objects, { pageSize: 1000 })
		const all = await listAllObjects(client(mock.url), 'bucket')
		expect(all).toHaveLength(2500)
		expect(new Set(all.map((o: any) => o.Key)).size).toBe(2500)
		expect(mock.requests.filter((r) => r.includes('list-type=2'))).toHaveLength(3)
		expect(mock.requests.filter((r) => r.includes('continuation-token'))).toHaveLength(2)
	})
	it('préfixe d\'année transmis ; moins de 1000 objets : une seule requête', async () => {
		mock = await startMockS3(new Map([['2025/01/01/a.jpg', { body: 'x' }], ['2026/01/01/b.jpg', { body: 'x' }]]))
		const r = await listAllObjects(client(mock.url), 'bucket', '2026/')
		expect(r.map((o: any) => o.Key)).toEqual(['2026/01/01/b.jpg'])
		expect(mock.requests).toHaveLength(1)
	})
})

import { assertApplyConfirmed, describeTarget, run, formatReport } from '../../../scripts/index-coffre-media.mjs'

describe('sécurité de l\'apply (F6c)', () => {
	it('--yes accepté ; sans --yes ni CONFIRM=1 : refus ; le dry-run n\'exige rien', () => {
		expect(parseArgs(['--apply', '--yes'])).toMatchObject({ apply: true, yes: true })
		expect(() => assertApplyConfirmed(parseArgs(['--apply']), {})).toThrow(/--yes/)
		expect(() => assertApplyConfirmed(parseArgs(['--apply']), { CONFIRM: '0' })).toThrow()
		expect(() => assertApplyConfirmed(parseArgs(['--apply']), { CONFIRM: '1' })).not.toThrow()
		expect(() => assertApplyConfirmed(parseArgs(['--apply', '--yes']), {})).not.toThrow()
		expect(() => assertApplyConfirmed(parseArgs([]), {})).not.toThrow()
		expect(() => assertApplyConfirmed(parseArgs(['--dry-run']), {})).not.toThrow()
	})
})

describe('describeTarget (F6b) : cible visible, jamais d\'identifiants', () => {
	const env = { DATABASE_URL: 'postgres://moi:SECRET123@db.chetbox:5432/lys?sslmode=disable', bucket: 'chet-lys-coffre', endpoint: 'https://s3.fr-par.scw.cloud' }
	it('bucket, endpoint, hôte:port/base et mode', () => {
		const t = describeTarget(env, false)
		expect(t).toContain('Mode : DRY-RUN')
		expect(t).toContain('Bucket : chet-lys-coffre')
		expect(t).toContain('Endpoint S3 : https://s3.fr-par.scw.cloud')
		expect(t).toContain('Base : db.chetbox:5432/lys')
		expect(describeTarget(env, true)).toContain('Mode : APPLY')
	})
	it('ni mot de passe, ni utilisateur, ni paramètres ; URL illisible : libellé neutre', () => {
		const t = describeTarget(env, true)
		for (const bad of ['SECRET123', 'moi', 'sslmode', 'postgres://']) expect(t).not.toContain(bad)
		expect(describeTarget({ ...env, DATABASE_URL: 'pas une url SECRET123' }, false)).not.toContain('SECRET123')
	})
})

// Faux client Postgres qui enregistre le SQL émis (aucune base nécessaire) + S3 factice.
function fakeClient() {
	const sqls: string[] = []
	return { sqls, async query(text: string) { sqls.push(String(text).replace(/\s+/g, ' ').trim()); return { rows: /count\(\*\)/i.test(String(text)) ? [{ n: 0 }] : [], rowCount: 0 } } }
}
const fakeS3 = (keys: string[]) => ({ send: async (cmd: any) => {
	if (cmd.constructor.name === 'ListObjectsV2Command') return { Contents: keys.map((Key) => ({ Key, Size: 1, LastModified: new Date('2026-10-05T10:00:00Z') })), IsTruncated: false }
	throw Object.assign(new Error('nope'), { name: 'NoSuchKey' })
} })
const WRITE = /^(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE)\b/i

describe('le dry-run est en lecture seule (F6e) : prouvé sur le SQL émis', () => {
	it('BEGIN puis SET TRANSACTION READ ONLY en premier, jamais d\'écriture, fin par ROLLBACK', async () => {
		const c = fakeClient()
		await run({ s3: fakeS3(['2026/10/02/a.jpg']), bucket: 'b', client: c, apply: false })
		expect(c.sqls.slice(0, 2)).toEqual(['BEGIN', 'SET TRANSACTION READ ONLY'])
		expect(c.sqls.filter((q) => WRITE.test(q))).toEqual([])
		expect(c.sqls.at(-1)).toBe('ROLLBACK')
	})
	it('apply : écrit (CREATE/INSERT) dans UNE transaction, un seul COMMIT, aucun READ ONLY', async () => {
		const c = fakeClient()
		await run({ s3: fakeS3(['2026/10/02/a.jpg']), bucket: 'b', client: c, apply: true, migrationSql: 'CREATE TABLE IF NOT EXISTS media (path text);' })
		expect(c.sqls.some((q) => /^INSERT INTO media/.test(q))).toBe(true)
		expect(c.sqls.filter((q) => q === 'BEGIN')).toHaveLength(1)
		expect(c.sqls.filter((q) => q === 'COMMIT')).toHaveLength(1)
		expect(c.sqls.some((q) => /READ ONLY/.test(q))).toBe(false)
		expect(c.sqls.some((q) => q === 'ROLLBACK')).toBe(false)
	})
})

describe('meta.json illisibles (F6a) : une nouvelle tentative puis comptage, jamais silencieux', () => {
	let mock: Awaited<ReturnType<typeof startMockS3>> | undefined
	afterEach(async () => { await mock?.close() })
	it('404 = normal ; flaky = récupéré par la relance ; JSON cassé et 500 permanent = comptés', async () => {
		const o = new Map<string, any>()
		for (const d of ['01', '02', '03', '04', '05']) o.set(`2026/10/${d}/p.jpg`, { body: 'x' })
		o.set('2026/10/01/meta.json', { body: JSON.stringify({ 'p.jpg': 'Chet' }) })
		o.set('2026/10/02/meta.json', { body: '{pas du json' })
		o.set('2026/10/03/meta.json', { status: 500 })
		o.set('2026/10/04/meta.json', { body: JSON.stringify({ 'p.jpg': 'Lys' }), failFirst: 1 })
		// 05 : pas de meta.json (404)
		mock = await startMockS3(o)
		const s3 = new S3Client({ region: 'x', endpoint: mock.url, forcePathStyle: true, credentials: { accessKeyId: 'a', secretAccessKey: 'b' }, maxAttempts: 1 })
		const c = fakeClient()
		const r = await run({ s3, bucket: 'b', client: c, apply: false })
		expect(r.metaUnreadable).toBe(2)
		expect(formatReport(r)).toContain('2 fichiers meta.json illisibles (uploaded_by laissé vide')
		const gets = (day: string) => mock!.requests.filter((q) => q.includes(`/2026/10/${day}/meta.json`)).length
		expect(gets('04')).toBe(2) // 1 échec + 1 nouvelle tentative réussie
		expect(gets('03')).toBe(2) // 500 permanent : 1 nouvelle tentative puis abandon
		expect(gets('05')).toBe(1) // 404 : pas de relance
	})
})

describe('--limit : compteurs partiels annoncés (F6d)', () => {
	it('le rapport le dit ; sans --limit, rien', async () => {
		const keys = ['2026/10/02/a.jpg', '2026/10/02/b.jpg', '2026/10/02/c.jpg', 'chat/x.json']
		const lim = await run({ s3: fakeS3(keys), bucket: 'b', client: fakeClient(), apply: false, limit: 2 })
		expect(lim.candidates).toBe(2)
		expect(formatReport(lim)).toMatch(/--limit 2 : .*PARTIELS/)
		const full = await run({ s3: fakeS3(keys), bucket: 'b', client: fakeClient(), apply: false })
		expect(formatReport(full)).not.toContain('PARTIELS')
	})
})
