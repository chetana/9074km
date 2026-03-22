<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import { fade } from 'svelte/transition';
	import { auth } from '$lib/auth';


	onMount(() => {
		auth.init();
		clockInterval = setInterval(() => (now = new Date()), 1000);
	});
	onDestroy(() => clearInterval(clockInterval));

	let now = $state(new Date());
	let clockInterval: ReturnType<typeof setInterval>;

	// Emojis horloge : indices 0-11 = heures pleines 1h-12h, 12-23 = demi-heures 1h30-12h30
	const CLOCK_FULL  = ['🕐','🕑','🕒','🕓','🕔','🕕','🕖','🕗','🕘','🕙','🕚','🕛'];
	const CLOCK_HALF  = ['🕜','🕝','🕞','🕟','🕠','🕡','🕢','🕣','🕤','🕥','🕦','🕧'];

	const clockIcon = $derived(() => {
		const h = now.getHours() % 12; // 0-11
		const m = now.getMinutes();
		return m >= 30 ? CLOCK_HALF[h] : CLOCK_FULL[h];
	});

	// Période Nouvel An Khmer : 1–20 avril (activé manuellement en avance)
	const isKhmerNewYear = $derived(() => true);

	const tabs = $derived([
		{ path: '/horloge', icon: clockIcon(), label: 'Horloge', kh: 'នាឡិកា' },
		{ path: '/chat',    icon: '💬',         label: 'Chat',    kh: 'ជជែក'   },
		{ path: '/coffre',  icon: '🗃',         label: 'Coffre',  kh: 'ប្រអប់'  },
	]);

	const currentPath = $derived($page.url.pathname);
	const activeIndex = $derived(tabs.findIndex(t => $page.url.pathname.startsWith(t.path)));

	let { children } = $props();
</script>

<div class="app" class:khmer-new-year={isKhmerNewYear()}>
	{#if isKhmerNewYear()}
		<div class="water-bg" aria-hidden="true">
			<div class="water-blob-3"></div>
			<div class="water-shimmer"></div>
		</div>
	{/if}
	<main>
		{#key currentPath}
			<div
				class="page-wrapper"
				in:fade={{ duration: 180, delay: 40 }}
				out:fade={{ duration: 120 }}
			>
				{@render children()}
			</div>
		{/key}
	</main>

	<div class="nav-wrapper">
		<nav class="bottom-nav">
			{#each tabs as tab, i}
				{@const active = $page.url.pathname.startsWith(tab.path)}
				{@const offset = i - (activeIndex < 0 ? 2 : activeIndex)}
				<button
					class="tab"
					class:active
					style="--offset: {offset}"
					onclick={() => goto(tab.path)}
				>
					<span class="icon">{tab.icon}</span>
					<span class="label">{tab.label} · {tab.kh}</span>
				</button>
			{/each}
		</nav>
	</div>
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		height: 100dvh;
		overflow: hidden;
	}

	main {
		flex: 1;
		overflow: hidden;
		min-height: 0;
		display: flex;
		flex-direction: column;
		position: relative;
	}

	.page-wrapper {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		background: var(--bg);
	}

	/* ── Floating dock wrapper — texture glaçon ── */
	.nav-wrapper {
		position: relative;
		flex-shrink: 0;
		display: flex;
		justify-content: center;
		padding: 0.75rem var(--space-4) calc(0.875rem + env(safe-area-inset-bottom, 0px));
		/* Frosted ice glass */
		backdrop-filter: blur(22px) saturate(1.5) brightness(1.06);
		-webkit-backdrop-filter: blur(22px) saturate(1.5) brightness(1.06);
		/* Facettes de glace — dégradés croisés */
		background:
			linear-gradient(128deg,
				rgba(255,255,255,0.10) 0%, transparent 32%,
				rgba(200,240,255,0.07) 52%, transparent 72%,
				rgba(255,255,255,0.05) 100%),
			repeating-linear-gradient(112deg,
				transparent, transparent 11px,
				rgba(180,235,255,0.055) 11px, rgba(180,235,255,0.055) 12px),
			repeating-linear-gradient(22deg,
				transparent, transparent 16px,
				rgba(160,220,255,0.04) 16px, rgba(160,220,255,0.04) 17px),
			linear-gradient(to bottom,
				transparent 0%,
				color-mix(in srgb, var(--accent) 10%, var(--bg)) 100%);
		border-top: 1px solid rgba(200, 240, 255, 0.14);
	}

	/* Grain — texture de surface glaçon */
	.nav-wrapper::before {
		content: '';
		position: absolute;
		inset: 0;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.055'/%3E%3C/svg%3E");
		pointer-events: none;
		z-index: 0;
	}

	/* ── Floating pill nav ── */
	.bottom-nav {
		display: flex;
		gap: var(--space-1);
		padding: 0.45rem 0.5rem;
		background: color-mix(in srgb, var(--card) 88%, transparent);
		backdrop-filter: blur(28px);
		-webkit-backdrop-filter: blur(28px);
		border: 1px solid color-mix(in srgb, var(--accent) 18%, transparent);
		border-radius: 2rem;
		box-shadow:
			0 10px 36px rgba(0, 0, 0, 0.38),
			0 2px 8px rgba(0, 0, 0, 0.22),
			inset 0 1px 0 rgba(255, 255, 255, 0.07);
		perspective: 560px;
	}

	/* ── Tabs 3D ── */
	.tab {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 3px;
		padding: 0.5rem 1.25rem;
		border-radius: 1.5rem;
		color: var(--muted);
		min-width: 5rem;
		transform:
			rotateY(calc(var(--offset, 0) * -20deg))
			translateZ(-5px);
		transition:
			transform 0.44s cubic-bezier(0.34, 1.2, 0.64, 1),
			color 0.3s,
			background 0.3s;
	}

	.tab.active {
		color: var(--accent);
		background: color-mix(in srgb, var(--accent) 13%, transparent);
		transform: rotateY(0deg) translateZ(22px) scale(1.03);
	}

	.tab:not(.active):hover {
		color: var(--text);
		background: color-mix(in srgb, var(--accent) 6%, transparent);
	}

	.tab:active {
		transform:
			rotateY(calc(var(--offset, 0) * -20deg))
			translateZ(-5px)
			scale(0.91);
	}

	.tab.active:active {
		transform: rotateY(0) translateZ(22px) scale(0.95);
	}

	/* ── Icône & label ── */
	.icon {
		font-size: var(--fs-3xl);
		line-height: 1;
		transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.tab.active .icon {
		transform: scale(1.14);
	}

	.label {
		font-size: 0.625rem;
		font-weight: 500;
		letter-spacing: 0.2px;
		white-space: nowrap;
		opacity: 0.45;
		transition: opacity 0.25s, font-weight 0.2s;
	}

	.tab.active .label {
		opacity: 1;
		font-weight: 700;
	}
</style>
