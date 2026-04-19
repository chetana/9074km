<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	// Temps réel des deux côtés (Paris + Phnom Penh)
	let now = $state(new Date());

	let interval: ReturnType<typeof setInterval>;
	onMount(() => {
		interval = setInterval(() => (now = new Date()), 60_000); // refresh chaque minute
	});
	onDestroy(() => clearInterval(interval));

	/**
	 * Retourne un dégradé selon l'heure d'un fuseau horaire.
	 * Décompose le ciel en 4 couches (haut → bas).
	 */
	function skyGradient(hour: number): { top: string; mid: string; bot: string; label: string } {
		// Aube : 5-8h
		if (hour >= 5 && hour < 8)
			return { top: '#1a1e4a', mid: '#6d5b8a', bot: '#f3a68a', label: 'aube' };
		// Matin clair : 8-11h
		if (hour >= 8 && hour < 11)
			return { top: '#8fc5e8', mid: '#c9e5f4', bot: '#fef4e3', label: 'matin' };
		// Midi : 11-15h
		if (hour >= 11 && hour < 15)
			return { top: '#5fa8d8', mid: '#a8d4ef', bot: '#e8f3fb', label: 'midi' };
		// Après-midi doré : 15-18h
		if (hour >= 15 && hour < 18)
			return { top: '#78a8cc', mid: '#e8b87a', bot: '#f4d9a8', label: 'après-midi' };
		// Crépuscule : 18-20h
		if (hour >= 18 && hour < 20)
			return { top: '#3d2b5a', mid: '#b8647a', bot: '#f2a068', label: 'crépuscule' };
		// Soir : 20-22h
		if (hour >= 20 && hour < 22)
			return { top: '#1a1536', mid: '#3d2b5a', bot: '#5a3c6e', label: 'soir' };
		// Nuit : 22-5h
		return { top: '#050812', mid: '#0d1428', bot: '#1a1f3a', label: 'nuit' };
	}

	// Phase lunaire (calcul simplifié basé sur la date)
	function moonPhase(date: Date): number {
		const y = date.getFullYear();
		const m = date.getMonth() + 1;
		const d = date.getDate();
		// Référence : 2000-01-06 = nouvelle lune
		const jd = 367 * y - Math.floor(7 * (y + Math.floor((m + 9) / 12)) / 4) + Math.floor(275 * m / 9) + d - 730531.5;
		const synodic = 29.53059;
		const phase = (jd % synodic) / synodic;
		return phase; // 0 = new, 0.5 = full
	}

	// Heure Paris
	const parisHour = $derived.by(() => {
		const paris = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', hour: 'numeric', hour12: false }).format(now);
		return parseInt(paris, 10);
	});

	// Heure Phnom Penh
	const kpHour = $derived.by(() => {
		const kp = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Phnom_Penh', hour: 'numeric', hour12: false }).format(now);
		return parseInt(kp, 10);
	});

	const parisGrad = $derived(skyGradient(parisHour));
	const kpGrad = $derived(skyGradient(kpHour));

	const phase = $derived(moonPhase(now));
	const isNight = $derived(parisHour < 6 || parisHour >= 20 || kpHour < 6 || kpHour >= 20);

	// Ombre lune : left=-1 (croissant droit), right=+1 (croissant gauche), 0 = pleine
	const moonShadow = $derived.by(() => {
		// 0 (new) → 0.5 (full) → 1 (new again)
		if (phase < 0.5) return 1 - phase * 2; // croissant décroissant
		return -((phase - 0.5) * 2); // croissant croissant
	});
	const moonVisible = $derived(phase > 0.03 && phase < 0.97);

	// 60 étoiles positionnées aléatoirement (stable entre renders via seed)
	const stars = Array.from({ length: 60 }, (_, i) => ({
		x: ((i * 37) % 100),
		y: ((i * 53) % 60), // étoiles seulement dans la moitié haute
		size: 0.3 + ((i * 13) % 10) / 10,
		delay: (i * 17) % 50,
	}));
</script>

<div class="sky" aria-hidden="true">
	<!-- Dégradé horizontal : Paris (gauche) → Phnom Penh (droite) -->
	<div
		class="sky-gradient"
		style:--paris-top={parisGrad.top}
		style:--paris-mid={parisGrad.mid}
		style:--paris-bot={parisGrad.bot}
		style:--kp-top={kpGrad.top}
		style:--kp-mid={kpGrad.mid}
		style:--kp-bot={kpGrad.bot}
	></div>

	<!-- Étoiles (visibles surtout la nuit) -->
	{#if isNight}
		<div class="stars" style:opacity={isNight ? 0.7 : 0}>
			{#each stars as s}
				<span
					class="star"
					style:left="{s.x}%"
					style:top="{s.y}%"
					style:--size="{s.size}px"
					style:--delay="{s.delay}00ms"
				></span>
			{/each}
		</div>
	{/if}

	<!-- Lune (symbole commun aux 2 fuseaux) -->
	{#if moonVisible}
		<div class="moon-wrap">
			<div class="moon" style:--shadow-x="{moonShadow * 60}%"></div>
		</div>
	{/if}

	<!-- Ligne d'horizon douce -->
	<div class="horizon"></div>
</div>

<style>
	.sky {
		position: fixed;
		inset: 0;
		z-index: 0;
		overflow: hidden;
		pointer-events: none;
	}

	.sky-gradient {
		position: absolute;
		inset: 0;
		background:
			linear-gradient(
				to right,
				color-mix(in srgb, var(--paris-top) 85%, var(--kp-top) 15%) 0%,
				color-mix(in srgb, var(--paris-top) 50%, var(--kp-top) 50%) 50%,
				color-mix(in srgb, var(--paris-top) 15%, var(--kp-top) 85%) 100%
			),
			linear-gradient(
				to bottom,
				transparent 0%,
				color-mix(in srgb, var(--paris-mid) 70%, var(--kp-mid) 30%) 50%,
				color-mix(in srgb, var(--paris-bot) 70%, var(--kp-bot) 30%) 100%
			);
		background-blend-mode: screen;
		transition: background 4s ease-in-out;
	}

	.horizon {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 30%;
		height: 1px;
		background: linear-gradient(
			to right,
			transparent 0%,
			rgba(255, 255, 255, 0.12) 50%,
			transparent 100%
		);
		box-shadow: 0 0 16px rgba(255, 255, 255, 0.06);
	}

	.stars {
		position: absolute;
		inset: 0;
		transition: opacity 4s ease-in-out;
	}

	.star {
		position: absolute;
		width: var(--size);
		height: var(--size);
		background: #fff;
		border-radius: 50%;
		box-shadow: 0 0 4px rgba(255, 255, 255, 0.8);
		animation: twinkle 3s ease-in-out infinite;
		animation-delay: var(--delay);
	}

	@keyframes twinkle {
		0%, 100% { opacity: 0.3; transform: scale(0.8); }
		50% { opacity: 1; transform: scale(1.2); }
	}

	.moon-wrap {
		position: absolute;
		top: 8%;
		left: 50%;
		transform: translateX(-50%);
		width: 56px;
		height: 56px;
	}

	.moon {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		background: radial-gradient(circle at 30% 30%, #f5f1e6 0%, #e8e0c8 60%, #a89e7c 100%);
		box-shadow:
			0 0 24px rgba(245, 241, 230, 0.4),
			inset var(--shadow-x) 0 0 0 rgba(10, 15, 30, 0.85);
	}

	@media (prefers-reduced-motion: reduce) {
		.star { animation: none; }
		.sky-gradient { transition: none; }
	}
</style>
