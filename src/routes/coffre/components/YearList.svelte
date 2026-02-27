<script lang="ts">
	import { onMount } from 'svelte';
	import { listObjects } from '$lib/api';

	interface Props {
		onSelect: (year: string) => void;
	}

	let { onSelect }: Props = $props();

	interface YearEntry { year: string; monthCount: number | null }

	let items = $state<YearEntry[] | null>(null);
	let error = $state<string | null>(null);

	async function load() {
		error = null;
		items = null;
		try {
			const result = await listObjects('');
			const years = result.prefixes
				.map((p) => p.replace('/', ''))
				.filter((p) => /^\d{4}$/.test(p))
				.sort((a, b) => Number(b) - Number(a));

			// Afficher immédiatement les lignes sans les counts
			items = years.map((year) => ({ year, monthCount: null }));

			// Charger les counts en lazy
			years.forEach(async (y, i) => {
				try {
					const r = await listObjects(`${y}/`);
					items = items!.map((item, j) =>
						j === i ? { ...item, monthCount: r.prefixes.length } : item
					);
				} catch { /* count reste null */ }
			});

			// Précharger les mois + jours de l'année la plus récente en arrière-plan
			if (years[0]) {
				listObjects(`${years[0]}/`).then((r) => {
					r.prefixes.forEach((p) => {
						const mm = p.replace(`${years[0]}/`, '').replace('/', '');
						listObjects(`${years[0]}/${mm}/`).catch(() => {});
					});
				}).catch(() => {});
			}
		} catch (e) {
			error = String(e);
		}
	}

	onMount(load);
</script>

<div class="list">
	{#if items === null && !error}
		{#each [1,2,3] as _}
			<div class="skeleton"></div>
		{/each}
	{:else if error}
		<div class="error">
			<p>Erreur de chargement</p>
			<button onclick={load}>Réessayer</button>
		</div>
	{:else if items && items.length === 0}
		<div class="empty">Aucune photo pour l'instant 🌸</div>
	{:else}
		{#each items ?? [] as item}
			<button class="card" onclick={() => onSelect(item.year)}>
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
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--space-4);
		text-align: left;
		transition: border-color 0.15s;
		width: 100%;
	}

	.card:hover {
		border-color: var(--accent);
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
