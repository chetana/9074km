<script lang="ts">
	import { CameraOff } from 'lucide-svelte';
	import { ogImageUrl } from '$lib/api';

	// Remplace le jardin de fleurs (DayFlower.svelte) par des vignettes photo, cohérent avec les
	// couvertures années/mois — un jour plein montre sa vraie photo au lieu d'une fleur décorative,
	// un jour vide montre un appareil photo barré plutôt qu'une fleur fanée. Demandé par Chetana
	// le 23/09/2026 après avoir vu le rendu des couvertures YearList/MonthList.
	interface Props {
		dd: string;
		label: string;
		fileCount: number | null;
		thumb: string | null;
		isToday?: boolean;
		index?: number;
		onSelect: () => void;
	}

	let { dd, label, fileCount, thumb, isToday = false, index = 0, onSelect }: Props = $props();

	// Un <img> avec onerror (retry une fois) plutôt qu'un background-image CSS : le CSS n'a aucun
	// moyen de détecter un échec de chargement, donc une vignette qui rate une fois (S3/og-image
	// occasionnellement lent sur la box) reste vide en silence au lieu de réessayer — bug réel
	// remonté par Chetana le 23/09/2026.
	let loadFailed = $state(false);
	let retried = $state(false);
	function onImgError() {
		if (!retried) { retried = true; loadFailed = false; return; } // le key-change ci-dessous relance le <img>
		loadFailed = true;
	}
	$effect(() => { thumb; loadFailed = false; retried = false; });

	const tileState = $derived<'loading' | 'empty' | 'photo'>(
		fileCount === null ? 'loading' : fileCount > 0 && thumb && !loadFailed ? 'photo' : 'empty'
	);
</script>

<button
	class="tile"
	class:today={isToday}
	class:loading={tileState === 'loading'}
	style:--i={index}
	onclick={onSelect}
	aria-label={label}
	title={label}
>
	{#if tileState === 'photo' && thumb}
		{#key retried}
			<img class="thumb" src={ogImageUrl(thumb, 200)} alt="" loading="lazy" onerror={onImgError} />
		{/key}
	{:else if tileState === 'empty'}
		<CameraOff size={22} class="empty-icon" />
	{/if}
	<span class="day-num" class:on-photo={tileState === 'photo'}>{dd}</span>
	{#if fileCount !== null && fileCount > 0}
		<span class="badge" aria-hidden="true">{fileCount}</span>
	{/if}
</button>

<style>
	.tile {
		position: relative;
		width: 5.5rem;
		height: 5.5rem;
		padding: 0;
		border-radius: 1rem;
		border: 2px solid transparent;
		background-color: var(--surface-2);
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
		animation: tile-in 0.4s cubic-bezier(0.34, 1.4, 0.64, 1) both;
		animation-delay: calc(var(--i, 0) * 30ms);
	}

	.thumb {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	@keyframes tile-in {
		from { opacity: 0; transform: scale(0.85); }
		to   { opacity: 1; transform: scale(1); }
	}

	.tile:hover { transform: scale(1.05); }
	.tile:active { transform: scale(0.95); }

	.tile.today {
		border-color: var(--lavender-deep);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--lavender-deep) 30%, transparent);
	}

	.tile.loading {
		background: linear-gradient(
			90deg,
			var(--surface-2) 25%,
			color-mix(in srgb, var(--accent) 10%, var(--surface-2)) 50%,
			var(--surface-2) 75%
		);
		background-size: 200% 100%;
		animation: shimmer 1.6s ease-in-out infinite;
	}
	@keyframes shimmer {
		0%   { background-position: -200% 0; }
		100% { background-position:  200% 0; }
	}

	.tile :global(.empty-icon) {
		color: var(--muted-glyph);
	}

	.day-num {
		position: absolute;
		bottom: 4px;
		left: 6px;
		z-index: 1;
		font-family: var(--font-display);
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--text);
		background: color-mix(in srgb, var(--bg) 78%, transparent);
		padding: 0 6px;
		border-radius: 6px;
		line-height: 1.5;
	}
	/* Sur une photo, le badge doit rester lisible quelle que soit sa luminosité — même teinte
	   chaude que FileTile.svelte (coffre) plutôt qu'un aplat noir. */
	.day-num.on-photo {
		color: #FFF8F0;
		background: color-mix(in srgb, var(--text) 55%, transparent);
	}

	.badge {
		position: absolute;
		top: 4px;
		right: 4px;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		border-radius: 99px;
		background: var(--accent-deep);
		color: #FFF8F0;
		font-size: 0.6rem;
		font-weight: 700;
		line-height: 16px;
		text-align: center;
	}
</style>
