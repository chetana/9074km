	import { listObjects, isMediaFile, getCachedList } from '$lib/api';
	import { DAYS_FR, DAYS_KH, MONTHS_FR } from '$lib/i18n';
	import { createSWR } from '$lib/swr.svelte';

	interface Props {
		year: string;
		month: string;
		onSelect: (day: string) => void;
	}

	let { year, month, onSelect }: Props = $props();

	interface DayEntry { dd: string; label: string; fileCount: number | null }

	function dayLabel(dd: string): string {
		const d = new Date(`${year}-${month}-${dd}T12:00:00`);
		const dow = (d.getDay() + 6) % 7;
		const monthName = MONTHS_FR[parseInt(month, 10) - 1];
		return `${DAYS_FR[dow]} · ${DAYS_KH[dow]} — ${dd} ${monthName}`;
	}

	// SWR pour la liste des jours de ce mois
	const swr = createSWR(
		`days_${year}_${month}`,
		() => getCachedList(`${year}/${month}/`),
		() => listObjects(`${year}/${month}/`),
		{ prefixes: [], items: [] }
	);

	// Derived state pour les jours
	let days = $derived(
		swr.data.prefixes
			.map((p) => p.replace(`${year}/${month}/`, '').replace('/', ''))
			.filter((p) => /^\d{2}$/.test(p))
			.sort((a, b) => Number(b) - Number(a))
	);

	let items = $state<DayEntry[]>([]);
	let error = $derived(swr.error ? String(swr.error) : null);

	// Sync items quand days change
	$effect(() => {
		items = days.map(dd => {
			const existing = items.find(it => it.dd === dd);
			return { dd, label: dayLabel(dd), fileCount: existing?.fileCount ?? null };
		});

		// Charger les counts en lazy
		const currentItems = items;
		days.forEach(async (dd, i) => {
			if (currentItems[i]?.fileCount !== null) return;
			try {
				const r = await listObjects(`${year}/${month}/${dd}/`);
				const count = r.items.filter((item) => isMediaFile(item.name)).length;
				if (currentItems[i]) currentItems[i].fileCount = count;
			} catch { /* count reste null */ }
		});
	});
</script>

<div class="list">
	{#if swr.loading && items.length === 0}
		{#each [1,2,3,4] as _}
			<div class="skeleton"></div>
		{/each}
	{:else if error}
		<div class="error">
			<p>Erreur de chargement</p>
			<button onclick={() => swr.refresh()}>Réessayer</button>
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
		background: var(--surface);
		border: 1px solid var(--border);
		border-left: 3px solid color-mix(in srgb, var(--accent) 35%, transparent);
		border-radius: var(--radius-md);
		padding: var(--space-3) var(--space-4);
		text-align: left;
		transition: border-color var(--transition), transform var(--transition), box-shadow var(--transition), background var(--transition);
		width: 100%;
		box-shadow: var(--shadow-sm);
	}

	.card:hover {
		background: color-mix(in srgb, var(--accent) 5%, var(--surface));
		border-color: color-mix(in srgb, var(--accent) 50%, transparent);
		border-left-color: var(--accent);
		transform: translateX(3px);
		box-shadow: var(--shadow-md);
	}

	.info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.label {
		font-size: var(--fs-md);
		color: var(--text);
		font-weight: 500;
	}

	.count {
		display: inline-flex;
		align-items: center;
		font-size: var(--fs-xs);
		color: var(--muted);
		background: color-mix(in srgb, var(--accent) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--accent) 15%, transparent);
		border-radius: var(--radius-full);
		padding: 1px 8px;
		width: fit-content;
	}

	.loading {
		opacity: 0.4;
	}

	.arrow {
		font-size: var(--fs-xl);
		color: color-mix(in srgb, var(--accent) 40%, var(--muted));
		transition: transform 0.2s;
	}

	.card:hover .arrow {
		transform: translateX(2px);
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
