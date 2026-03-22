<script lang="ts">
	import { onMount } from 'svelte';
	import { listObjects } from '$lib/api';
	import { MONTHS_FR, MONTHS_KH } from '$lib/i18n';

	interface Props {
		year: string;
		onSelect: (month: string) => void;
	}

	let { year, onSelect }: Props = $props();

	interface MonthEntry { mm: string; label: string; dayCount: number | null }

	let items = $state<MonthEntry[] | null>(null);
	let error = $state<string | null>(null);

	function monthLabel(mm: string) {
		const idx = parseInt(mm, 10) - 1;
		return `${mm} — ${MONTHS_FR[idx]} · ${MONTHS_KH[idx]}`;
	}

	async function load() {
		error = null;
		items = null;
		try {
			const result = await listObjects(`${year}/`);
			const months = result.prefixes
				.map((p) => p.replace(`${year}/`, '').replace('/', ''))
				.filter((p) => /^\d{2}$/.test(p))
				.sort((a, b) => Number(b) - Number(a));

			// Afficher immédiatement les lignes sans les counts
			items = months.map((mm) => ({ mm, label: monthLabel(mm), dayCount: null }));

			// Charger les counts en lazy
			months.forEach(async (mm, i) => {
				try {
					const r = await listObjects(`${year}/${mm}/`);
					items = items!.map((item, j) =>
						j === i ? { ...item, dayCount: r.prefixes.length } : item
					);
				} catch { /* count reste null */ }
			});
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
		<div class="empty">Aucun mois disponible</div>
	{:else}
		{#each items ?? [] as item, i}
			<button class="card" style="--i:{i}" onclick={() => onSelect(item.mm)}>
				<span class="label">{item.label}</span>
				<span class="count">
					{#if item.dayCount === null}
						<span class="loading">…</span>
					{:else}
						{item.dayCount} jours · {item.dayCount} ថ្ងៃ
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
		transition: border-color var(--transition), transform var(--transition), box-shadow var(--transition);
		width: 100%;
		box-shadow: var(--shadow-sm);
	}

	.card:hover {
		border-color: color-mix(in srgb, var(--accent) 60%, transparent);
		transform: translateY(-2px);
		box-shadow: var(--shadow-md), var(--shadow-accent);
	}

	.label {
		flex: 1;
		font-size: var(--fs-lg);
		color: var(--text);
		font-weight: 500;
	}

	.count {
		font-size: var(--fs-sm);
		color: var(--muted);
		white-space: nowrap;
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
