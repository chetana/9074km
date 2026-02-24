<script lang="ts">
	interface Props {
		phase: 'idle' | 'compressing' | 'uploading';
		current: number;
		total: number;
		onFiles: (files: FileList) => void;
	}

	let { phase, current, total, onFiles }: Props = $props();

	let inputEl: HTMLInputElement;

	function handleClick() {
		if (phase === 'idle') inputEl.click();
	}

	function handleChange(e: Event) {
		const files = (e.target as HTMLInputElement).files;
		if (files && files.length > 0) {
			onFiles(files);
			// Reset input so same files can be selected again
			(e.target as HTMLInputElement).value = '';
		}
	}
</script>

<input
	bind:this={inputEl}
	type="file"
	accept="image/*,video/*"
	multiple
	hidden
	onchange={handleChange}
/>

<button class="fab" class:busy={phase !== 'idle'} onclick={handleClick} aria-label="Ajouter des fichiers">
	{#if phase === 'idle'}
		<span class="fab-icon">+</span>
	{:else if phase === 'compressing'}
		<span class="fab-label">✨ {current}/{total}</span>
	{:else}
		<span class="fab-label">⏳ {current}/{total}</span>
	{/if}
</button>

<style>
	.fab {
		position: fixed;
		bottom: calc(var(--nav-height) + env(safe-area-inset-bottom, 0px) + var(--space-4));
		right: var(--space-4);
		width: var(--btn-fab);
		height: var(--btn-fab);
		border-radius: var(--radius-full);
		background: var(--accent);
		color: #0f0f1a;
		box-shadow: 0 4px 16px rgba(232, 164, 184, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: transform 0.15s, background 0.15s;
		z-index: 100;
	}

	.fab:active {
		transform: scale(0.92);
	}

	.fab.busy {
		background: var(--card);
		color: var(--accent);
		border: 1.5px solid var(--accent);
		cursor: default;
		width: auto;
		border-radius: var(--radius-2xl);
		padding: 0 var(--space-4);
	}

	.fab-icon {
		font-size: var(--fs-2xl);
		font-weight: 300;
		line-height: 1;
	}

	.fab-label {
		font-size: var(--fs-base);
		font-weight: 600;
		white-space: nowrap;
	}
</style>
