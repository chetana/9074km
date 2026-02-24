<script lang="ts">
	import { onMount } from 'svelte';
	import { listObjects, isMediaFile } from '$lib/api';
	import { MONTHS_FR, MONTHS_KH } from '$lib/i18n';

	interface Props {
		year: string;
		onSelect: (month: string) => void;
	}

	let { year, onSelect }: Props = $props();

	interface MonthEntry { mm: string; label: string; dayCount: number }

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

			const counts = await Promise.all(
				months.map(async (mm) => {
					const r = await listObjects(`${year}/${mm}/`);
					return r.prefixes.length;
				})
			);

			items = months.map((mm, i) => ({
				mm,
				label: monthLabel(mm),
				dayCount: counts[i]
			}));
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
		{#each items ?? [] as item}
			<button class="card" onclick={() => onSelect(item.mm)}>
				<span class="label">{item.label}</span>
				<span class="count">{item.dayCount} jours · {item.dayCount} ថ្ងៃ</span>
				<span class="arrow">›</span>
			</button>
		{/each}
	{/if}
</div>

<style>
	.list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 16px;
	}

	.card {
		display: flex;
		align-items: center;
		gap: 12px;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 16px;
		text-align: left;
		transition: border-color 0.15s;
		width: 100%;
	}

	.card:hover { border-color: var(--accent); }

	.label {
		flex: 1;
		font-size: 15px;
		color: var(--text);
		font-weight: 500;
	}

	.count {
		font-size: 12px;
		color: var(--muted);
		white-space: nowrap;
	}

	.arrow {
		font-size: 18px;
		color: var(--muted);
	}

	.skeleton {
		height: 60px;
		background: var(--card);
		border-radius: 12px;
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 0.5; }
		50% { opacity: 1; }
	}

	.error {
		text-align: center;
		padding: 32px;
		color: var(--muted);
		display: flex;
		flex-direction: column;
		gap: 12px;
		align-items: center;
	}

	.error button {
		padding: 8px 16px;
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--accent);
	}

	.empty {
		text-align: center;
		padding: 48px;
		color: var(--muted);
	}
</style>
