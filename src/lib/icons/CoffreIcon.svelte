<script lang="ts">
	interface Props {
		active?: boolean;
		size?: number;
	}
	let { active = false, size = 26 }: Props = $props();
</script>

<svg width={size} height={size} viewBox="-24 -24 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class:active>
	<defs>
		<radialGradient id="fi-petal" cx="0" cy="-10" r="20">
			<stop offset="0%" stop-color="#FCD3E0" />
			<stop offset="70%" stop-color="#F2A0B8" />
			<stop offset="100%" stop-color="#E8607A" />
		</radialGradient>
		<radialGradient id="fi-core" cx="0" cy="0" r="8">
			<stop offset="0%" stop-color="#FFF4C4" />
			<stop offset="100%" stop-color="#F9B96A" />
		</radialGradient>
	</defs>

	<!-- 5 pétales -->
	{#each Array(5) as _, i}
		<ellipse
			class="petal"
			cx="0"
			cy="-11"
			rx="6.5"
			ry="10"
			transform="rotate({i * 72})"
			fill="url(#fi-petal)"
			stroke="#fff"
			stroke-width="0.6"
			style:--i={i}
		/>
	{/each}

	<!-- Cœur pollen -->
	<circle cx="0" cy="0" r="4" fill="url(#fi-core)" stroke="#fff" stroke-width="0.6" />
</svg>

<style>
	svg {
		filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.12));
		transition: transform 0.3s cubic-bezier(0.34, 1.4, 0.64, 1);
	}
	.active {
		transform: scale(1.1) rotate(18deg);
		filter: drop-shadow(0 3px 8px rgba(242, 160, 184, 0.5));
	}
	.active .petal {
		animation: sway 2.5s ease-in-out infinite;
		animation-delay: calc(var(--i, 0) * 120ms);
		transform-origin: 0 0;
	}
	@keyframes sway {
		0%, 100% { opacity: 1; }
		50%      { opacity: 0.8; }
	}
</style>
