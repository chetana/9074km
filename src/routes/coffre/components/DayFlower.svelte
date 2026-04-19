<script lang="ts">
	interface Props {
		dd: string;
		label: string;
		fileCount: number | null;
		isToday?: boolean;
		isWeekend?: boolean;
		index?: number;
		onSelect: () => void;
	}

	let { dd, label, fileCount, isToday = false, isWeekend = false, index = 0, onSelect }: Props = $props();

	// Bloomed si le jour contient des fichiers, bud si 0, loading si null
	const state = $derived<'loading' | 'bud' | 'bloom'>(
		fileCount === null ? 'loading' : fileCount > 0 ? 'bloom' : 'bud'
	);

	// Couleur selon contexte : today=teal, weekend=lotus, autre=sakura
	const colorVariant = $derived(
		isToday ? 'today' : isWeekend ? 'lotus' : 'sakura'
	);
</script>

<button
	class="flower"
	class:bloom={state === 'bloom'}
	class:bud={state === 'bud'}
	class:loading={state === 'loading'}
	class:today={isToday}
	data-color={colorVariant}
	style:--i={index}
	onclick={onSelect}
	aria-label={label}
	title={label}
>
	<svg class="flower-svg" viewBox="-50 -50 100 100" aria-hidden="true">
		<!-- 5 pétales radiaux (rotation via SVG transform attribute) -->
		{#each Array(5) as _, i}
			<ellipse
				class="petal"
				cx="0"
				cy="-28"
				rx="16"
				ry="26"
				transform="rotate({i * 72})"
				style:--rot="{i * 72}deg"
				style:--delay="{i * 60}ms"
			/>
		{/each}
		<!-- Cœur (pollen) -->
		<circle class="core" cx="0" cy="0" r="9" />
	</svg>

	<span class="day-num">{dd}</span>

	{#if fileCount !== null && fileCount > 0}
		<span class="badge" aria-hidden="true">{fileCount}</span>
	{/if}
</button>

<style>
	.flower {
		--petal-color: #F4A0B8;
		--petal-glow: rgba(244, 160, 184, 0.4);
		--core-color: #FFE38A;

		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 5.5rem;
		height: 5.5rem;
		padding: 0;
		background: transparent;
		border: none;
		cursor: pointer;
		transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);

		animation: flower-in 0.6s cubic-bezier(0.34, 1.4, 0.64, 1) both;
		animation-delay: calc(var(--i, 0) * 50ms);
	}

	.flower[data-color="lotus"] {
		--petal-color: #E8B87A;
		--petal-glow: rgba(232, 184, 122, 0.4);
		--core-color: #FFD3A0;
	}

	.flower[data-color="today"] {
		--petal-color: #58C4DC;
		--petal-glow: rgba(88, 196, 220, 0.6);
		--core-color: #FFF1A0;
	}

	.flower:hover {
		transform: scale(1.08);
	}

	.flower:active {
		transform: scale(0.95);
	}

	.flower-svg {
		width: 100%;
		height: 100%;
		overflow: visible;
	}

	/* ── Pétales ─────────────────────────────────────────────── */
	.petal {
		fill: var(--petal-color);
		filter: drop-shadow(0 1px 3px var(--petal-glow));
		transition: all 0.5s cubic-bezier(0.34, 1.4, 0.64, 1);
		opacity: 0.92;
	}

	/* Bud = pétales regroupés vers le centre et décolorés (via SVG attrs) */
	.bud .petal {
		opacity: 0.5;
		fill: color-mix(in srgb, var(--petal-color) 55%, #8A9BAB);
	}

	/* Loading = pulsation */
	.loading .petal {
		opacity: 0.3;
		animation: pulse 1.4s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 0.25; }
		50% { opacity: 0.55; }
	}

	/* ── Cœur ────────────────────────────────────────────────── */
	.core {
		fill: var(--core-color);
		filter: drop-shadow(0 0 4px rgba(255, 227, 138, 0.6));
	}

	.bud .core {
		fill: color-mix(in srgb, var(--core-color) 40%, #8A9BAB);
	}

	/* ── Today : halo subtil ─────────────────────────────────── */
	.today::before {
		content: '';
		position: absolute;
		inset: -4px;
		border-radius: 50%;
		background: radial-gradient(circle, var(--petal-glow) 0%, transparent 70%);
		animation: halo 3s ease-in-out infinite;
		pointer-events: none;
	}

	@keyframes halo {
		0%, 100% { opacity: 0.4; transform: scale(1); }
		50% { opacity: 0.8; transform: scale(1.08); }
	}

	/* ── Numéro du jour ──────────────────────────────────────── */
	.day-num {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		font-size: 0.9rem;
		font-weight: 700;
		color: #3a2030;
		text-shadow: 0 1px 2px rgba(255, 255, 255, 0.6);
		letter-spacing: -0.02em;
		pointer-events: none;
		z-index: 2;
	}

	.bud .day-num {
		color: color-mix(in srgb, #3a2030 70%, transparent);
	}

	/* ── Badge count ─────────────────────────────────────────── */
	.badge {
		position: absolute;
		top: 0;
		right: 0;
		background: var(--core-color);
		color: #3a2030;
		font-size: 0.65rem;
		font-weight: 700;
		padding: 2px 6px;
		border-radius: 999px;
		border: 1.5px solid #fff;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
		z-index: 3;
	}

	@keyframes flower-in {
		from {
			opacity: 0;
			transform: scale(0.3) rotate(-30deg);
		}
		to {
			opacity: 1;
			transform: scale(1) rotate(0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.flower, .petal, .today::before { animation: none; transition: none; }
	}
</style>
