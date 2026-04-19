<script lang="ts">
	interface Props {
		active?: boolean;
		size?: number;
	}
	let { active = false, size = 26 }: Props = $props();
</script>

<svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class:active>
	<defs>
		<!-- Moitié soleil (Paris jour) -->
		<linearGradient id="hi-sun" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0%" stop-color="#FFE8A0" />
			<stop offset="100%" stop-color="#F9B96A" />
		</linearGradient>
		<!-- Moitié lune (Phnom Penh nuit) -->
		<linearGradient id="hi-moon" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0%" stop-color="#9CC6E8" />
			<stop offset="100%" stop-color="#5B8EC1" />
		</linearGradient>
	</defs>

	<!-- Cercle extérieur dual sun/moon -->
	<path d="M24 4 A20 20 0 0 1 24 44 Z" fill="url(#hi-moon)" />
	<path d="M24 4 A20 20 0 0 0 24 44 Z" fill="url(#hi-sun)" />

	<!-- Bordure -->
	<circle cx="24" cy="24" r="20" stroke="#fff" stroke-width="1.5" fill="none" opacity="0.85" />

	<!-- 12 marqueurs d'heures -->
	{#each Array(12) as _, i}
		<circle
			cx={24 + 16 * Math.cos((i * 30 - 90) * Math.PI / 180)}
			cy={24 + 16 * Math.sin((i * 30 - 90) * Math.PI / 180)}
			r={i % 3 === 0 ? 1.6 : 0.9}
			fill="#fff"
			opacity="0.85"
		/>
	{/each}

	<!-- Aiguilles (position fixe esthétique : ~10h10) -->
	<g class="hands" stroke-linecap="round" stroke="#2a1a1a">
		<line x1="24" y1="24" x2="14" y2="18" stroke-width="2.5" />
		<line x1="24" y1="24" x2="32" y2="19" stroke-width="2" />
	</g>
	<circle cx="24" cy="24" r="1.8" fill="#2a1a1a" />
</svg>

<style>
	svg {
		filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.12));
		transition: transform 0.3s cubic-bezier(0.34, 1.4, 0.64, 1);
	}
	.active {
		transform: scale(1.1);
		filter: drop-shadow(0 3px 8px rgba(88, 196, 220, 0.4));
	}
</style>
