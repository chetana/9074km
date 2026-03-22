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
		{ path: '/coffre',  icon: '🗃',         label: 'Coffre',  kh: 'ប្រអប់'  },
		{ path: '/chat',    icon: '💬',         label: 'Chat',    kh: 'ជជែក'   }
	]);

	const currentPath = $derived($page.url.pathname);
	const activeIndex = $derived(tabs.findIndex(t => $page.url.pathname.startsWith(t.path)));

	let { children } = $props();
</script>

<div class="app" class:khmer-new-year={isKhmerNewYear()}>
	{#if isKhmerNewYear()}
		<div class="water-glow" aria-hidden="true"></div>
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

	<nav class="bottom-nav" style="--tab-i: {activeIndex < 0 ? 2 : activeIndex}">
		<div class="nav-indicator" aria-hidden="true"></div>
		{#each tabs as tab}
			{@const active = $page.url.pathname.startsWith(tab.path)}
			<button
				class="tab"
				class:active
				onclick={() => goto(tab.path)}
			>
				<span class="icon">{tab.icon}</span>
				<span class="label">{tab.label} · {tab.kh}</span>
			</button>
		{/each}
	</nav>
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

	.bottom-nav {
		display: flex;
		position: relative;
		background: color-mix(in srgb, var(--card) 92%, transparent);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border-top: 1px solid color-mix(in srgb, var(--accent) 12%, transparent);
		padding-bottom: env(safe-area-inset-bottom);
		flex-shrink: 0;
	}

	/* Indicateur glissant */
	.nav-indicator {
		position: absolute;
		top: 6px;
		/* centre du tab i : i * 33.33% + 16.67% */
		left: calc(var(--tab-i, 2) * 100% / 3 + 100% / 6 - 18px);
		width: 36px;
		height: 3px;
		background: linear-gradient(90deg, var(--accent), var(--accent-warm));
		border-radius: 0 0 3px 3px;
		transition: left 0.38s cubic-bezier(0.34, 1.4, 0.64, 1);
		pointer-events: none;
		box-shadow: 0 0 8px color-mix(in srgb, var(--accent) 50%, transparent);
	}

	.tab {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-2) var(--space-2);
		color: var(--muted);
		transition: color 0.25s, background 0.25s, transform 0.12s;
		border-radius: var(--radius-md);
		margin: var(--space-1) var(--space-2);
	}

	.tab:active {
		transform: scale(0.92);
	}

	.tab.active {
		color: var(--accent);
		background: color-mix(in srgb, var(--accent) 10%, transparent);
	}

	.tab:not(.active):hover {
		color: var(--text);
		background: color-mix(in srgb, var(--accent) 6%, transparent);
	}

	.icon {
		font-size: var(--fs-3xl);
		line-height: 1;
		transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.tab.active .icon {
		transform: scale(1.18);
	}

	.label {
		font-size: var(--fs-xs);
		letter-spacing: 0.3px;
		font-weight: 500;
		transition: font-weight 0.2s, color 0.25s;
	}

	.tab.active .label {
		font-weight: 700;
	}
</style>
