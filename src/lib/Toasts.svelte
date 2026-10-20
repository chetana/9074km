<script lang="ts">
	import { onDestroy } from 'svelte';
	import { toasts, type ToastItem } from './toast.svelte';

	// Un minuteur par toast ; à l'expiration (ou si la page est quittée) l'action différée part.
	const timers = new Map<number, ReturnType<typeof setTimeout>>();

	$effect(() => {
		for (const t of toasts.items) {
			if (!timers.has(t.id)) timers.set(t.id, setTimeout(() => { timers.delete(t.id); toasts.dismiss(t.id, 'expire'); }, t.duration));
		}
	});

	function act(t: ToastItem) {
		clearTimeout(timers.get(t.id));
		timers.delete(t.id);
		toasts.dismiss(t.id, 'action');
	}

	onDestroy(() => {
		for (const [id, h] of timers) { clearTimeout(h); toasts.dismiss(id, 'destroy'); }
		timers.clear();
	});
</script>

<div class="stack" aria-live="polite">
	{#each toasts.items as t (t.id)}
		<div class="toast" role="status">
			<span class="msg">{t.message}{#if t.messageKh}<span class="kh" lang="km">{t.messageKh}</span>{/if}</span>
			{#if t.actionLabel}
				<button class="act" onclick={() => act(t)}>{t.actionLabel}{#if t.actionLabelKh}<span class="kh" lang="km">{t.actionLabelKh}</span>{/if}</button>
			{/if}
		</div>
	{/each}
</div>

<style>
	.stack {
		position: fixed;
		left: var(--space-4);
		right: var(--space-4);
		bottom: calc(var(--nav-height) + env(safe-area-inset-bottom, 0px) + var(--space-3));
		z-index: 120;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		pointer-events: none;
	}
	.toast {
		pointer-events: auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		min-height: var(--btn-tap);
		padding: var(--space-1) var(--space-2) var(--space-1) var(--space-4);
		background: var(--text);
		color: var(--bg);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		font-size: var(--fs-md);
		max-width: 30rem;
		margin: 0 auto;
		width: 100%;
	}
	.msg { line-height: 1.4; display: flex; flex-direction: column; }
	.kh { font-size: var(--fs-xl); line-height: var(--lh-kh); display: block; }
	.act {
		min-height: var(--btn-tap);
		padding: 0 var(--space-3);
		color: var(--gold);
		font-weight: 600;
		font-size: var(--fs-lg);
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}
</style>
