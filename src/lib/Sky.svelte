<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { skyAt, hourInZone, moonPhase } from './sky';

	// Mécanisme porté de la maquette (design-proposals/chat-redesign/index.html) le 22/09/2026 —
	// plan de modernisation P2. AVANT : un seul dégradé horizontal appliqué à la bande du haut +
	// un mix 70/30 fixe pour le bas, `background-blend-mode: screen` qui délavait les pastels, pas
	// de voile de lisibilité (compensé depuis par 4 recettes de glassmorphism différentes sur
	// header/composer/dock). APRÈS : deux dégradés VERTICAUX pleine hauteur superposés (celui de
	// Phnom Penh masqué en dégradé horizontal transparent→opaque), un voile crème qui fond le ciel
	// dans --bg en haut/bas pour garder le contenu lisible SANS que chaque élément ait besoin de
	// son propre fond translucide, et une interpolation continue par paliers de 3h (plus de saut
	// de couleur à chaque heure ronde malgré la transition CSS de 4s).
	let now = $state(new Date());

	let interval: ReturnType<typeof setInterval>;
	onMount(() => {
		interval = setInterval(() => (now = new Date()), 60_000);
	});
	onDestroy(() => clearInterval(interval));

	const parisHour = $derived(hourInZone('Europe/Paris', now));
	const kpHour = $derived(hourInZone('Asia/Phnom_Penh', now));

	const paris = $derived(skyAt(parisHour, 'paris'));
	const kp = $derived(skyAt(kpHour, 'kp'));

	const isNight = $derived(paris.night || kp.night);
	const isDay = $derived(!isNight);

	const phase = $derived(moonPhase(now));
	// Décalage horizontal de l'occulteur de phase : 0/1 = nouvelle lune (disque plein occulté),
	// 0.5 = pleine lune (occulteur hors du disque).
	const moonShadowOffset = $derived((0.5 - phase) * 130);

	// 14 étoiles à positions stables (pas de recalcul à chaque tick, seule l'opacité globale
	// bouge selon isNight) — la maquette en utilise 14, l'implémentation précédente en avait 60.
	const STAR_POS: [number, number][] = [
		[8, 14], [18, 8], [27, 20], [34, 6], [42, 16], [52, 10], [61, 22], [70, 7],
		[78, 17], [86, 11], [15, 28], [47, 26], [65, 30], [90, 24],
	];
</script>

<div class="sky" class:is-night={isNight} aria-hidden="true">
	<div
		class="sky-gradient"
		style:--paris-top={paris.top}
		style:--paris-mid={paris.mid}
		style:--paris-bot={paris.bot}
		style:--kp-top={kp.top}
		style:--kp-mid={kp.mid}
		style:--kp-bot={kp.bot}
	>
		<div class="sky-layer paris"></div>
		<div class="sky-layer kp"></div>
	</div>

	<div class="sky-stars">
		{#each STAR_POS as [x, y], i}
			<span class="star" style:left="{x}%" style:top="{y}%" style:animation-delay="{i * 0.18}s"></span>
		{/each}
	</div>

	<div class="sun-glow" class:hidden={!isDay}></div>
	<div class="sky-moon">
		<div class="moon-shadow" style:transform="translateX({moonShadowOffset.toFixed(0)}%)"></div>
	</div>

	<div class="horizon"></div>
	<div class="sky-veil"></div>
</div>

<style>
	.sky {
		position: fixed;
		inset: 0;
		z-index: 0;
		overflow: hidden;
		pointer-events: none;
	}

	/* Deux dégradés VERTICAUX pleine hauteur superposés plutôt qu'un dégradé horizontal limité à
	   la bande du haut : le blend Paris↔Phnom Penh tient à toutes les hauteurs de l'écran, et les
	   couches restent opaques (plus de `multiply`/`screen` qui grisait ou délavait les pastels). */
	.sky-gradient {
		position: absolute;
		inset: 0;
		opacity: 0.92;
	}
	.sky-layer {
		position: absolute;
		inset: 0;
		transition: background 4s ease-in-out;
	}
	.sky-layer.paris {
		background: linear-gradient(to bottom, var(--paris-top) 0%, var(--paris-mid) 45%, var(--paris-bot) 78%, transparent 100%);
	}
	.sky-layer.kp {
		background: linear-gradient(to bottom, var(--kp-top) 0%, var(--kp-mid) 45%, var(--kp-bot) 78%, transparent 100%);
		-webkit-mask-image: linear-gradient(to right, transparent 15%, black 85%);
		mask-image: linear-gradient(to right, transparent 15%, black 85%);
	}

	/* Voile de lisibilité : fond le ciel dans le crème de l'app en haut/bas pour garder header,
	   composer et dock lisibles SANS qu'ils aient chacun besoin de leur propre recette de
	   glassmorphism — un seul point de vérité pour le contraste contenu/ciel. */
	.sky-veil {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			180deg,
			color-mix(in srgb, var(--bg) 88%, transparent) 0%,
			color-mix(in srgb, var(--bg) 18%, transparent) 30%,
			color-mix(in srgb, var(--bg) 14%, transparent) 62%,
			color-mix(in srgb, var(--bg) 80%, transparent) 100%
		);
	}

	.horizon {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 30%;
		height: 1px;
		background: linear-gradient(to right, transparent 0%, rgba(255, 255, 255, 0.7) 50%, transparent 100%);
	}

	.sun-glow {
		position: absolute;
		top: 16%;
		left: 74%;
		width: 90px;
		height: 90px;
		border-radius: 50%;
		background: radial-gradient(circle at 40% 35%, rgba(255,255,255,0.9), rgba(255,214,150,0.55) 45%, rgba(255,214,150,0) 72%);
		opacity: 1;
		transition: opacity 3s ease;
	}
	.sun-glow.hidden { opacity: 0; }

	.sky-moon {
		position: absolute;
		top: 14%;
		left: 72%;
		width: 46px;
		height: 46px;
		border-radius: 50%;
		background: linear-gradient(135deg, #F5EFFF, #DCCFF2);
		box-shadow: 0 0 22px 6px rgba(220, 206, 242, 0.5);
		overflow: hidden;
		opacity: 0;
		transition: opacity 3s ease;
	}
	.sky.is-night .sky-moon { opacity: 1; }
	.moon-shadow {
		position: absolute;
		inset: 0;
		border-radius: 50%;
		background: #2A2438;
		transition: transform 3s ease;
	}

	.sky-stars {
		position: absolute;
		inset: 0;
		opacity: 0;
		transition: opacity 3s ease;
	}
	.sky.is-night .sky-stars { opacity: 0.9; }
	.star {
		position: absolute;
		width: 2px;
		height: 2px;
		border-radius: 50%;
		background: #FFFFFF;
		animation: twinkle 2.6s ease-in-out infinite;
	}
	@keyframes twinkle {
		0%, 100% { opacity: 0.35; }
		50%      { opacity: 1; }
	}

	@media (prefers-reduced-motion: reduce) {
		.star { animation: none; }
		.sky-layer, .sun-glow, .sky-moon, .sky-stars { transition: none; }
	}
</style>
