<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
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

	const tabs = $derived([
		{ path: '/horloge', icon: clockIcon(), label: 'Horloge', kh: 'នាឡិកា' },
		{ path: '/coffre',  icon: '🗃',         label: 'Coffre',  kh: 'ប្រអប់' }
	]);

	let { children } = $props();
</script>

<div class="app">
	<main>
		{@render children()}
	</main>

	<nav class="bottom-nav">
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
	}

	.bottom-nav {
		display: flex;
		background: var(--card);
		border-top: 1px solid var(--border);
		padding-bottom: env(safe-area-inset-bottom);
		flex-shrink: 0;
	}

	.tab {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-2) var(--space-2);
		color: var(--muted);
		transition: color 0.2s;
	}

	.tab.active {
		color: var(--accent);
	}

	.icon {
		font-size: var(--fs-3xl);
		line-height: 1;
	}

	.label {
		font-size: var(--fs-xs);
		letter-spacing: 0.3px;
	}
</style>
