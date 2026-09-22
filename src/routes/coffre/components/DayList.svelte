<script lang="ts">
	import { listObjects, isMediaFile, getCachedList } from '$lib/api';
	import { userStore } from '$lib/auth';
	import { DAYS_FR, DAYS_KH, MONTHS_FR } from '$lib/i18n';
	import { createSWR } from '$lib/swr.svelte';
	import DayTile from './DayTile.svelte';

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
	let thumbsMap = $state<Record<string, string | null>>({});
	let error = $derived(swr.error ? String(swr.error) : null);

	let items = $derived(
		days.map((dd) => ({
			dd,
			label: dayLabel(dd),
			// Si pas de préfixe GCS pour ce jour → 0 fichiers (vide), sinon on attend le count
			fileCount: daysWithPrefix.has(dd) ? (countsMap[dd] ?? null) : 0,
			thumb: thumbsMap[dd] ?? null,
			isToday: isTodayDay(dd),
			isWeekend: isWeekendDay(dd),
		}))
	);

	$effect(() => {
		// Ne charge les counts que pour les jours qui ont un préfixe — une seule requête sert à la
		// fois le compte ET la vignette (premier média du jour), pas d'appel réseau en plus pour
		// la photo de couverture du jour (plan de modernisation P6, 23/09/2026).
		const toFetch = days.filter((dd) => daysWithPrefix.has(dd));
		toFetch.forEach(async (dd) => {
			if (countsMap[dd] !== undefined) return;
			try {
				const r = await listObjects(`${year}/${month}/${dd}/`);
				const media = r.items.filter((item) => isMediaFile(item.name)).map((item) => item.name);
				countsMap[dd] = media.length;
				// La vignette doit être une image — og-image (sharp) ne sait pas resizer une vidéo.
				// La dernière photo du jour plutôt que la première (demandé par Chetana, 23/09/2026).
				const images = media.filter((name) => /\.(jpe?g|png|webp|gif|heic)$/i.test(name));
				thumbsMap[dd] = images[images.length - 1] ?? null;
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
				{items.filter(i => (i.fileCount ?? 0) > 0).length} jours avec photos · {items.length} au total
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
				<DayTile
					dd={item.dd}
					label={item.label}
					fileCount={item.fileCount}
					thumb={item.thumb}
					isToday={item.isToday}
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
