<script lang="ts">
	import { Volume2, Copy, Trash2 } from 'lucide-svelte';
	import LangTag from '$lib/LangTag.svelte';

	// Menu contextuel unique au long-press — remplace la colonne de 6 boutons + la rangée de
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
	}
	let { align, emojis, reacted, canDelete, userLang, onReact, onSpeak, onCopy, onDelete }: Props = $props();
</script>

<div class="bubble-menu" class:align-right={align === 'right'} role="menu" aria-label="Actions sur le message">
	<div class="menu-emoji-row" role="group" aria-label="Réagir">
		{#each emojis as emoji}
			<button class="menu-emoji" class:active={reacted(emoji)} type="button" onclick={() => onReact(emoji)}>{emoji}</button>
		{/each}
	</div>
	<div class="menu-listen">
		<span class="menu-listen-label"><Volume2 size={17} /> {userLang === 'kh' ? 'ស្តាប់' : 'Écouter'}</span>
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
		top: calc(100% + 6px);
		left: 0;
		z-index: 6;
		width: max-content;
		min-width: 13rem;
		max-width: 82vw;
		background: var(--surface);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-md);
		border: 1px solid var(--border-soft);
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 2px;
		opacity: 0;
		transform: translateY(-6px) scale(0.97);
		animation: menuPop 0.18s cubic-bezier(.16,1,.3,1) forwards;
	}
	.bubble-menu.align-right { left: auto; right: 0; }

	@keyframes menuPop { to { opacity: 1; transform: translateY(0) scale(1); } }

	.menu-emoji-row {
		display: flex;
		justify-content: space-between;
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

	.menu-listen { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem; border-radius: 0.75rem; gap: 0.5rem; }
	.menu-listen-label { display: flex; align-items: center; gap: 0.6rem; font-size: var(--fs-md); color: var(--text); }
	.menu-listen-label :global(svg) { color: var(--muted-glyph); flex-shrink: 0; }
	.menu-listen-langs { display: flex; gap: 4px; }
	.menu-lang-btn {
		padding: 3px 4px;
		border-radius: var(--radius-full);
		border: 1px solid var(--border-soft);
		background: var(--raised);
		transition: background 0.15s ease;
	}
	.menu-lang-btn:hover { background: var(--accent-tint, color-mix(in srgb, var(--accent) 14%, transparent)); }
</style>
