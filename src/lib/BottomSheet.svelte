<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import type { Snippet } from 'svelte';

	// Bottom sheet claire avec poignée — pattern déjà présent sur Apprendre, généralisé le
	// 22/09/2026 (plan de modernisation P3) pour remplacer les modales à backdrop noir (FabUpload,
	// NoteField en P6) par quelque chose de cohérent avec le thème pastel.
	interface Props {
		open: boolean;
		onclose: () => void;
		children: Snippet;
	}
	let { open, onclose, children }: Props = $props();
</script>

{#if open}
	<div class="sheet-overlay" onclick={onclose} role="button" tabindex="-1" transition:fade={{ duration: 180 }}>
		<div class="sheet" onclick={(e) => e.stopPropagation()} role="dialog" transition:fly={{ y: 300, duration: 280 }}>
			<div class="sheet-grip"></div>
			{@render children()}
		</div>
	</div>
{/if}

<style>
	.sheet-overlay {
		position: fixed;
		inset: 0;
		z-index: 60;
		background: color-mix(in srgb, var(--text) 25%, transparent);
		backdrop-filter: blur(6px);
		display: flex;
		align-items: flex-end;
		justify-content: center;
	}
	.sheet {
		width: 100%;
		max-width: 30rem;
		background: var(--surface);
		border-radius: 1.6rem 1.6rem 0 0;
		border-top: 1px solid var(--border-soft);
		padding: 0.6rem 1.25rem calc(1.5rem + env(safe-area-inset-bottom, 0px));
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		box-shadow: var(--shadow-lg);
		max-height: 88dvh;
		overflow-y: auto;
	}
	.sheet-grip {
		width: 2.6rem;
		height: 4px;
		border-radius: 99px;
		background: color-mix(in srgb, var(--muted) 40%, transparent);
		margin: 0.1rem auto 0.4rem;
	}
</style>
