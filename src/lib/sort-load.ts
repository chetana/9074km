import type { UnclassifiedItem, UnclassifiedPage } from './events-api';

/** Ordre du mode tri : les jours avec le plus de photos d'abord (puis jour récent), calculé sur TOUT l'ensemble. */
export function orderForSort(list: UnclassifiedItem[]): UnclassifiedItem[] {
	const counts = new Map<string, number>();
	for (const i of list) counts.set(i.day, (counts.get(i.day) ?? 0) + 1);
	return [...list].sort((a, b) => (counts.get(b.day)! - counts.get(a.day)!) || (a.day < b.day ? 1 : a.day > b.day ? -1 : 0) || (a.path < b.path ? -1 : 1));
}

/**
 * Charge TOUTES les pages tant qu'un curseur existe (≈ 10 pages de 100 pour ~1 000 photos), sans doublon.
 * Le plafond de pages n'est qu'un garde-fou contre un serveur qui boucle ; il lève plutôt que de tronquer en silence.
 */
export async function loadAllUnclassified(
	fetchPage: (cursor: string | null) => Promise<UnclassifiedPage>,
	maxPages = 500
): Promise<{ items: UnclassifiedItem[]; total: number }> {
	const seen = new Set<string>();
	const items: UnclassifiedItem[] = [];
	let total = 0;
	let cursor: string | null = null;
	for (let page = 0; page < maxPages; page++) {
		const p = await fetchPage(cursor);
		if (page === 0) total = p.total;
		for (const it of p.items) if (!seen.has(it.path)) { seen.add(it.path); items.push(it); }
		cursor = p.nextCursor;
		if (!cursor) return { items, total };
	}
	throw new Error('too many pages');
}
