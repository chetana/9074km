<script lang="ts">
	import { onMount } from 'svelte';
	import { Clock, Smile, Heart, Hand, PawPrint, Apple, Plane, PartyPopper, Lightbulb, Shapes, Flag } from 'lucide-svelte';
	import type { EmojiCategory } from '$lib/emoji-data';

	// Panneau vertical de tous les emojis (remplace la bande horizontale de 40 favoris, que la molette
	// ne faisait pas défiler sur ordinateur). Demandé par Chetana le 24/09/2026 : se referme dès qu'un
	// emoji est choisi et au tap n'importe où ailleurs, pour ne jamais rester ouvert par oubli.
	interface Props {
		userLang: 'fr' | 'kh';
		onPick: (emoji: string) => void;
		onClose: () => void;
	}
	let { userLang, onPick, onClose }: Props = $props();

	const RECENTS_KEY = 'lys.emojiRecents';
	const RECENTS_MAX = 32;
	const ICONS = { recents: Clock, smileys: Smile, coeurs: Heart, gens: Hand, nature: PawPrint, nourriture: Apple,
		voyages: Plane, activites: PartyPopper, objets: Lightbulb, symboles: Shapes, drapeaux: Flag } as const;

	let categories = $state<EmojiCategory[]>([]);
	let favorites = $state<string[]>([]);
	let recents = $state<string[]>([]);
	let active = $state('recents');
	let panel: HTMLDivElement | undefined = $state();
	let scroller: HTMLDivElement | undefined = $state();

	const sections = $derived([
		recents.length > 0
			? { id: 'recents', label: 'Récents', labelKh: 'ថ្មីៗ', emojis: recents }
			: { id: 'recents', label: 'Favoris', labelKh: 'ចំណូលចិត្ត', emojis: favorites },
		...categories,
	]);

	// Un emoji que l'appareil ne connaît pas s'affiche en boîte grise (pas de couleur), et une séquence
	// combinée (ZWJ, drapeau) non supportée se casse en plusieurs glyphes (plus large qu'un emoji).
	function unsupported(emojis: Set<string>): Set<string> {
		const hidden = new Set<string>();
		try {
			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = 40;
			const ctx = canvas.getContext('2d', { willReadFrequently: true });
			if (!ctx) return emojis;
			ctx.font = '28px sans-serif';
			ctx.textBaseline = 'top';
			const ref = ctx.measureText('😀').width;
			for (const e of emojis) {
				ctx.clearRect(0, 0, 40, 40);
				ctx.fillText(e, 0, 0);
				const px = ctx.getImageData(0, 0, 40, 40).data;
				let colored = false;
				for (let i = 0; i < px.length && !colored; i += 4) {
					if (px[i + 3] > 0 && Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2]) > 40) colored = true;
				}
				if (!colored || ctx.measureText(e).width > ref * 1.4) hidden.add(e);
			}
		} catch {
			return emojis; // pas de canvas : on ne prend aucun risque de carré vide
		}
		return hidden;
	}

	onMount(() => {
		try { recents = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]'); } catch { recents = []; }
		// Import dynamique : les ~1 900 emojis (15 Ko) ne pèsent sur le chat qu'à la première ouverture.
		void import('$lib/emoji-data').then((m) => {
			const hidden = unsupported(m.RECENT_EMOJIS);
			categories = m.EMOJI_CATEGORIES.map((c) => ({ ...c, emojis: c.emojis.filter((e) => !hidden.has(e)) }));
			favorites = m.FAVORITE_EMOJIS;
		});

		const onOutside = (e: PointerEvent) => {
			const target = e.target as Element | null;
			// Le bouton 😊 garde son propre comportement (bascule) — sinon il fermerait puis rouvrirait.
			if (!target || panel?.contains(target) || target.closest('.emoji-toggle')) return;
			onClose();
		};
		const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
		document.addEventListener('pointerdown', onOutside, true);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('pointerdown', onOutside, true);
			document.removeEventListener('keydown', onKey);
		};
	});

	function pick(emoji: string) {
		const next = [emoji, ...recents.filter((e) => e !== emoji)].slice(0, RECENTS_MAX);
		try { localStorage.setItem(RECENTS_KEY, JSON.stringify(next)); } catch { /* navigation privée */ }
		onPick(emoji);
	}

	function jump(id: string) {
		const section = scroller?.querySelector<HTMLElement>(`[data-cat="${id}"]`);
		if (!scroller || !section) return;
		active = id;
		// Saut instantané, pas "smooth" : les catégories hors écran (content-visibility) prennent leur vraie
		// hauteur en s'affichant — pendant une animation qui les traverse, la cible bougerait en route.
		scroller.scrollTo({ top: section.offsetTop });
	}

	function onScroll() {
		if (!scroller) return;
		const y = scroller.scrollTop + 8;
		let current = 'recents';
		for (const el of scroller.querySelectorAll<HTMLElement>('[data-cat]')) {
			if (el.offsetTop <= y) current = el.dataset.cat ?? current;
		}
		active = current;
	}
