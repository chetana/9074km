<script lang="ts">
	import { Volume2, Copy, Trash2 } from 'lucide-svelte';
	import LangTag from '$lib/LangTag.svelte';

	// Menu contextuel unique au tap — remplace la colonne de 6 boutons + la rangée de
	// réactions séparée (plan de modernisation P7, 22/09/2026, maquette bubbles-states.html).
	// "Répondre/traduire" de la maquette n'existe pas comme fonctionnalité réelle de l'app — non
	// repris ici, on ne consolide que ce qui existait déjà (réagir/écouter/copier/supprimer).
	interface Props {
		align: 'left' | 'right';
		emojis: string[];
		reacted: (emoji: string) => boolean;
		canDelete: boolean;
		userLang: 'fr' | 'kh';
		onReact: (emoji: string) => void;
		onSpeak: (lang: 'fr' | 'en' | 'kh') => void;
		onCopy: () => void;
		onDelete: () => void;
		onClose: () => void;
	}
	let { align, emojis, reacted, canDelete, userLang, onReact, onSpeak, onCopy, onDelete, onClose }: Props = $props();

	// Sur le côté de la bulle (retour demandé par Chetana le 24/09/2026, comme l'ancienne colonne
	// d'actions) mais en surimpression : la bulle ne rétrécit plus pendant la sélection. Si le menu
	// déborde de la liste (bulle longue, dernière bulle près de la saisie), on le recale dedans.
	let el: HTMLDivElement | undefined = $state();
	let offset = $state('0px 0px');
	// Décalage courant hors réactivité : l'effet ne doit dépendre que de `el`, pas de ce qu'il écrit.
	let dx = 0;
	let dy = 0;
	function measure() {
		if (!el) return;
		const r = el.getBoundingClientRect();
		const left = r.left - dx, right = r.right - dx, top = r.top - dy, bottom = r.bottom - dy;
		const box = el.closest('.message-list')?.getBoundingClientRect()
			?? { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight };
		const m = 8;
		dx = left < box.left + m ? box.left + m - left : right > box.right - m ? box.right - m - right : 0;
		dy = bottom > box.bottom - m ? box.bottom - m - bottom : 0;
		if (top + dy < box.top + m) dy = box.top + m - top;
		offset = `${dx}px ${dy}px`;
	}
	// Mesure à l'ouverture puis re-mesure : fin de l'animation d'apparition (le menu est réduit
	// pendant), et défilement de la liste (le chat se recale en bas quand son contenu grandit).
	$effect(() => {
		if (!el) return;
		const node = el;
		const list = node.closest('.message-list');
		measure();
		const raf = requestAnimationFrame(measure);
		node.addEventListener('animationend', measure);
		list?.addEventListener('scroll', measure, { passive: true });
		// Fermeture au tap n'importe où ailleurs (en-tête, saisie, dock compris) — le clic sur la
		// liste seule ne couvrait pas ces zones. La bulle sélectionnée garde son propre comportement.
		const onOutside = (e: PointerEvent) => {
			const target = e.target as Element | null;
			if (!target || node.contains(target) || target.closest('.bubble.selected')) return;
			onClose();
		};
		document.addEventListener('pointerdown', onOutside, true);
		return () => {
			document.removeEventListener('pointerdown', onOutside, true);
			cancelAnimationFrame(raf);
			node.removeEventListener('animationend', measure);
			list?.removeEventListener('scroll', measure);
		};
	});
</script>

<div
	bind:this={el}
	class="bubble-menu"
	class:align-right={align === 'right'}
	style:translate={offset}
	role="menu"
	aria-label="Actions sur le message"
	onclick={(e) => e.stopPropagation()}
>
	<div class="menu-emoji-row" role="group" aria-label="Réagir">
		{#each emojis as emoji}
			<button class="menu-emoji" class:active={reacted(emoji)} type="button" onclick={() => onReact(emoji)}>{emoji}</button>
		{/each}
	</div>
	<div class="menu-listen">
		<span class="menu-listen-label"><Volume2 size={16} /> <span lang={userLang === 'kh' ? 'km' : 'fr'}>{userLang === 'kh' ? 'ស្តាប់' : 'Écouter'}</span></span>
		<div class="menu-listen-langs">
			<button class="menu-lang-btn" type="button" onclick={() => onSpeak('fr')}><LangTag lang="fr" /></button>
			<button class="menu-lang-btn" type="button" onclick={() => onSpeak('en')}><LangTag lang="en" /></button>
			<button class="menu-lang-btn" type="button" onclick={() => onSpeak('kh')}><LangTag lang="kh" /></button>
		</div>
	</div>
	<button class="menu-item" type="button" role="menuitem" onclick={onCopy}>
		<Copy size={17} /> {userLang === 'kh' ? 'ចម្លង' : 'Copier'}
	</button>
	{#if canDelete}
		<button class="menu-item danger" type="button" role="menuitem" onclick={onDelete}>
			<Trash2 size={17} /> {userLang === 'kh' ? 'លុប' : 'Supprimer'}
		</button>
	{/if}
</div>

<style>
	.bubble-menu {
		position: absolute;
		top: 0;
		left: calc(100% + 8px);
		z-index: 6;
		width: 10rem;
		transform-origin: top left;
		background: var(--surface);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-md);
		border: 1px solid var(--border-soft);
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 2px;
		opacity: 0;
		transform: scale(0.94);
		animation: menuPop 0.18s cubic-bezier(.16,1,.3,1) forwards;
	}
	.bubble-menu.align-right { left: auto; right: calc(100% + 8px); transform-origin: top right; }

	@keyframes menuPop { to { opacity: 1; transform: scale(1); } }

	.menu-emoji-row {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		justify-items: center;
		gap: 2px;
		padding: 4px 4px 8px;
		border-bottom: 1px solid var(--border-soft);
		margin-bottom: 4px;
	}
	.menu-emoji {
		width: 2.1rem;
		height: 2.1rem;
		border-radius: 50%;
		font-size: 1.05rem;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: transform 0.15s ease, background 0.2s ease;
	}
	.menu-emoji:hover, .menu-emoji.active { background: var(--raised); }
	.menu-emoji:active { transform: scale(0.9); }

	.menu-item {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		padding: 0.6rem 0.5rem;
		font-size: var(--fs-md);
		color: var(--text);
		border-radius: 0.75rem;
		text-align: left;
		transition: background 0.15s ease;
	}
	.menu-item :global(svg) { color: var(--muted-glyph); flex-shrink: 0; }
	.menu-item:hover { background: var(--raised); }
	.menu-item.danger { color: var(--accent-deep); }
	.menu-item.danger :global(svg) { color: var(--accent-deep); }

	.menu-listen { display: flex; flex-direction: column; align-items: stretch; padding: 0.4rem 0.5rem 0.5rem; border-radius: 0.75rem; gap: 0.4rem; }
	.menu-listen-label { display: flex; align-items: center; gap: 0.6rem; font-size: var(--fs-md); color: var(--text); }
	.menu-listen-label :global(svg) { color: var(--muted-glyph); flex-shrink: 0; }
	.menu-listen-langs { display: flex; justify-content: space-between; gap: 4px; }
	.menu-lang-btn {
		padding: 3px 4px;
		border-radius: var(--radius-full);
		border: 1px solid var(--border-soft);
		background: var(--raised);
		transition: background 0.15s ease;
	}
	.menu-lang-btn:hover { background: var(--accent-tint, color-mix(in srgb, var(--accent) 14%, transparent)); }
</style>
