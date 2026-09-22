<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import { fade } from 'svelte/transition';
	import { auth } from '$lib/auth';
	import { checkCacheIntegrity } from '$lib/localCache';
	import { APP_VERSION } from '$lib/version';
	import { unreadCount } from '$lib/unreadStore';
	import Sky from '$lib/Sky.svelte';
	import HorlogeIcon from '$lib/icons/HorlogeIcon.svelte';
	import ChatIcon from '$lib/icons/ChatIcon.svelte';
	import CoffreIcon from '$lib/icons/CoffreIcon.svelte';
	import ApprendreIcon from '$lib/icons/ApprendreIcon.svelte';
	import type { Component } from 'svelte';

	let { data, children } = $props();

	onMount(() => {
		checkCacheIntegrity();
		auth.init(data.user);
		// AI-DEV: Auto-redirect silencieux si pas de session (directSignIn Google → 0 clic).
		// EXCEPTION : liens partagés coffre (?y=&m=&d=&f=) — la page gère elle-même l'affichage
		// sans connexion (preview publique). Ne pas rediriger dans ce cas.
		if (!data.user) {
			const p = new URLSearchParams(window.location.search);
			const isCoffreShare = window.location.pathname === '/coffre' && p.has('f');
			const isPublicGallery = window.location.pathname.startsWith('/fiancailles');
			if (!isCoffreShare && !isPublicGallery) {
				window.location.href = '/api/auth/sign-in';
				return;
			}
		}
		clockInterval = setInterval(() => (now = new Date()), 1000);

		// AI-DEV: Vérification de version UNE SEULE FOIS au lancement (plus de setInterval 5min
		// ni de check sur visibilitychange). Avant : un onglet/PWA laissé ouvert pingait /api/version
		// toutes les 5 min, en dessous du seuil d'inactivité Scaleway (~16-17 min) → le container ne
		// scale-to-zero JAMAIS (mesuré : 1440/1440 min actives/jour, peu importe l'usage réel), et
		// chaque ping réveillait aussi la Serverless SQL (lastLoginAt). Contrepartie acceptée : une
		// fenêtre restée ouverte ne recevra la mise à jour qu'au prochain lancement, pas en direct.
		void checkVersion();
	});
	onDestroy(() => {
		clearInterval(clockInterval);
	});

	let now = $state(new Date());
	let clockInterval: ReturnType<typeof setInterval>;

	async function checkVersion() {
		try {
			const res = await fetch('/api/version', { cache: 'no-store' });
			if (!res.ok) return;
			const { version } = await res.json() as { version?: string };
			if (!version || version === APP_VERSION) return;

			// Garde-fou anti-boucle : ne recharger qu'une fois par version serveur détectée.
			if (sessionStorage.getItem('updatedTo') === version) return;
			sessionStorage.setItem('updatedTo', version);

			// Met à jour le service worker (récupère le nouveau bundle) avant de recharger.
			try {
				const reg = await navigator.serviceWorker?.getRegistration();
				if (reg) {
					await reg.update();
					if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
				}
			} catch { /* ignore */ }

			window.location.reload();
		} catch { /* hors-ligne ou erreur réseau → on ignore */ }
	}

	type Tab = { path: string; Icon: Component<{ active?: boolean; size?: number }>; label: string; kh: string };
	const tabs: Tab[] = [
		{ path: '/horloge',   Icon: HorlogeIcon,   label: 'Horloge',   kh: 'នាឡិកា' },
		{ path: '/chat',      Icon: ChatIcon,      label: 'Chat',      kh: 'ជជែក'   },
		{ path: '/coffre',    Icon: CoffreIcon,    label: 'Coffre',    kh: 'ប្រអប់'  },
		{ path: '/apprendre', Icon: ApprendreIcon, label: 'Apprendre', kh: 'រៀន'    },
	];

	const currentPath = $derived($page.url.pathname);
	const activeIndex = $derived(tabs.findIndex(t => $page.url.pathname.startsWith(t.path)));
	const isGallery = $derived($page.url.pathname.startsWith('/fiancailles'));
