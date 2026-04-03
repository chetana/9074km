import { untrack } from 'svelte';

/**
 * Rune SWR (Stale-While-Revalidate) réactive pour Svelte 5.
 * @param keyFn Fonction retournant la clé unique (réactive)
 * @param getCached Fonction pour récupérer la donnée du localCache pour une clé
 * @param fetcher Fonction asynchrone pour récupérer la donnée fraîche pour une clé
 * @param initialValue Valeur par défaut si rien n'est en cache
 */
export function createSWR<T>(
	keyFn: () => string,
	getCached: (key: string) => T | null,
	fetcher: (key: string) => Promise<T>,
	initialValue: T
) {
	let data = $state<T>(initialValue);
	let loading = $state(true);
	let error = $state<Error | null>(null);

	async function refresh() {
		const currentKey = untrack(keyFn);
		try {
			const fresh = await fetcher(currentKey);
			// On ne met à jour que si la clé est toujours la même (évite race condition)
			if (currentKey === untrack(keyFn)) {
				// Deep compare simple pour éviter des triggers inutiles
				if (JSON.stringify(fresh) !== JSON.stringify(data)) {
					data = fresh;
				}
				error = null;
			}
		} catch (e) {
			if (currentKey === untrack(keyFn)) {
				error = e as Error;
			}
		} finally {
			if (currentKey === untrack(keyFn)) {
				loading = false;
			}
		}
	}

	// Réagir aux changements de clé
	$effect(() => {
		const key = keyFn();
		const cached = getCached(key);
		data = cached ?? initialValue;
		loading = true;
		error = null;
		refresh();
	});

	return {
		get data() { return data; },
		set data(v: T) { data = v; }, // Permet des mises à jour optimistes via le composant
		get loading() { return loading; },
		get error() { return error; },
		refresh
	};
}
