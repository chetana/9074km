<script lang="ts">
	interface Props {
		phase: 'idle' | 'compressing' | 'uploading';
		current: number;
		total: number;
		currentDate: string; // YYYY-MM-DD
		onFiles: (files: FileList, date: string) => void;
	}

	let { phase, current, total, currentDate, onFiles }: Props = $props();

	let inputEl: HTMLInputElement;
	let showSheet = $state(false);
	let pickedDate = $state(currentDate);

	// Sync pickedDate si currentDate change (navigation jour)
	$effect(() => {
		pickedDate = currentDate;
	});

	function handleFabClick() {
		if (phase !== 'idle') return;
		pickedDate = currentDate;
		showSheet = true;
	}

	function handleConfirm() {
		showSheet = false;
		inputEl.click();
	}

	function handleCancel() {
		showSheet = false;
	}

	function handleChange(e: Event) {
		const files = (e.target as HTMLInputElement).files;
		if (files && files.length > 0) {
			onFiles(files, pickedDate);
			(e.target as HTMLInputElement).value = '';
		}
	}

	const today = new Date().toISOString().slice(0, 10);
</script>

<input
	bind:this={inputEl}
	type="file"
	accept="image/*,video/*"
	multiple
	hidden
	onchange={handleChange}
/>

<!-- Date picker sheet -->
{#if showSheet}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="sheet-backdrop" onclick={handleCancel}></div>
	<div class="sheet">
		<p class="sheet-title">Date d'upload · ថ្ងៃ</p>
		<input
			class="date-input"
			type="date"
			max={today}
			bind:value={pickedDate}
		/>
		<div class="sheet-actions">
			<button class="btn-cancel" onclick={handleCancel}>Annuler</button>
			<button class="btn-confirm" onclick={handleConfirm}>Choisir des photos</button>
		</div>
	</div>
{/if}

<!-- FAB -->
<button class="fab" class:busy={phase !== 'idle'} onclick={handleFabClick} aria-label="Ajouter des fichiers">
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

	/* Sheet */
	.sheet-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 200;
	}

	.sheet {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		background: var(--card);
		border-radius: var(--radius-2xl) var(--radius-2xl) 0 0;
		padding: var(--space-6) var(--space-4);
		padding-bottom: calc(var(--space-6) + env(safe-area-inset-bottom, 0px));
		z-index: 201;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.sheet-title {
		font-size: var(--fs-md);
		font-weight: 600;
		color: var(--text);
		text-align: center;
	}

	.date-input {
		width: 100%;
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-md);
		border: 1px solid var(--border);
		background: var(--bg);
		color: var(--text);
		font-size: var(--fs-lg);
		text-align: center;
	}

	.sheet-actions {
		display: flex;
		gap: var(--space-3);
	}

	.btn-cancel {
		flex: 1;
		padding: var(--space-3);
		border-radius: var(--radius-md);
		border: 1px solid var(--border);
		color: var(--muted);
		font-size: var(--fs-base);
	}

	.btn-confirm {
		flex: 2;
		padding: var(--space-3);
		border-radius: var(--radius-md);
		background: var(--accent);
		color: #0f0f1a;
		font-size: var(--fs-base);
		font-weight: 600;
	}
</style>
