<script lang="ts">
	import { ArrowLeft } from 'lucide-svelte';

	interface Props {
		year: string | null;
		month: string | null;
		day: string | null;
		fileCount?: number | null;
		onCoffre: () => void;
		onYear: () => void;
		onMonth: () => void;
	}

	let { year, month, day, fileCount = null, onCoffre, onYear, onMonth }: Props = $props();

	// Titre contextuel + un seul bouton retour, plutôt qu'une pile de pilules — le fil d'Ariane
	// complet reste affiché en sous-titre discret (plan de modernisation P6, 22/09/2026).
	const title = $derived(day ?? month ?? year ?? 'Coffre · ប្រអប់');
	const onBack = $derived(day ? onMonth : month ? onYear : year ? onCoffre : null);
	const trail = $derived(
		['Coffre', year, month].filter((p): p is string => !!p).join(' › ')
	);
</script>

<nav class="breadcrumb">
	{#if onBack}
		<button class="back-btn" onclick={onBack} aria-label="Retour"><ArrowLeft size={18} /></button>
	{/if}
	<div class="breadcrumb-txt">
		<span class="title">
			{title}{#if fileCount !== null}&thinsp;<span class="count">({fileCount})</span>{/if}
		</span>
		{#if trail !== title}<span class="trail">{trail}</span>{/if}
	</div>
</nav>

<style>
	.breadcrumb {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex: 1;
		min-width: 0;
		overflow: hidden;
	}

	.back-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		flex-shrink: 0;
		color: var(--muted-glyph);
	}
	.back-btn:hover { color: var(--accent-text); }

	.breadcrumb-txt {
		display: flex;
		flex-direction: column;
		gap: 0;
		min-width: 0;
		overflow: hidden;
	}

	.title {
		font-family: var(--font-display);
		font-size: var(--fs-lg);
		font-weight: 600;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.trail {
		font-size: var(--fs-xs);
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.count {
		font-size: var(--fs-sm);
		color: var(--muted-text);
		font-weight: 400;
	}
</style>
