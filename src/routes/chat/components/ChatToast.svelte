<script lang="ts">
	interface Props {
		copyToast: boolean;
		errorToast: string | null;
		copyLabel: string;
	}

	let { copyToast, errorToast, copyLabel }: Props = $props();
</script>

{#if copyToast}
	<div class="toast copy">{copyLabel}</div>
{/if}
{#if errorToast}
	<div class="toast error">{errorToast}</div>
{/if}

<style>
	.toast {
		position: fixed;
		bottom: 6rem;
		left: 50%;
		transform: translateX(-50%);
		font-size: var(--fs-sm);
		font-weight: 600;
		padding: var(--space-2) var(--space-6);
		border-radius: var(--radius-sm);
		pointer-events: none;
		animation: fade-toast 2s ease forwards;
		z-index: 10;
		white-space: nowrap;
	}
	.toast.copy {
		background: var(--accent);
		color: var(--on-accent);
	}
	.toast.error {
		background: color-mix(in srgb, #e53935 90%, transparent);
		color: #fff;
		animation-duration: 3s;
	}
	@keyframes fade-toast {
		0%   { opacity: 0; transform: translateX(-50%) translateY(4px); }
		15%  { opacity: 1; transform: translateX(-50%) translateY(0); }
		75%  { opacity: 1; }
		100% { opacity: 0; }
	}
</style>