</script>

<div class="app">
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

	{#if !isGallery}
	<div class="nav-dock">
		<nav class="dock-bar">
			{#each tabs as tab, i}
				{@const active = $page.url.pathname.startsWith(tab.path)}
				<button
					class="dock-tab"
					class:active
					onclick={() => goto(tab.path)}
				>
					<span class="dock-icon" style="position:relative">
						<tab.Icon active={active} size={28} />
						{#if tab.path === '/chat' && !active && $unreadCount > 0}
							<span class="unread-badge">{$unreadCount > 9 ? '9+' : $unreadCount}</span>
						{/if}
					</span>
					<span class="dock-label">{tab.label}</span>
					{#if active}<span class="dock-cursor">▸</span>{/if}
				</button>
			{/each}
		</nav>
		<span class="dock-version">v{APP_VERSION}</span>
	</div>
	{/if}
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
		padding: 0 var(--space-3) calc(env(safe-area-inset-bottom, 0px) + 8px);
		background: color-mix(in srgb, var(--bg) 88%, transparent);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border-top: 1px solid color-mix(in srgb, var(--accent) 18%, transparent);
		box-shadow: 0 -6px 16px -12px rgba(74, 52, 56, 0.15);
		/* Sans position+z-index, ce bloc non positionné peignait SOUS .sky
		   (fixed, z-index:0, blend screen) dans l'ordre d'empilement CSS —
		   même piège que header/main, corrigé partout sauf ici : tout élément
		   sombre posé dessus (le badge de version) se retrouvait délavé par
		   le blend au lieu d'être simplement invisible. */
		position: relative;
		z-index: 1;
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

	.dock-icon {
		font-size: 1.3rem;
		line-height: 1;
		display: flex;
		transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease, box-shadow 0.2s ease;
	}

	/* Pastille "autocollant" pleine derrière l'icône active, plutôt qu'une
	   barre lumineuse au-dessus — esprit papier découpé/sticker (maquette). */
	.dock-tab.active .dock-icon {
		color: var(--on-accent);
		background: linear-gradient(150deg, var(--accent), var(--accent-warm));
		border-radius: 14px;
		padding: 0.3rem 0.7rem;
		box-shadow: var(--shadow-accent);
		transform: translateY(-2px) scale(1.06);
	}

	.dock-tab:active .dock-icon {
		transform: scale(0.9);
	}

	/* Couleur pleine plutôt qu'opacité réduite : une teinte moins saturée qui
	   reste lisible (≥4.5:1), pas un texte à moitié transparent — l'opacité
	   comme seul moyen d'atténuer un libellé finit toujours par casser le
	   contraste selon le fond. */
	.dock-label {
		font-size: 0.6rem;
		font-weight: 500;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--muted);
		transition: color 0.2s, font-weight 0.2s;
	}

	.dock-tab.active .dock-label {
		font-family: var(--font-display);
		color: var(--accent-deep, var(--accent-warm));
		font-weight: 600;
	}

	.unread-badge {
		position: absolute;
		top: -4px;
		right: -4px;
		min-width: 16px;
		height: 16px;
		padding: 0 3px;
		border-radius: 8px;
		background: var(--accent-deep, var(--accent-warm));
		color: #fff;
		font-size: 0.6rem;
		font-weight: 700;
		line-height: 16px;
		text-align: center;
		pointer-events: none;
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

	/* Version badge — fond plein foncé, pas un ton clair sur clair : le
	   premier essai (fond blanc/bordure rose pâle à 10px) était quasi
	   invisible en vrai malgré un contraste "mesurable" correct, vérifié
	   via capture d'écran réelle. */
	.dock-version {
		font-size: 0.7rem;
		font-family: 'Courier New', monospace;
		font-weight: 700;
		color: #FFF8F0;
		background: var(--text);
		border-radius: var(--radius-full);
		padding: 2px 10px 3px;
		margin-bottom: 4px;
		letter-spacing: 0.08em;
		user-select: none;
	}
</style>
