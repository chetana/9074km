<script lang="ts">
	import Flag from '$lib/Flag.svelte';
	import LangTag from '$lib/LangTag.svelte';
	import BubbleMenu from './BubbleMenu.svelte';
	import { Mic as MicIcon, ChevronDown } from 'lucide-svelte';
	import type { ChatMessage } from '$lib/api';

	interface Props {
		msg: ChatMessage;
		isMine: boolean;
		isSelected: boolean;
		isPending: boolean;
		isSpeaking: boolean;
		userLang: 'fr' | 'kh';
		imageUrl?: string;
		isFirstInGroup: boolean;
		isLastInGroup: boolean;
		reactionEmojis: string[];
		reacted: (emoji: string) => boolean;
		onSelect: () => void;
		onDeselect: () => void;
		onReact: (emoji: string) => void;
		onCopy: () => void;
		onSpeak: (lang: 'fr' | 'en' | 'kh') => void;
		onDelete: () => void;
		fmtTime: (ts: string) => string;
		fmtTimeKH: (ts: string) => string;
		isChet: (name: string) => boolean;
	}

	let {
		msg, isMine, isSelected, isPending, isSpeaking, userLang, imageUrl,
		isFirstInGroup, isLastInGroup, reactionEmojis, reacted,
		onSelect, onDeselect, onReact, onCopy, onSpeak, onDelete,
		fmtTime, fmtTimeKH, isChet
	}: Props = $props();

	const legacy = $derived((msg as unknown as { translation?: string }).translation);
	const aLang = $derived((msg.lang as 'fr' | 'en' | 'kh' | undefined) ?? (isChet(msg.author) ? 'fr' : 'kh'));
	const htmlLang = (l: 'fr' | 'en' | 'kh') => (l === 'kh' ? 'km' : l);

	// Ordre des traductions secondaires : la langue du lecteur d'abord (khmer traité comme
	// langue première, pas systématiquement relégué en dernier) — voir CLAUDE.md § Bilinguisme.
	const otherTranslations = $derived(
		(['fr', 'en', 'kh'] as const)
			.filter((l) => l !== aLang && msg[l])
			.sort((a, b) => (a === userLang ? -1 : b === userLang ? 1 : 0))
	);

	// Traductions repliées par défaut — révélées au tap plutôt que toutes empilées visuellement
	// (plan de modernisation P7, maquette bubbles-states.html, section 1).
	let showTranslations = $state(false);
	const toggleLangLabel = (l: 'fr' | 'en' | 'kh') => (l === 'kh' ? 'ខ្មែរ' : l.toUpperCase());

	// Menu contextuel unique au tap, remplace la colonne de 6 boutons + la rangée de réactions
	// séparée (section 3 de la maquette). D'abord fait au long-press (~450ms) comme dans la
	// maquette, repassé au tap direct sur demande de Chetana le 23/09 : un tap simple ne faisait
	// rien d'autre avant, donc pas de conflit avec un futur usage du tap court, et c'est plus
	// intuitif à l'usage réel.
	function onBubbleClick(e: MouseEvent) {
		e.stopPropagation();
		onSelect();
	}
</script>