</script>

<div class="emoji-panel" bind:this={panel} role="dialog" aria-label={userLang === 'kh' ? 'រើសអារម្មណ៍' : 'Choisir un emoji'}>
	<nav class="emoji-tabs" aria-label="Catégories">
		{#each sections as s (s.id)}
			{@const Icon = ICONS[s.id as keyof typeof ICONS]}
			<button
				type="button"
				class="emoji-tab"
				class:active={active === s.id}
				aria-label={userLang === 'kh' ? s.labelKh : s.label}
				title={userLang === 'kh' ? s.labelKh : s.label}
				onclick={() => jump(s.id)}
			>
				<Icon size={18} strokeWidth={1.9} />
			</button>
		{/each}
	</nav>

	<div class="emoji-scroll" bind:this={scroller} onscroll={onScroll}>
		{#each sections as s (s.id)}
			<section class="emoji-section" data-cat={s.id}>
				<h3 class="emoji-heading">
					<span lang="fr">{s.label}</span>
					<span class="sep" aria-hidden="true">·</span>
					<span lang="km">{s.labelKh}</span>
				</h3>
				<div class="emoji-grid">
					{#each s.emojis as e (e)}
						<button type="button" class="emoji-btn" onclick={() => pick(e)}>{e}</button>
					{/each}
				</div>
			</section>
		{/each}
		{#if categories.length === 0}
			<p class="emoji-loading">…</p>
		{/if}
	</div>
</div>

<style>
	.emoji-panel {
		display: flex;
		flex-direction: column;
		height: 17rem;
		background: var(--surface);
		border-top: 1px solid var(--border-soft);
		box-shadow: 0 -8px 20px -14px rgba(74, 52, 56, 0.25);
		flex-shrink: 0;
		animation: panel-in 0.2s cubic-bezier(.16, 1, .3, 1);
	}
	@keyframes panel-in {
		from { opacity: 0; transform: translateY(12px); }
		to   { opacity: 1; transform: translateY(0); }
	}

	.emoji-tabs {
		display: flex;
		padding: 0 var(--space-2);
		border-bottom: 1px solid var(--border-soft);
		flex-shrink: 0;
	}
	.emoji-tab {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 2.5rem;
		color: var(--muted-glyph);
		border-bottom: 2px solid transparent;
		transition: color 0.15s ease, border-color 0.15s ease;
	}
	.emoji-tab:hover { color: var(--text); }
	.emoji-tab.active { color: var(--accent-text); border-bottom-color: var(--accent-text); }

	.emoji-scroll {
		position: relative;
		flex: 1;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 0 var(--space-2) var(--space-3);
	}

	.emoji-section {
		/* Le rendu des catégories hors écran est différé : ~1 900 boutons d'un coup coûtent cher sur mobile. */
		content-visibility: auto;
		contain-intrinsic-size: auto 20rem;
	}
	.emoji-heading {
		display: flex;
		align-items: baseline;
		gap: 0.35rem;
		padding: var(--space-3) var(--space-2) var(--space-1);
		font-size: var(--fs-base);
		font-weight: 600;
		color: var(--muted-text);
	}
	.emoji-heading .sep { color: var(--muted-glyph); }

	.emoji-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(2.6rem, 1fr));
	}
	.emoji-btn {
		height: 2.6rem;
		font-size: 1.55rem;
		line-height: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-sm);
		transition: transform 0.12s ease, background 0.15s ease;
	}
	.emoji-btn:hover { background: var(--surface-2); }
	.emoji-btn:active { transform: scale(0.82); }

	.emoji-loading { text-align: center; color: var(--muted); padding: var(--space-4); }
</style>
