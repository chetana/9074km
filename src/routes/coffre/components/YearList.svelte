<script lang="ts">
	import { listObjects, getCachedList } from '$lib/api';
	import { tokenStore } from '$lib/auth';
	import { createSWR } from '$lib/swr.svelte';

	interface Props {
		onSelect: (year: string) => void;
	}

	let { onSelect }: Props = $props();
	const token = tokenStore;

	interface YearEntry { year: string; monthCount: number | null }

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

	let error = $derived(swr.error ? String(swr.error) : null);

	// La liste des items est ENTIÈREMENT dérivée (réactif pur)
	let items = $derived(
		years.map((y) => ({
			year: y,
			monthCount: countsMap[y] ?? null
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
			<button class="card" style="--i:{i}" onclick={() => onSelect(item.year)}>
				<span class="year">{item.year}</span>
				<span class="count">
					{#if item.monthCount === null}
						<span class="loading">…</span>
					{:else}
						{item.monthCount} mois · {item.monthCount} ខែ
					{/if}
				</span>
				<span class="arrow">›</span>
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
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: var(--space-4);
		text-align: left;
		transition: border-color var(--transition), transform var(--transition);
		width: 100%;
	}

	.card:hover {
		border-color: var(--accent);
		transform: translateX(3px);
	}

	.year {
		font-size: var(--fs-xl);
		font-weight: 700;
		color: var(--accent);
		flex: 1;
	}

	.count {
		font-size: var(--fs-sm);
		color: var(--muted);
	}

	.loading {
		opacity: 0.4;
	}

	.arrow {
		font-size: var(--fs-xl);
		color: var(--muted);
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
		color: var(--accent);
	}

	.empty {
		text-align: center;
		padding: var(--space-12);
		color: var(--muted);
	}
</style>
