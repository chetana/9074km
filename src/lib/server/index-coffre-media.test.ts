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
