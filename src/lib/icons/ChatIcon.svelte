<script lang="ts">
	interface Props {
		active?: boolean;
		size?: number;
	}
	let { active = false, size = 26 }: Props = $props();
</script>

<svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class:active>
	<defs>
		<linearGradient id="ci-bubble" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0%" stop-color="#F8BAD0" />
			<stop offset="100%" stop-color="#E8607A" />
		</linearGradient>
		<linearGradient id="ci-heart" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0%" stop-color="#FFE8A0" />
			<stop offset="100%" stop-color="#F49D6B" />
		</linearGradient>
	</defs>

	<!-- Bulle speech -->
	<path
		d="M9 20 Q9 8 24 8 Q39 8 39 20 Q39 32 24 32 L17 32 L11 38 L12 30 Q9 26 9 20 Z"
		fill="url(#ci-bubble)"
		stroke="#fff"
		stroke-width="1.5"
		stroke-linejoin="round"
	/>

	<!-- Cœur au centre de la bulle -->
	<path
		class="heart"
		d="M24 27 L17 20 Q15 17 17 14.5 Q19.5 12 22 15 L24 17.5 L26 15 Q28.5 12 31 14.5 Q33 17 31 20 Z"
		fill="url(#ci-heart)"
		stroke="#fff"
		stroke-width="0.8"
		stroke-linejoin="round"
	/>
</svg>

<style>
	svg {
		filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.12));
		transition: transform 0.3s cubic-bezier(0.34, 1.4, 0.64, 1);
	}
	.active {
		transform: scale(1.1);
		filter: drop-shadow(0 3px 8px rgba(232, 96, 122, 0.45));
	}
	.active .heart {
		animation: heartbeat 1.2s ease-in-out infinite;
		transform-origin: 24px 22px;
		transform-box: fill-box;
	}
	@keyframes heartbeat {
		0%, 100% { transform: scale(1); }
		30%      { transform: scale(1.15); }
		60%      { transform: scale(0.95); }
	}
</style>
