<script lang="ts">
	import { listObjects, getCachedList, fetchCover, ogImageUrl } from '$lib/api';
	import { userStore } from '$lib/auth';
	import { createSWR } from '$lib/swr.svelte';
	import { ChevronRight } from 'lucide-svelte';

	interface Props {
		onSelect: (year: string) => void;
	}

	let { onSelect }: Props = $props();
	const token = userStore;

	interface YearEntry { year: string; monthCount: number | null; cover: string | null }

	// SWR pour la liste racine (les années)
	// Le token dans la clé force un re-fetch quand l'auth arrive
	const swr = createSWR(
		() => `root_years_${$token ? '1' : '0'}`,
		() => getCachedList(''),
		() => listObjects(''),
		{ prefixes: [], items: [] }
	);

	// Derived state for the years list
	let years = $derived(
		swr.data.prefixes
			.map((p) => p.replace('/', ''))
			.filter((p) => /^\d{4}$/.test(p))
			.sort((a, b) => Number(b) - Number(a))
	);

	// Diagnostic logs
	$effect(() => {
		console.log(`[YearList] SWR State - loading: ${swr.loading}, data.prefixes: ${swr.data.prefixes.length}`);
	});

	// État pour stocker les comptes de mois (lazy)
	let countsMap = $state<Record<string, number>>({});
	let coversMap = $state<Record<string, string | null>>({});

	let error = $derived(swr.error ? String(swr.error) : null);

	// La liste des items est ENTIÈREMENT dérivée (réactif pur)
	let items = $derived(
		years.map((y) => ({
			year: y,
			monthCount: countsMap[y] ?? null,
			cover: coversMap[y] ?? null
		}))
	);

	// Effet pour charger les counts (indépendant du rendu initial)
	$effect(() => {
		const currentYears = years;
		currentYears.forEach(async (y) => {
			if (countsMap[y] !== undefined) return;
			try {
				const r = await listObjects(`${y}/`);
				countsMap[y] = r.prefixes.length;
			} catch { /* count reste null */ }
		});
	});

	// Photo de couverture (plan de modernisation P6, 23/09/2026) — un appel par année, lazy.
	$effect(() => {
		const currentYears = years;
		currentYears.forEach(async (y) => {
			if (coversMap[y] !== undefined) return;
			coversMap[y] = await fetchCover(`${y}/`);
		});
	});
</script>

<div class="list">
	{#if swr.loading && items.length === 0}
		{#each [1,2,3] as _}
			<div class="skeleton"></div>
		{/each}
	{:else if error}
		<div class="error">
			<p>Erreur de chargement</p>
			<button onclick={() => swr.refresh()}>Réessayer</button>
		</div>
	{:else if items && items.length === 0}
		<div class="empty">Aucune photo pour l'instant 🌸</div>
	{:else}
		{#each items ?? [] as item, i}
			<button
				class="card"
				class:has-cover={!!item.cover}
				style="--i:{i}{item.cover ? `;--cover:url(${JSON.stringify(ogImageUrl(item.cover, 400))})` : ''}"
				onclick={() => onSelect(item.year)}
			>
				<span class="year">{item.year}</span>
				<span class="count">
					{#if item.monthCount === null}
						<span class="loading">…</span>
					{:else}
						{item.monthCount} mois · {item.monthCount} ខែ
					{/if}
				</span>
				<span class="arrow"><ChevronRight size={20} /></span>
			</button>
		{/each}
	{/if}
</div>

<style>
	.list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4);
	}

	.card {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		background: var(--surface);
		border: 1px solid var(--border-soft);
		border-radius: var(--radius-pebble);
		padding: var(--space-4) var(--space-5, 1.25rem);
		text-align: left;
		transition: border-color var(--transition), transform var(--transition);
		width: 100%;
		box-shadow: var(--shadow-sm);
	}
	/* Photo de couverture : voile crème pour garder le texte lisible quelle que soit la photo
	   (plan de modernisation P6, 23/09/2026). */
	.card.has-cover {
		background:
			linear-gradient(90deg, color-mix(in srgb, var(--bg) 60%, transparent), color-mix(in srgb, var(--bg) 82%, transparent)),
			var(--cover) center / cover no-repeat;
	}

	.card:hover {
		border-color: var(--accent);
		transform: translateX(3px);
	}

	.year {
		font-family: var(--font-display);
		font-size: 1.75rem;
		font-weight: 700;
		color: var(--accent-text);
		flex: 1;
	}

	.count {
		font-size: var(--fs-sm);
		color: var(--muted-text);
	}

	.loading {
		opacity: 0.4;
	}

	.arrow {
		display: flex;
		color: var(--muted-glyph);
	}

	@keyframes card-in {
		from { opacity: 0; transform: translateY(10px) scale(0.98); }
		to   { opacity: 1; transform: none; }
	}

	.card {
		animation: card-in 0.28s cubic-bezier(0.34, 1.4, 0.64, 1) both;
		animation-delay: calc(var(--i, 0) * 55ms);
	}

	.card:active {
		transform: scale(0.97);
	}

	.skeleton {
		height: 3.75rem;
		border-radius: var(--radius-md);
	}

	.error {
		text-align: center;
		padding: var(--space-8);
		color: var(--muted);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		align-items: center;
	}

	.error button {
		padding: var(--space-2) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--accent-text);
	}

	.empty {
		text-align: center;
		padding: var(--space-12);
		color: var(--muted);
	}
</style>
