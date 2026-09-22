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
	import { Clock, MessageCircle, Vault, BookOpen } from 'lucide-svelte';

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

		// Vérification de version au lancement + toutes les 5 min + au retour au premier plan.
		// Restauré le 22/09/2026 : la limitation "une seule fois au lancement" datait de l'ère
		// serverless (un ping périodique empêchait le container de scale-to-zero, ~16-17 min
		// d'inactivité requis). Depuis la bascule sur chetbox (VM dédiée, coût fixe), ce ping ne
		// coûte plus rien — un onglet/PWA laissé ouvert reçoit la mise à jour en direct au lieu
		// d'attendre le prochain lancement (voir la confusion du 22/09 : badge de version qui
		// semblait "invisible" alors que le client tournait juste sur un bundle jamais rafraîchi).
		void checkVersion();
		versionInterval = setInterval(() => { if (!document.hidden) void checkVersion(); }, 5 * 60_000);
		const onVisible = () => { if (!document.hidden) void checkVersion(); };
		document.addEventListener('visibilitychange', onVisible);
		cleanupVersionCheck = () => document.removeEventListener('visibilitychange', onVisible);
	});
	onDestroy(() => {
		clearInterval(clockInterval);
		clearInterval(versionInterval);
		cleanupVersionCheck?.();
	});

	let now = $state(new Date());
	let clockInterval: ReturnType<typeof setInterval>;
	let versionInterval: ReturnType<typeof setInterval>;
	let cleanupVersionCheck: (() => void) | undefined;

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

	type Tab = { path: string; Icon: typeof Clock; label: string; kh: string };
	const tabs: Tab[] = [
		{ path: '/horloge',   Icon: Clock,         label: 'Horloge',   kh: 'នាឡិកា' },
		{ path: '/chat',      Icon: MessageCircle, label: 'Chat',      kh: 'ជជែក'   },
		{ path: '/coffre',    Icon: Vault,         label: 'Coffre',    kh: 'ប្រអប់'  },
		{ path: '/apprendre', Icon: BookOpen,      label: 'Apprendre', kh: 'រៀន'    },
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
	<div class="nav-dock glass">
		<nav class="dock-bar">
			{#each tabs as tab, i}
				{@const active = $page.url.pathname.startsWith(tab.path)}
				<button
					class="dock-tab"
					class:active
					onclick={() => goto(tab.path)}
				>
					<span class="dock-icon" style="position:relative">
						<tab.Icon size={24} strokeWidth={1.75} />
						{#if tab.path === '/chat' && !active && $unreadCount > 0}
							<span class="unread-badge">{$unreadCount > 9 ? '9+' : $unreadCount}</span>
						{/if}
					</span>
					<span class="dock-label">
						{tab.label}
						<span class="dock-label-kh" lang="km">{tab.kh}</span>
					</span>
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
		/* .glass (app.css) fournit background+blur+border-bottom — un dock en bas d'écran a besoin
		   d'une bordure en HAUT, pas en bas : on l'annule et la repose explicitement ici. */
		border-bottom: none;
		border-top: 1px solid var(--border-soft);
		box-shadow: 0 -6px 16px -12px rgba(74, 52, 56, 0.15);
		/* Sans position+z-index, ce bloc non positionné peignait SOUS .sky (fixed, z-index:0)
		   dans l'ordre d'empilement CSS — même piège que header/main, corrigé partout sauf ici :
		   tout élément sombre posé dessus (le badge de version) se retrouvait délavé. */
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
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.05rem;
		font-size: 0.6rem;
		font-weight: 500;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--muted);
		transition: color 0.2s, font-weight 0.2s;
	}

	.dock-label-kh {
		font-size: 0.65rem;
		text-transform: none;
		letter-spacing: normal;
		color: inherit;
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

	/* Version badge — mono discret : la pastille sticker (.dock-tab.active .dock-icon) est
	   l'unique indicateur d'état actif du dock, ce badge n'a plus besoin d'attirer l'œil. */
	.dock-version {
		font-size: 0.6rem;
		font-family: 'Courier New', monospace;
		font-weight: 600;
		color: var(--muted-glyph);
		margin-bottom: 4px;
		letter-spacing: 0.06em;
		user-select: none;
	}
</style>
