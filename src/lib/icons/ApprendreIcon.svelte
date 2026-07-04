<script lang="ts">
	interface Props {
		active?: boolean;
		size?: number;
	}
	let { active = false, size = 26 }: Props = $props();
</script>

<svg width={size} height={size} viewBox="-24 -24 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class:active>
	<defs>
		<linearGradient id="ap-cover" x1="-14" y1="-16" x2="14" y2="16">
			<stop offset="0%" stop-color="#7BD0E0" />
			<stop offset="100%" stop-color="#58A8DC" />
		</linearGradient>
		<radialGradient id="ap-spark" cx="0" cy="0" r="6">
			<stop offset="0%" stop-color="#FFF4C4" />
			<stop offset="100%" stop-color="#F9C96A" />
		</radialGradient>
	</defs>

	<!-- Livre ouvert -->
	<path
		class="page"
		d="M 0 -12 C -5 -15, -13 -14, -16 -11 L -16 12 C -13 9, -5 8, 0 11 Z"
		fill="url(#ap-cover)" stroke="#fff" stroke-width="1" stroke-linejoin="round"
	/>
	<path
		class="page"
		d="M 0 -12 C 5 -15, 13 -14, 16 -11 L 16 12 C 13 9, 5 8, 0 11 Z"
		fill="url(#ap-cover)" stroke="#fff" stroke-width="1" stroke-linejoin="round"
	/>
	<!-- Reliure -->
	<line x1="0" y1="-12" x2="0" y2="11" stroke="#fff" stroke-width="1.2" opacity="0.85" />

	<!-- Étincelle de savoir -->
	<g class="spark">
		<circle cx="11" cy="-15" r="2.6" fill="url(#ap-spark)" />
		<path d="M 11 -20 L 11.7 -16.5 L 11 -15 L 10.3 -16.5 Z" fill="#FFF4C4" opacity="0.9" />
	</g>
</svg>

<style>
	svg {
		filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.12));
		transition: transform 0.3s cubic-bezier(0.34, 1.4, 0.64, 1);
	}
	.active {
		transform: scale(1.1);
		filter: drop-shadow(0 3px 8px rgba(88, 168, 220, 0.5));
	}
	.active .page {
		animation: flip-hint 2.6s ease-in-out infinite;
		transform-origin: 0 0;
	}
	.active .spark {
		animation: twinkle 1.8s ease-in-out infinite;
		transform-origin: 11px -15px;
	}
	@keyframes flip-hint {
		0%, 100% { opacity: 1; }
		50%      { opacity: 0.82; }
	}
	@keyframes twinkle {
		0%, 100% { opacity: 0.6; transform: scale(0.85); }
		50%      { opacity: 1;   transform: scale(1.15); }
	}
</style>
