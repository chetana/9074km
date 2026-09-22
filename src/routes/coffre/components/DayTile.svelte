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

	const state = $derived<'loading' | 'empty' | 'photo'>(
		fileCount === null ? 'loading' : fileCount > 0 && thumb ? 'photo' : 'empty'
	);
</script>

<button
	class="tile"
	class:today={isToday}
	class:loading={state === 'loading'}
	style:--i={index}
	style:background-image={state === 'photo' && thumb ? `url(${JSON.stringify(ogImageUrl(thumb, 200))})` : undefined}
	onclick={onSelect}
	aria-label={label}
	title={label}
>
	{#if state === 'empty'}
		<CameraOff size={22} class="empty-icon" />
	{/if}
	<span class="day-num">{dd}</span>
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
		background-size: cover;
		background-position: center;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
		animation: tile-in 0.4s cubic-bezier(0.34, 1.4, 0.64, 1) both;
		animation-delay: calc(var(--i, 0) * 30ms);
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
	.tile[style*="background-image"] .day-num {
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
