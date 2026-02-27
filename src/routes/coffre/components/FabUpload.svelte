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
		<p class="sheet-title">Choisir une date · ជ្រើសរើសថ្ងៃ</p>
		<div class="date-row">
			<input
				class="date-input"
				type="date"
				bind:value={pickedDate}
			/>
			<button class="btn-today" onclick={() => pickedDate = new Date().toLocaleDateString('sv')}>
				<span>Aujourd'hui</span>
				<span class="kh-today">ថ្ងៃនេះ</span>
			</button>
		</div>
		<button class="btn-confirm" onclick={handleConfirm}>
			<span class="btn-emoji">🖼️ 📸</span>
			<span>Choisir des photos</span>
			<span class="kh">រើសរូបភាព</span>
		</button>
		<button class="btn-cancel" onclick={handleCancel}>Annuler · បោះបង់</button>
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
		color: var(--on-accent);
		box-shadow: 0 4px 16px color-mix(in srgb, var(--accent) 40%, transparent);
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
		background: rgba(0, 0, 0, 0.6);
		z-index: 200;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.sheet {
		position: fixed;
		left: var(--space-4);
		right: var(--space-4);
		top: 50%;
		transform: translateY(-50%);
		background: var(--card);
		border-radius: var(--radius-2xl);
		padding: var(--space-8) var(--space-6);
		z-index: 201;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.sheet-title {
		font-size: var(--fs-lg);
		font-weight: 600;
		color: var(--text);
		text-align: center;
	}

	.date-row {
		display: flex;
		gap: var(--space-2);
		align-items: stretch;
	}

	.date-input {
		flex: 1;
		padding: var(--space-4);
		border-radius: var(--radius-md);
		border: 1px solid var(--border);
		background: var(--bg);
		color: var(--text);
		font-size: var(--fs-xl);
		text-align: center;
	}

	.btn-today {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		border: 1px solid var(--border);
		background: color-mix(in srgb, var(--accent) 12%, transparent);
		color: var(--accent);
		font-size: var(--fs-sm);
		font-weight: 600;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.btn-today:active {
		background: color-mix(in srgb, var(--accent) 24%, transparent);
	}

	.kh-today {
		font-size: var(--fs-xs);
		opacity: 0.75;
		font-weight: 400;
	}

	.btn-confirm {
		width: 100%;
		padding: var(--space-4);
		border-radius: var(--radius-md);
		background: var(--accent);
		color: var(--on-accent);
		font-size: var(--fs-lg);
		font-weight: 600;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-1);
	}

	.btn-emoji {
		font-size: var(--fs-2xl);
		line-height: 1;
	}

	.btn-confirm .kh {
		font-size: var(--fs-sm);
		opacity: 0.7;
		font-weight: 400;
	}

	.btn-cancel {
		width: 100%;
		padding: var(--space-3);
		border-radius: var(--radius-md);
		border: 1px solid var(--border);
		color: var(--muted);
		font-size: var(--fs-base);
		text-align: center;
	}
</style>
