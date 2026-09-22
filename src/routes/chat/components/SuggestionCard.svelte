<script lang="ts">
	import LangTag from '$lib/LangTag.svelte';
	import type { GeminiSuggestion } from '$lib/api';

	interface Props {
		suggestion: GeminiSuggestion | null;
		loading: boolean;
		thinkingText: string;
		yesLabel: string;
		noLabel: string;
		onAccept: () => void;
		onDismiss: () => void;
	}

	let { suggestion, loading, thinkingText, yesLabel, noLabel, onAccept, onDismiss }: Props = $props();
</script>

{#if loading}
	<div class="suggestion suggestion-loading">
		<span class="suggestion-dots">{thinkingText}</span>
	</div>
{:else if suggestion}
	<div class="suggestion">
		<p class="suggestion-question">{suggestion.question}</p>
		<p class="suggestion-corrected">"{suggestion.corrected}"</p>
		{#if suggestion.fr}<p class="suggestion-translation" lang="fr"><span class="transl-tag"><LangTag lang="fr" /></span>{suggestion.fr}</p>{/if}
		{#if suggestion.en}<p class="suggestion-translation" lang="en"><span class="transl-tag"><LangTag lang="en" /></span>{suggestion.en}</p>{/if}
		{#if suggestion.kh}<p class="suggestion-translation" lang="km"><span class="transl-tag"><LangTag lang="kh" /></span>{suggestion.kh}</p>{/if}
		{#if suggestion.lessons?.length}
			{#each suggestion.lessons as l}
				<p class="suggestion-lesson"><s>{l.original}</s> → <strong>{l.corrected}</strong> — {l.explanation}</p>
			{/each}
		{/if}
		<div class="suggestion-actions">
			<button class="suggestion-btn accept" onclick={onAccept}>{yesLabel}</button>
			<button class="suggestion-btn dismiss" onclick={onDismiss}>{noLabel}</button>
		</div>
	</div>
{/if}

<style>
	.suggestion {
		margin: 0 var(--space-4) var(--space-2);
		background: linear-gradient(155deg, var(--lavender), var(--surface) 70%);
		border: 1px solid color-mix(in srgb, var(--lavender-deep) 45%, transparent);
		border-radius: var(--radius-xl);
		padding: var(--space-3) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		position: relative;
		z-index: 1;
		box-shadow: var(--shadow-lavender);
		animation: suggest-in 0.25s ease;
	}
	@keyframes suggest-in {
		from { opacity: 0; transform: translateY(10px) scale(0.97); }
		to   { opacity: 1; transform: none; }
	}
	.suggestion-loading { color: var(--muted); font-size: var(--fs-sm); }
	.suggestion-dots { font-size: var(--fs-sm); color: var(--muted); }
	.suggestion-question {
		font-family: var(--font-display);
		font-size: var(--fs-sm);
		font-weight: 600;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		color: var(--lavender-text);
	}
	.suggestion-corrected { font-size: var(--fs-base); color: var(--text); }
	.suggestion-translation {
		font-size: var(--fs-base);
		color: var(--muted-text);
		line-height: 1.5;
		display: flex;
		align-items: baseline;
		gap: var(--space-1);
	}
	.suggestion-translation[lang="km"] { line-height: var(--lh-kh); }
	.transl-tag { flex-shrink: 0; }
	.suggestion-lesson {
		font-size: var(--fs-sm);
		color: var(--text-secondary);
		background: color-mix(in srgb, var(--lavender-deep) 14%, var(--surface));
		border-left: 2px solid var(--lavender-deep);
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
		padding: var(--space-1) var(--space-3);
		margin-top: var(--space-1);
		line-height: 1.5;
	}
	.suggestion-actions { display: flex; gap: var(--space-2); margin-top: var(--space-1); }
	.suggestion-btn {
		font-size: var(--fs-sm);
		font-weight: 700;
		border-radius: var(--radius-full);
		padding: var(--space-1) var(--space-4);
		transition: transform 0.1s;
	}
	.suggestion-btn:active { transform: scale(0.95); }
	.suggestion-btn.accept {
		background: linear-gradient(135deg, var(--lavender-deep), #9E86DE);
		color: var(--on-lavender);
		box-shadow: var(--shadow-lavender);
	}
	.suggestion-btn.dismiss { background: color-mix(in srgb, var(--muted) 15%, transparent); color: var(--text-secondary); }
</style>
