<script lang="ts">
	import Flag from '$lib/Flag.svelte';
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
		{#if suggestion.fr}<p class="suggestion-translation"><span class="transl-flag"><Flag lang="fr" size="sm" /></span>{suggestion.fr}</p>{/if}
		{#if suggestion.en}<p class="suggestion-translation"><span class="transl-flag"><Flag lang="en" size="sm" /></span>{suggestion.en}</p>{/if}
		{#if suggestion.kh}<p class="suggestion-translation"><span class="transl-flag"><Flag lang="kh" size="sm" /></span>{suggestion.kh}</p>{/if}
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
		background: var(--surface);
		border: 1px solid var(--border);
		border-left: 3px solid var(--accent);
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
		padding: var(--space-3) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		position: relative;
		z-index: 1;
		animation: suggest-in 0.25s ease;
	}
	@keyframes suggest-in {
		from { opacity: 0; transform: translateY(10px) scale(0.97); }
		to   { opacity: 1; transform: none; }
	}
	.suggestion-loading { color: var(--muted); font-size: var(--fs-sm); }
	.suggestion-dots { font-size: var(--fs-sm); color: var(--muted); }
	.suggestion-question { font-size: var(--fs-sm); font-weight: 600; color: var(--accent); }
	.suggestion-corrected { font-size: var(--fs-base); color: var(--text); }
	.suggestion-translation { font-size: var(--fs-sm); color: var(--muted); font-style: italic; }
	.transl-flag { font-style: normal; flex-shrink: 0; font-size: 0.75em; }
	.suggestion-lesson {
		font-size: var(--fs-sm);
		color: var(--muted);
		background: color-mix(in srgb, var(--accent) 6%, var(--bg));
		border-left: 2px solid var(--accent);
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
	.suggestion-btn.accept { background: var(--accent); color: var(--on-accent); }
	.suggestion-btn.dismiss { background: color-mix(in srgb, var(--muted) 15%, transparent); color: var(--muted); }
</style>
