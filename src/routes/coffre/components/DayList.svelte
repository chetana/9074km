<script lang="ts">
	import { onMount } from 'svelte';
	import { listObjects, isMediaFile } from '$lib/api';
	import { DAYS_FR, DAYS_KH, MONTHS_FR } from '$lib/i18n';

	interface Props {
		year: string;
		month: string;
		onSelect: (day: string) => void;
	}

	let { year, month, onSelect }: Props = $props();

	interface DayEntry { dd: string; label: string; fileCount: number | null }

	let items = $state<DayEntry[] | null>(null);
	let error = $state<string | null>(null);

	function dayLabel(dd: string): string {
		const d = new Date(`${year}-${month}-${dd}T12:00:00`);
		const dow = (d.getDay() + 6) % 7;
		const monthName = MONTHS_FR[parseInt(month, 10) - 1];
		return `${DAYS_FR[dow]} · ${DAYS_KH[dow]} — ${dd} ${monthName}`;
	}

	async function load() {
		error = null;
		items = null;
		try {
			const result = await listObjects(`${year}/${month}/`);
			const days = result.prefixes
				.map((p) => p.replace(`${year}/${month}/`, '').replace('/', ''))
				.filter((p) => /^\d{2}$/.test(p))
				.sort((a, b) => Number(b) - Number(a));

			// Afficher immédiatement les lignes sans les counts
			items = days.map((dd) => ({ dd, label: dayLabel(dd), fileCount: null }));

			// Charger les counts en lazy
			days.forEach(async (dd, i) => {
				try {
					const r = await listObjects(`${year}/${month}/${dd}/`);
					const count = r.items.filter((item) => isMediaFile(item.name)).length;
					items = items!.map((item, j) =>
						j === i ? { ...item, fileCount: count } : item
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
		{#each [1,2,3,4] as _}
			<div class="skeleton"></div>
		{/each}
	{:else if error}
		<div class="error">
			<p>Erreur de chargement</p>
			<button onclick={load}>Réessayer</button>
		</div>
	{:else if items && items.length === 0}
		<div class="empty">Aucun jour disponible</div>
	{:else}
		{#each items ?? [] as item, i}
			<button class="card" style="--i:{i}" onclick={() => onSelect(item.dd)}>
				<div class="info">
					<span class="label">{item.label}</span>
					<span class="count">
						{#if item.fileCount === null}
							<span class="loading">…</span>
						{:else}
							{item.fileCount} fichiers · {item.fileCount} ឯកសារ
						{/if}
					</span>
				</div>
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

	.info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.label {
		font-size: var(--fs-md);
		color: var(--text);
		font-weight: 500;
	}

	.count {
		font-size: var(--fs-xs);
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
		height: 4.25rem;
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
