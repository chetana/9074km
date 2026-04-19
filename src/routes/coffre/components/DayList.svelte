<script lang="ts">
	import { listObjects, isMediaFile, getCachedList } from '$lib/api';
	import { userStore } from '$lib/auth';
	import { DAYS_FR, DAYS_KH, MONTHS_FR } from '$lib/i18n';
	import { createSWR } from '$lib/swr.svelte';
	import DayFlower from './DayFlower.svelte';

	interface Props {
		year: string;
		month: string;
		onSelect: (day: string) => void;
	}

	let { year, month, onSelect }: Props = $props();
	const token = userStore;

	function dayLabel(dd: string): string {
		const d = new Date(`${year}-${month}-${dd}T12:00:00`);
		const dow = (d.getDay() + 6) % 7;
		const monthName = MONTHS_FR[parseInt(month, 10) - 1];
		return `${DAYS_FR[dow]} · ${DAYS_KH[dow]} — ${dd} ${monthName}`;
	}

	function isWeekendDay(dd: string): boolean {
		const d = new Date(`${year}-${month}-${dd}T12:00:00`);
		const dow = d.getDay();
		return dow === 0 || dow === 6;
	}

	function isTodayDay(dd: string): boolean {
		const now = new Date();
		return now.getFullYear() === parseInt(year, 10) &&
			now.getMonth() + 1 === parseInt(month, 10) &&
			now.getDate() === parseInt(dd, 10);
	}

	// SWR pour la liste des jours de ce mois
	const swr = createSWR(
		() => `days_${year}_${month}_${$token ? '1' : '0'}`,
		() => getCachedList(`${year}/${month}/`),
		() => listObjects(`${year}/${month}/`),
		{ prefixes: [], items: [] }
	);

	// Jours avec préfixe GCS (= potentiellement des fichiers)
	const daysWithPrefix = $derived(
		new Set(
			swr.data.prefixes
				.map((p) => p.replace(`${year}/${month}/`, '').replace('/', ''))
				.filter((p) => /^\d{2}$/.test(p))
		)
	);

	const daysInMonth = $derived.by(() => {
		const y = parseInt(year, 10);
		const m = parseInt(month, 10);
		return new Date(y, m, 0).getDate();
	});

	// Tous les jours du mois (1 → daysInMonth) : les vides seront des buds
	const days = $derived(
		Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0'))
	);

	let countsMap = $state<Record<string, number>>({});
	let error = $derived(swr.error ? String(swr.error) : null);

	let items = $derived(
		days.map((dd) => ({
			dd,
			label: dayLabel(dd),
			// Si pas de préfixe GCS pour ce jour → 0 fichiers (bud), sinon on attend le count
			fileCount: daysWithPrefix.has(dd) ? (countsMap[dd] ?? null) : 0,
			isToday: isTodayDay(dd),
			isWeekend: isWeekendDay(dd),
		}))
	);

	$effect(() => {
		// Ne charge les counts que pour les jours qui ont un préfixe
		const toFetch = days.filter((dd) => daysWithPrefix.has(dd));
		toFetch.forEach(async (dd) => {
			if (countsMap[dd] !== undefined) return;
			try {
				const r = await listObjects(`${year}/${month}/${dd}/`);
				const count = r.items.filter((item) => isMediaFile(item.name)).length;
				countsMap[dd] = count;
			} catch { /* count reste null */ }
		});
	});

	const monthLabelFull = $derived(
		`${MONTHS_FR[parseInt(month, 10) - 1]} ${year}`
	);
</script>

<div class="garden">
	<header class="garden-header">
		<h2>{monthLabelFull}</h2>
		<p class="subtitle">
			{#if items.length > 0}
				{items.filter(i => (i.fileCount ?? 0) > 0).length} jours fleuris · {items.length} au total
			{:else}
				Un mois vide pour l'instant
			{/if}
		</p>
	</header>

	{#if swr.loading && items.length === 0}
		<div class="grid">
			{#each [1,2,3,4,5,6,7,8] as i}
				<div class="skeleton-flower" style="--i:{i}"></div>
			{/each}
		</div>
	{:else if error}
		<div class="error">
			<p>Erreur de chargement</p>
			<button onclick={() => swr.refresh()}>Réessayer</button>
		</div>
	{:else if items && items.length === 0}
		<div class="empty">
			<span class="empty-icon">🌱</span>
			<p>Aucun jour dans ce mois</p>
		</div>
	{:else}
		<div class="grid">
			{#each items as item, i}
				<DayFlower
					dd={item.dd}
					label={item.label}
					fileCount={item.fileCount}
					isToday={item.isToday}
					isWeekend={item.isWeekend}
					index={i}
					onSelect={() => onSelect(item.dd)}
				/>
			{/each}
		</div>
	{/if}
</div>

<style>
	.garden {
		padding: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.garden-header {
		text-align: center;
		padding: var(--space-3) var(--space-4);
		background: color-mix(in srgb, var(--surface) 85%, transparent);
		border: 1px solid color-mix(in srgb, var(--accent) 18%, transparent);
		border-radius: var(--radius-md);
		box-shadow: 0 2px 12px color-mix(in srgb, var(--accent) 8%, transparent);
	}

	.garden-header h2 {
		font-size: var(--fs-2xl);
		font-weight: 600;
		color: var(--accent-warm);
		letter-spacing: -0.01em;
		text-transform: capitalize;
		text-shadow: 0 1px 2px rgba(255, 255, 255, 0.5);
	}

	.subtitle {
		font-size: var(--fs-sm);
		color: var(--text);
		margin-top: var(--space-1);
		opacity: 0.7;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr));
		gap: var(--space-3);
		justify-items: center;
		padding: var(--space-2);
	}

	.skeleton-flower {
		width: 5.5rem;
		height: 5.5rem;
		border-radius: 50%;
		background: radial-gradient(
			circle,
			color-mix(in srgb, var(--accent) 15%, transparent) 0%,
			transparent 70%
		);
		animation: skel-pulse 1.4s ease-in-out infinite;
		animation-delay: calc(var(--i, 0) * 80ms);
	}

	@keyframes skel-pulse {
		0%, 100% { opacity: 0.3; transform: scale(0.9); }
		50% { opacity: 0.7; transform: scale(1); }
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
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		align-items: center;
	}

	.empty-icon {
		font-size: 3rem;
	}
</style>
