<script lang="ts">
	import Flag from '$lib/Flag.svelte';
	import { Volume2, Mic as MicIcon } from 'lucide-svelte';
	import type { ChatMessage } from '$lib/api';

	interface Props {
		msg: ChatMessage;
		isMine: boolean;
		isSelected: boolean;
		isPending: boolean;
		isSpeaking: boolean;
		userLang: 'fr' | 'kh';
		imageUrl?: string;
		onSelect: () => void;
		onCopy: () => void;
		onSpeak: (lang: 'fr' | 'en' | 'kh') => void;
		onDelete: () => void;
		onDeselect: () => void;
		fmtTime: (ts: string) => string;
		fmtTimeKH: (ts: string) => string;
		isChet: (name: string) => boolean;
	}

	let {
		msg, isMine, isSelected, isPending, isSpeaking, userLang,
		imageUrl, onSelect, onCopy, onSpeak, onDelete, onDeselect,
		fmtTime, fmtTimeKH, isChet
	}: Props = $props();

	const legacy = $derived((msg as unknown as { translation?: string }).translation);
	const aLang = $derived((msg.lang as 'fr' | 'en' | 'kh' | undefined) ?? (isChet(msg.author) ? 'fr' : 'kh'));
</script>

<div class="bubble-wrapper" class:mine={isMine} class:selected={isSelected} class:is-pending={isPending || isSpeaking}>
	{#if isSelected && isMine}
		<div class="inline-actions" onclick={(e) => e.stopPropagation()}>
			<button class="act-btn copy" onclick={onCopy} aria-label="Copier">{userLang === 'kh' ? '📋 ចម្លង' : '📋 Copier'}</button>
			<div class="act-row">
				<button class="act-btn" onclick={() => onSpeak('fr')} aria-label="FR"><Volume2 size={14} /><Flag lang="fr" size="sm" /></button>
				<button class="act-btn" onclick={() => onSpeak('en')} aria-label="EN"><Volume2 size={14} /><Flag lang="en" size="sm" /></button>
				<button class="act-btn" onclick={() => onSpeak('kh')} aria-label="KH"><Volume2 size={14} /><Flag lang="kh" size="sm" /></button>
			</div>
			<div class="act-row">
				<button class="act-btn delete" onclick={onDelete} aria-label="Supprimer">🗑</button>
				<button class="act-btn close" onclick={onDeselect} aria-label="Fermer">✕</button>
			</div>
		</div>
	{/if}
	<div class="bubble-row" class:mine={isMine} onclick={onSelect} role="button" tabindex="0">
		{#if !isMine}
			<span class="author-label">{msg.author}</span>
		{/if}
		<div class="bubble" class:mine={isMine}>
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
				<div class="bubble-translations">
					<p class="bubble-translation"><span class="transl-flag"><Flag lang={aLang} size="sm" /></span>{msg.text}</p>
					{#if aLang !== 'fr' && msg.fr}<p class="bubble-translation"><span class="transl-flag"><Flag lang="fr" size="sm" /></span>{msg.fr}</p>{/if}
					{#if aLang !== 'en' && msg.en}<p class="bubble-translation"><span class="transl-flag"><Flag lang="en" size="sm" /></span>{msg.en}</p>{/if}
					{#if aLang !== 'kh' && msg.kh}<p class="bubble-translation"><span class="transl-flag"><Flag lang="kh" size="sm" /></span>{msg.kh}</p>{/if}
				</div>
			{:else}
				<p class="bubble-text">{msg.text}</p>
				{#if legacy}
					<div class="bubble-translations">
						<p class="bubble-translation">{legacy}</p>
					</div>
				{/if}
			{/if}
			<span class="bubble-time"><Flag lang="fr" size="sm" /> {fmtTime(msg.ts)} · <Flag lang="kh" size="sm" /> {fmtTimeKH(msg.ts)}</span>
		</div>
	</div>
	{#if isSelected && !isMine}
		<div class="inline-actions" onclick={(e) => e.stopPropagation()}>
			<button class="act-btn copy" onclick={onCopy} aria-label="Copier">{userLang === 'kh' ? '📋 ចម្លង' : '📋 Copier'}</button>
			<div class="act-row">
				<button class="act-btn" onclick={() => onSpeak('fr')} aria-label="FR"><Volume2 size={14} /><Flag lang="fr" size="sm" /></button>
				<button class="act-btn" onclick={() => onSpeak('en')} aria-label="EN"><Volume2 size={14} /><Flag lang="en" size="sm" /></button>
				<button class="act-btn" onclick={() => onSpeak('kh')} aria-label="KH"><Volume2 size={14} /><Flag lang="kh" size="sm" /></button>
			</div>
			<div class="act-row">
				<button class="act-btn close" onclick={onDeselect} aria-label="Fermer">✕</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.bubble-wrapper {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
	}
	.bubble-wrapper.mine { justify-content: flex-end; }
	.bubble-wrapper:not(.mine) { justify-content: flex-start; }

	.bubble-wrapper > .bubble-row {
		transition: transform 0.25s cubic-bezier(0.34, 1.2, 0.64, 1);
		cursor: pointer;
	}
	.bubble-wrapper.selected.mine > .bubble-row { transform: translateX(6px); }
	.bubble-wrapper.selected:not(.mine) > .bubble-row { transform: translateX(-6px); }

	.bubble-wrapper.selected .bubble {
		outline: 2px solid color-mix(in srgb, var(--accent) 50%, transparent);
		outline-offset: 2px;
	}

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

	.bubble-row {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		max-width: 80%;
		animation: msg-in-left 0.32s cubic-bezier(0.34, 1.4, 0.64, 1);
	}
	.bubble-row.mine {
		animation: msg-in-right 0.32s cubic-bezier(0.34, 1.4, 0.64, 1);
		align-items: flex-end;
	}

	@keyframes msg-in-left {
		from { opacity: 0; transform: translateX(-14px) translateY(8px) scale(0.97); }
		to   { opacity: 1; transform: none; }
	}
	@keyframes msg-in-right {
		from { opacity: 0; transform: translateX(14px) translateY(8px) scale(0.97); }
		to   { opacity: 1; transform: none; }
	}

	.author-label {
		font-size: var(--fs-xs);
		color: var(--muted);
		padding-left: var(--space-2);
	}

	.bubble {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		border-bottom-left-radius: 4px;
		padding: var(--space-3) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		position: relative;
	}
	.bubble.mine {
		background: color-mix(in srgb, var(--accent) 12%, var(--surface));
		border-color: color-mix(in srgb, var(--accent) 25%, transparent);
		border-bottom-left-radius: var(--radius-xl);
		border-bottom-right-radius: 4px;
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
		color: var(--accent);
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

	.bubble-translations {
		margin-top: var(--space-2);
		padding-top: var(--space-2);
		border-top: 1px solid color-mix(in srgb, var(--accent) 12%, transparent);
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.bubble-translation:first-child {
		font-size: var(--fs-md);
		font-weight: 500;
		color: var(--text);
		font-style: normal;
		line-height: 1.55;
		padding-bottom: var(--space-2);
		border-bottom: 1px solid color-mix(in srgb, var(--accent) 12%, transparent);
		margin-bottom: 2px;
		display: flex;
		align-items: baseline;
		gap: var(--space-1);
	}
	.bubble-translation {
		font-size: var(--fs-xs);
		color: var(--muted);
		font-style: italic;
		line-height: 1.4;
		display: flex;
		align-items: baseline;
		gap: var(--space-1);
	}
	.transl-flag {
		font-style: normal;
		flex-shrink: 0;
		font-size: 0.75em;
	}

	.bubble-time {
		font-size: var(--fs-xs);
		color: var(--muted);
		opacity: 0.6;
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

	/* ── Actions inline ── */
	.inline-actions {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		animation: fade-in-actions 0.2s ease forwards;
		flex-shrink: 0;
	}
	@keyframes fade-in-actions {
		from { opacity: 0; transform: scale(0.85); }
		to   { opacity: 1; transform: scale(1); }
	}
	.act-row { display: flex; gap: 4px; }
	.act-btn {
		width: 2.6rem;
		height: 2.6rem;
		border-radius: var(--radius-sm);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1rem;
		flex-shrink: 0;
		background: var(--surface);
		border: 1px solid var(--border);
		transition: transform 0.1s;
		cursor: pointer;
	}
	.act-btn:active { transform: scale(0.85); }
	.act-btn.copy {
		width: auto;
		min-width: 5.5rem;
		height: 2.6rem;
		border-radius: var(--radius-xl);
		padding: 0 var(--space-3);
		font-size: 0.85rem;
		font-weight: 600;
		background: color-mix(in srgb, var(--accent) 12%, var(--card));
		border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
		color: var(--accent);
		white-space: nowrap;
	}
	.act-btn.delete { background: color-mix(in srgb, #e53935 12%, var(--card)); }
	.act-btn.close { color: var(--muted); font-size: 0.85rem; }
</style>
