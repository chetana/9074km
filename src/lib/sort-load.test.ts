import { describe, it, expect, vi } from 'vitest'
import type { UnclassifiedItem, UnclassifiedPage } from './events-api'
import { loadAllUnclassified, orderForSort } from './sort-load'
import { createBlobUrlHolder } from './blob-url'

const it_ = (path: string, day: string): UnclassifiedItem => ({ path, day, kind: 'image', size: 1, uploadedBy: null })
const pager = (all: UnclassifiedItem[], size = 100) => vi.fn(async (cursor: string | null): Promise<UnclassifiedPage> => {
	const start = cursor ? Number(cursor) : 0
	const items = all.slice(start, start + size)
	return { total: all.length, items, nextCursor: start + size < all.length ? String(start + size) : null }
})

describe('loadAllUnclassified : 973 photos, aucune perdue', () => {
	const all = Array.from({ length: 973 }, (_, i) => it_(`2026/${String((i % 7) + 1).padStart(2, '0')}/${String((i % 28) + 1).padStart(2, '0')}/p${String(i).padStart(4, '0')}.jpg`, `2026-${String((i % 7) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`))
	it('10 pages de 100 : les 973 éléments, le total initial, sans doublon', async () => {
		const f = pager(all)
		const r = await loadAllUnclassified(f)
		expect(f).toHaveBeenCalledTimes(10)
		expect(r.items).toHaveLength(973)
		expect(r.total).toBe(973)
		expect(new Set(r.items.map((x) => x.path)).size).toBe(973)
	})
	it('plus de 8 pages : le 801e élément existe (ancien plafond de 800)', async () => {
		const r = await loadAllUnclassified(pager(all))
		expect(r.items[800]).toBeTruthy()
		expect(r.items[972].path).toBe(all[972].path)
	})
	it('doublons renvoyés par le serveur ignorés ; liste vide : total 0, rien', async () => {
		const dup = [it_('a', '2026-01-01'), it_('a', '2026-01-01'), it_('b', '2026-01-02')]
		expect((await loadAllUnclassified(pager(dup, 2))).items.map((x) => x.path)).toEqual(['a', 'b'])
		expect(await loadAllUnclassified(pager([]))).toEqual({ items: [], total: 0 })
	})
	it('serveur qui boucle : erreur explicite plutôt qu\'une liste tronquée en silence', async () => {
		const loop = vi.fn(async (): Promise<UnclassifiedPage> => ({ total: 5, items: [], nextCursor: 'x' }))
		await expect(loadAllUnclassified(loop, 50)).rejects.toThrow('too many pages')
	})
	it('une erreur de page remonte (l\'écran propose Réessayer, il n\'affiche pas « Tout est classé »)', async () => {
		const f = vi.fn(async (c: string | null): Promise<UnclassifiedPage> => { if (c) throw new Error('net'); return { total: 200, items: [it_('a', '2026-01-01')], nextCursor: '1' } })
		await expect(loadAllUnclassified(f)).rejects.toThrow('net')
	})
})

describe('orderForSort : l\'ordre porte sur l\'ENSEMBLE, pas sur les premières pages', () => {
	it('un jour très fourni arrivé seulement dans la dernière page passe en tête', () => {
		const early = Array.from({ length: 800 }, (_, i) => it_(`e${i}`, `2026-0${(i % 4) + 1}-01`)) // 200 par jour
		const lateBig = Array.from({ length: 173 }, (_, i) => it_(`l${i}`, '2026-09-09'))
		const only = orderForSort([...early, ...lateBig])
		expect(only[0].day).toBe('2026-04-01') // 200 > 173, ex æquo résolu par le jour récent
		const crowded = orderForSort([...early.slice(0, 40), ...Array.from({ length: 100 }, (_, i) => it_(`z${i}`, '2026-09-09'))])
		expect(crowded[0].day).toBe('2026-09-09')
		expect(crowded.slice(0, 100).every((x) => x.day === '2026-09-09')).toBe(true)
	})
	it('déterministe et sans mutation', () => {
		const a = [it_('b', '2026-01-02'), it_('a', '2026-01-02'), it_('c', '2026-01-01')]
		const copy = [...a]
		expect(orderForSort(a).map((x) => x.path)).toEqual(['a', 'b', 'c'])
		expect(a).toEqual(copy)
	})
})

describe('createBlobUrlHolder : URL blob: révoquées', () => {
	it('chaque nouvelle URL révoque la précédente ; clear révoque la dernière', () => {
		const created: string[] = []
		const revoked: string[] = []
		let n = 0
		vi.stubGlobal('URL', { createObjectURL: () => { const u = `blob:${++n}`; created.push(u); return u }, revokeObjectURL: (u: string) => revoked.push(u) })
		const h = createBlobUrlHolder()
		h.set(new Blob(['a']))
		h.set(new Blob(['b']))
		expect(revoked).toEqual(['blob:1'])
		h.clear()
		expect(revoked).toEqual(['blob:1', 'blob:2'])
		h.clear()
		expect(revoked).toHaveLength(2) // idempotent
		vi.unstubAllGlobals()
	})
})