<div class="bubble-wrapper" class:mine={isMine} class:is-pending={isPending || isSpeaking}>
	{#if !isMine && isFirstInGroup}
		<span class="author-label">{msg.author}</span>
	{/if}
	<div class="bubble-anchor">
		<div
			class="bubble"
			class:mine={isMine}
			class:tail={isLastInGroup}
			class:selected={isSelected}
			onclick={onBubbleClick}
			onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
			role="button"
			tabindex="0"
			aria-haspopup="true"
			aria-expanded={isSelected}
		>
			{#if isPending || isSpeaking}
				<div class="magic-loader">
					<span class="magic-sparkle">✨</span>
					<span>{isSpeaking ? (userLang === 'kh' ? 'កំពុងអាន...' : 'Lecture...') : (userLang === 'kh' ? 'កំពុងកែប្រែ...' : 'Traduction...')}</span>
				</div>
			{/if}
			{#if msg.source === 'audio'}<span class="source-badge"><MicIcon size={12} /></span>{/if}
			{#if msg.image}
				{#if imageUrl}
					<img class="bubble-img" src={imageUrl} alt="" loading="lazy" />
				{:else}
					<div class="bubble-img-loading">⏳</div>
				{/if}
			{/if}
			{#if msg.fr || msg.en || msg.kh}
				<div class="bubble-i18n">
					<p class="bubble-translation first" lang={htmlLang(aLang)}><span class="transl-tag"><LangTag lang={aLang} /></span>{msg.text}</p>
					{#if otherTranslations.length > 0}
						<button
							class="i18n-toggle"
							type="button"
							aria-expanded={showTranslations}
							onclick={(e) => { e.stopPropagation(); showTranslations = !showTranslations; }}
						>
							{#if showTranslations}
								{userLang === 'kh' ? 'លាក់ការបកប្រែ' : 'Masquer les traductions'}
							{:else}
								{userLang === 'kh' ? 'មើលជា' : 'Voir en'} {otherTranslations.map(toggleLangLabel).join(' · ')}
							{/if}
							<ChevronDown size={11} class="chev" style={showTranslations ? 'transform:rotate(180deg)' : ''} />
						</button>
						{#if showTranslations}
							<div class="i18n-more">
								{#each otherTranslations as l (l)}
									<p class="bubble-translation" lang={htmlLang(l)}><span class="transl-tag"><LangTag lang={l} /></span>{msg[l]}</p>
								{/each}
							</div>
						{/if}
					{/if}
				</div>
			{:else}
				<p class="bubble-text">{msg.text}</p>
				{#if legacy}
					<div class="bubble-i18n">
						<p class="bubble-translation">{legacy}</p>
					</div>
				{/if}
			{/if}
			{#if isLastInGroup}
				<span class="bubble-time"><Flag lang="fr" size="sm" /> {fmtTime(msg.ts)} · <Flag lang="kh" size="sm" /> {fmtTimeKH(msg.ts)}</span>
			{/if}
		</div>

		{#if isSelected}
			<BubbleMenu
				align={isMine ? 'right' : 'left'}
				emojis={reactionEmojis}
				{reacted}
				canDelete={isMine}
				{userLang}
				{onReact}
				{onSpeak}
				{onCopy}
				onDelete={() => { onDelete(); onDeselect(); }}
			/>
		{/if}
	</div>
</div>

<style>
	.bubble-wrapper {
		display: flex;
		flex-direction: column;
		width: 100%;
	}
	.bubble-wrapper.mine { align-items: flex-end; }
	.bubble-wrapper:not(.mine) { align-items: flex-start; }

	.bubble-wrapper.is-pending {
		opacity: 0.7;
		filter: grayscale(0.2);
		animation: pulse-bubble 1.5s infinite ease-in-out;
		pointer-events: none;
	}
	@keyframes pulse-bubble {
		0%, 100% { transform: scale(1); }
		50% { transform: scale(0.98); opacity: 0.5; }
	}

	.bubble-anchor {
		position: relative;
		max-width: 80%;
	}

	.author-label {
		font-size: var(--fs-xs);
		color: var(--muted);
		padding-left: var(--space-2);
		margin-bottom: 2px;
	}

	.bubble {
		background: linear-gradient(160deg, var(--surface), color-mix(in srgb, var(--accent) 6%, var(--surface)) 85%);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		border-top-left-radius: var(--radius-xl);
		padding: var(--space-3) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		position: relative;
		box-shadow: var(--shadow-sm);
		cursor: pointer;
		animation: msg-in-left 0.32s cubic-bezier(0.34, 1.4, 0.64, 1);
	}
	/* Seule la dernière bulle d'un groupe garde la "queue" (coin moins arrondi) — les autres sont
	   uniformément arrondies (regroupement, plan de modernisation P7, 22/09/2026). */
	.bubble:not(.mine).tail { border-top-left-radius: 8px; }
	.bubble.mine {
		background: linear-gradient(
			150deg,
			color-mix(in srgb, var(--accent) 45%, white) 0%,
			color-mix(in srgb, var(--accent) 55%, white) 68%,
			color-mix(in srgb, var(--accent-warm) 45%, white) 100%
		);
		border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
		border-radius: var(--radius-xl);
		border-top-right-radius: var(--radius-xl);
		box-shadow: var(--shadow-sm), inset 0 1px 0 rgba(255, 255, 255, 0.5);
		color: var(--on-accent);
		animation: msg-in-right 0.32s cubic-bezier(0.34, 1.4, 0.64, 1);
	}
	.bubble.mine.tail { border-top-right-radius: 8px; }

	.bubble.selected {
		outline: 2px solid color-mix(in srgb, var(--accent) 50%, transparent);
		outline-offset: 2px;
	}

	.bubble.mine .bubble-text,
	.bubble.mine .bubble-translation.first {
		color: var(--on-accent);
	}
	.bubble.mine .bubble-translation,
	.bubble.mine .bubble-time,
	.bubble.mine .i18n-toggle {
		color: color-mix(in srgb, var(--on-accent) 75%, transparent);
	}
	.bubble.mine .bubble-translation.first {
		border-color: color-mix(in srgb, var(--on-accent) 18%, transparent);
	}

	@keyframes msg-in-left {
		from { opacity: 0; transform: translateX(-14px) translateY(8px) scale(0.97); }
		to   { opacity: 1; transform: none; }
	}
	@keyframes msg-in-right {
		from { opacity: 0; transform: translateX(14px) translateY(8px) scale(0.97); }
		to   { opacity: 1; transform: none; }
	}

	.source-badge {
		position: absolute;
		top: -0.45rem;
		right: -0.45rem;
		font-size: 0.7rem;
		line-height: 1;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		width: 1.25rem;
		height: 1.25rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.magic-loader {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: var(--fs-xs);
		color: var(--accent-text);
		font-weight: 600;
		margin-bottom: 4px;
	}
	.magic-sparkle {
		animation: rotate-sparkle 1s infinite linear;
	}
	@keyframes rotate-sparkle {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.bubble-text {
		font-size: var(--fs-md);
		font-weight: 500;
		color: var(--text);
		line-height: 1.55;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.bubble-i18n {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.bubble-translation.first {
		font-size: var(--fs-md);
		font-weight: 500;
		color: var(--text);
		line-height: 1.55;
		display: flex;
		align-items: baseline;
		gap: var(--space-1);
	}
	.bubble-translation {
		font-size: var(--fs-base);
		color: var(--muted-text);
		line-height: 1.5;
		display: flex;
		align-items: baseline;
		gap: var(--space-1);
	}
	/* Khmer traité comme langue première, pas une langue secondaire échappée en petit/italique
	   (voir CLAUDE.md § Bilinguisme) — même si la règle globale de app.css couvre déjà [lang=km],
	   on la répète ici en scoped pour ne pas dépendre de l'ordre de cascade entre app.css et ce
	   composant. */
	.bubble-translation[lang="km"] {
		line-height: var(--lh-kh);
	}
	.transl-tag {
		flex-shrink: 0;
	}

	.i18n-toggle {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		align-self: flex-start;
		font-size: var(--fs-xs);
		font-weight: 600;
		color: var(--muted-text);
	}
	.i18n-toggle :global(.chev) {
		transition: transform 0.2s ease;
	}

	.i18n-more {
		padding-top: var(--space-2);
		border-top: 1px solid color-mix(in srgb, var(--accent) 12%, transparent);
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.bubble.mine .i18n-more {
		border-top-color: color-mix(in srgb, var(--on-accent) 18%, transparent);
	}

	.bubble-time {
		font-size: var(--fs-xs);
		color: var(--muted);
		align-self: flex-end;
	}

	.bubble-img {
		display: block;
		width: 100%;
		max-width: 100%;
		border-radius: var(--radius-sm);
		aspect-ratio: 16/10;
		object-fit: cover;
		margin-top: var(--space-2);
	}
	.bubble-img-loading {
		width: 200px;
		height: 140px;
		background: color-mix(in srgb, var(--muted) 10%, transparent);
		border-radius: var(--radius-sm);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--muted);
	}
</style>
