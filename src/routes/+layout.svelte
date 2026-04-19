<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import { fade } from 'svelte/transition';
	import { auth } from '$lib/auth';
	import { checkCacheIntegrity } from '$lib/localCache';
	import { APP_VERSION } from '$lib/version';
	import Sky from '$lib/Sky.svelte';
	import HorlogeIcon from '$lib/icons/HorlogeIcon.svelte';
	import ChatIcon from '$lib/icons/ChatIcon.svelte';
	import CoffreIcon from '$lib/icons/CoffreIcon.svelte';
	import type { Component } from 'svelte';

	let { data, children } = $props();

	onMount(() => {
		checkCacheIntegrity();
		auth.init(data.user);
		// Auto-redirect silencieux si pas de session (directSignIn Google → 0 clic)
		if (!data.user) {
			window.location.href = '/api/auth/sign-in';
			return;
		}
		clockInterval = setInterval(() => (now = new Date()), 1000);
	});
	onDestroy(() => clearInterval(clockInterval));

	let now = $state(new Date());
	let clockInterval: ReturnType<typeof setInterval>;

	// Période Nouvel An Khmer : 1–20 avril (activé manuellement en avance)
	const isKhmerNewYear = $derived(() => true);

	type Tab = { path: string; Icon: Component<{ active?: boolean; size?: number }>; label: string; kh: string };
	const tabs: Tab[] = [
		{ path: '/horloge', Icon: HorlogeIcon, label: 'Horloge', kh: 'នាឡិកា' },
		{ path: '/chat',    Icon: ChatIcon,    label: 'Chat',    kh: 'ជជែក'   },
		{ path: '/coffre',  Icon: CoffreIcon,  label: 'Coffre',  kh: 'ប្រអប់'  },
	];

	const currentPath = $derived($page.url.pathname);
	const activeIndex = $derived(tabs.findIndex(t => $page.url.pathname.startsWith(t.path)));
</script>

<div class="app" class:khmer-new-year={isKhmerNewYear()}>
	<Sky />
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

	<div class="nav-dock">
		<nav class="dock-bar">
			{#each tabs as tab, i}
				{@const active = $page.url.pathname.startsWith(tab.path)}
				<button
					class="dock-tab"
					class:active
					onclick={() => goto(tab.path)}
				>
					<span class="dock-icon"><tab.Icon active={active} size={28} /></span>
					<span class="dock-label">{tab.label}</span>
					{#if active}<span class="dock-cursor">▸</span>{/if}
				</button>
			{/each}
		</nav>
		<span class="dock-version">v{APP_VERSION}</span>
	</div>
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		height: 100dvh;
		overflow: hidden;
		background: transparent;
		position: relative;
		z-index: 1;
	}

	main {
		flex: 1;
		overflow: hidden;
		min-height: 0;
		display: flex;
		flex-direction: column;
		position: relative;
		z-index: 1;
	}

	.page-wrapper {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		background: transparent;
	}

	/* ── Game-style dock ── */
	.nav-dock {
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0;
		padding: 0 var(--space-3) env(safe-area-inset-bottom, 0px);
		background: color-mix(in srgb, var(--bg) 96%, var(--accent));
		border-top: 2px solid color-mix(in srgb, var(--accent) 25%, transparent);
	}

	.dock-bar {
		display: flex;
		width: 100%;
		max-width: 28rem;
	}

	.dock-tab {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 0.6rem 0 0.25rem;
		position: relative;
		color: var(--muted);
		transition: color 0.2s;
	}

	.dock-tab.active {
		color: var(--accent);
	}

	/* Barre lumineuse au-dessus du tab actif */
	.dock-tab.active::before {
		content: '';
		position: absolute;
		top: -2px;
		left: 20%;
		right: 20%;
		height: 2px;
		background: var(--accent);
		border-radius: 0 0 2px 2px;
		box-shadow: 0 0 8px var(--accent), 0 0 20px color-mix(in srgb, var(--accent) 40%, transparent);
		animation: glow-pulse 2s ease-in-out infinite;
	}

	@keyframes glow-pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.6; }
	}

	.dock-icon {
		font-size: 1.3rem;
		line-height: 1;
		transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.dock-tab.active .dock-icon {
		transform: translateY(-2px) scale(1.1);
		filter: drop-shadow(0 2px 6px color-mix(in srgb, var(--accent) 50%, transparent));
	}

	.dock-tab:active .dock-icon {
		transform: scale(0.9);
	}

	.dock-label {
		font-size: 0.6rem;
		font-weight: 500;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		opacity: 0.4;
		transition: opacity 0.2s, font-weight 0.2s;
	}

	.dock-tab.active .dock-label {
		opacity: 1;
		font-weight: 700;
	}

	/* Curseur de sélection style RPG */
	.dock-cursor {
		position: absolute;
		left: 4px;
		top: 50%;
		transform: translateY(-50%);
		font-size: 0.6rem;
		color: var(--accent);
		animation: cursor-blink 1s step-end infinite;
		filter: drop-shadow(0 0 3px var(--accent));
	}

	@keyframes cursor-blink {
		0%, 100% { opacity: 1; }
		50% { opacity: 0; }
	}

	/* Version badge */
	.dock-version {
		font-size: 0.65rem;
		font-family: 'Courier New', monospace;
		color: color-mix(in srgb, var(--accent) 50%, var(--muted));
		opacity: 0.7;
		letter-spacing: 0.08em;
		padding-bottom: 3px;
		user-select: none;
	}
</style>
