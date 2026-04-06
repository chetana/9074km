/**
 * Utilitaire SWR (Stale-While-Revalidate) pour Svelte 5.
 * Affiche immédiatement le cache, puis rafraîchit en arrière-plan.
 * Expose aussi `mutate()` pour les mises à jour optimistes.
 */
import { untrack } from 'svelte';

export function createSWR<T>(
	keyFn: () => string,
	getCached: (key: string) => T | null,
	fetcher: (key: string) => Promise<T>,
	initialValue: T
) {
	let data = $state<T>(initialValue);
	let loading = $state(true); // Commence en chargement pour éviter le flash "empty"
	let error = $state<any>(null);

	// Garde pour ignorer les réponses obsolètes
	let activeKey = '';

	async function refresh() {
		const key = untrack(keyFn);
		activeKey = key;

		loading = true;
		error = null;

		try {
			const result = await fetcher(key);
			// Ignorer si une autre clé est devenue active entre-temps
			if (activeKey === key) {
				data = result;
				error = null;
			}
		} catch (err: any) {
			if (activeKey === key) {
				error = err;
			}
		} finally {
			if (activeKey === key) {
				loading = false;
			}
		}
	}

	// Réagir aux changements de clé — initialiser avec le cache et lancer le fetch
	$effect(() => {
		const key = keyFn(); // lecture réactive

		untrack(() => {
			// Précharger depuis le cache immédiatement
			const cached = getCached(key);
			if (cached !== null) {
				data = cached;
			} else {
				data = initialValue;
			}
			// Toujours rafraîchir en arrière-plan
			refresh();
		});
	});

	return {
		get data() { return data; },
		/** Mutation optimiste directe (ex: ajout ou suppression d'un message) */
		set data(value: T) { data = value; },
		get loading() { return loading; },
		get error() { return error; },
		refresh,
		/** mutate(fn) : applique une transformation sur les données locales (optimistic) */
		mutate(fn: (current: T) => T) {
			data = fn(data);
		}
	};
}
