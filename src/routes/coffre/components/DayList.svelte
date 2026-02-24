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

	interface DayEntry { dd: string; label: string; fileCount: number }

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

			const counts = await Promise.all(
				days.map(async (dd) => {
					const r = await listObjects(`${year}/${month}/${dd}/`);
					return r.items.filter((item) => isMediaFile(item.name)).length;
				})
			);

			items = days.map((dd, i) => ({
				dd,
				label: dayLabel(dd),
				fileCount: counts[i]
			}));
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
		{#each items ?? [] as item}
			<button class="card" onclick={() => onSelect(item.dd)}>
				<div class="info">
					<span class="label">{item.label}</span>
					<span class="count">{item.fileCount} fichiers · {item.fileCount} ឯកសារ</span>
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
		transition: border-color 0.15s;
		width: 100%;
	}

	.card:hover { border-color: var(--accent); }

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

	.arrow {
		font-size: var(--fs-xl);
		color: var(--muted);
	}

	.skeleton {
		height: 4.25rem;
		background: var(--card);
		border-radius: var(--radius-md);
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 0.5; }
		50% { opacity: 1; }
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
