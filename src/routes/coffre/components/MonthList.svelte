<script lang="ts">
	import { listObjects, getCachedList, fetchCover, ogImageUrl } from '$lib/api';
	import { userStore } from '$lib/auth';
	import { MONTHS_FR, MONTHS_KH } from '$lib/i18n';
	import { createSWR } from '$lib/swr.svelte';
	import { ChevronRight } from 'lucide-svelte';

	interface Props {
		year: string;
		onSelect: (month: string) => void;
	}

	let { year, onSelect }: Props = $props();
	const token = userStore;

	interface MonthEntry { mm: string; label: string; dayCount: number | null; cover: string | null }

	function monthLabel(mm: string) {
		const idx = parseInt(mm, 10) - 1;
		return `${mm} — ${MONTHS_FR[idx]} · ${MONTHS_KH[idx]}`;
	}

	// SWR pour la liste des mois de cette année
	const swr = createSWR(
		() => `months_${year}_${$token ? '1' : '0'}`,
		() => getCachedList(`${year}/`),
		() => listObjects(`${year}/`),
		{ prefixes: [], items: [] }
	);

	// Derived state pour les mois
	let months = $derived(
		swr.data.prefixes
			.map((p) => p.replace(`${year}/`, '').replace('/', ''))
			.filter((p) => /^\d{2}$/.test(p))
			.sort((a, b) => Number(b) - Number(a))
	);

	// Diagnostic logs
	$effect(() => {
		console.log(`[MonthList] SWR State - loading: ${swr.loading}, data.prefixes: ${swr.data.prefixes.length}`);
	});

	// État pour stocker les comptes de jours (lazy)
	let countsMap = $state<Record<string, number>>({});
	let coversMap = $state<Record<string, string | null>>({});

	let error = $derived(swr.error ? String(swr.error) : null);

	// La liste des items est ENTIÈREMENT dérivée (réactif pur)
	let items = $derived(
		months.map((m) => ({
			mm: m,
			label: monthLabel(m),
			dayCount: countsMap[m] ?? null,
			cover: coversMap[m] ?? null
		}))
	);

	// Effet pour charger les counts (indépendant du rendu initial)
	$effect(() => {
		const currentMonths = months;
		currentMonths.forEach(async (m) => {
			if (countsMap[m] !== undefined) return;
			try {
				const r = await listObjects(`${year}/${m}/`);
				countsMap[m] = r.prefixes.length;
			} catch { /* count reste null */ }
		});
	});

	// Photo de couverture (plan de modernisation P6, 23/09/2026) — un appel par mois, lazy.
	$effect(() => {
		const currentMonths = months;
		currentMonths.forEach(async (m) => {
			if (coversMap[m] !== undefined) return;
			coversMap[m] = await fetchCover(`${year}/${m}/`);
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
		<div class="empty">Aucun mois disponible</div>
	{:else}
		{#each items ?? [] as item, i}
			<button
				class="card"
				class:has-cover={!!item.cover}
				style="--i:{i}{item.cover ? `;--cover:url(${JSON.stringify(ogImageUrl(item.cover, 400))})` : ''}"
				onclick={() => onSelect(item.mm)}
			>
				<span class="label">{item.label}</span>
				<span class="count">
					{#if item.dayCount === null}
						<span class="loading">…</span>
					{:else}
						{item.dayCount} jours · {item.dayCount} ថ្ងៃ
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
	.card.has-cover {
		background:
			linear-gradient(90deg, color-mix(in srgb, var(--bg) 60%, transparent), color-mix(in srgb, var(--bg) 82%, transparent)),
			var(--cover) center / cover no-repeat;
	}

	.card:hover {
		border-color: var(--accent);
		transform: translateX(3px);
	}

	.label {
		flex: 1;
		font-family: var(--font-display);
		font-size: var(--fs-lg);
		color: var(--text);
		font-weight: 600;
	}

	.count {
		font-size: var(--fs-sm);
		color: var(--muted-text);
		white-space: nowrap;
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
