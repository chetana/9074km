<script lang="ts">
	import BottomSheet from '$lib/BottomSheet.svelte';
	import { Plus, ImagePlus, Sparkles, Hourglass } from 'lucide-svelte';

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
<BottomSheet open={showSheet} onclose={handleCancel}>
	<p class="sheet-title">Choisir une date · ជ្រើសរើសថ្ងៃ</p>
	<div class="date-row">
		<input
			class="date-input"
			type="date"
			bind:value={pickedDate}
		/>
		<button class="btn-today" onclick={() => pickedDate = new Date().toLocaleDateString('sv')}>
			<span>Aujourd'hui</span>
			<span class="kh-today" lang="km">ថ្ងៃនេះ</span>
		</button>
	</div>
	<button class="btn-confirm" onclick={handleConfirm}>
		<ImagePlus size={22} />
		<span>Choisir des photos</span>
		<span class="kh" lang="km">រើសរូបភាព</span>
	</button>
	<button class="btn-cancel" onclick={handleCancel}>Annuler · បោះបង់</button>
</BottomSheet>

<!-- FAB -->
<button class="fab" class:busy={phase !== 'idle'} onclick={handleFabClick} aria-label="Ajouter des fichiers">
	{#if phase === 'idle'}
		<Plus size={26} />
	{:else if phase === 'compressing'}
		<span class="fab-label"><Sparkles size={16} /> {current}/{total}</span>
	{:else}
		<span class="fab-label"><Hourglass size={16} /> {current}/{total}</span>
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
		background: linear-gradient(150deg, var(--accent), var(--accent-warm));
		color: var(--on-accent);
		/* Jamais de halo dramatique (règle du thème pastel) — une ombre courte comme le reste des
		   surfaces accentuées, pas un glow diffus. */
		box-shadow: var(--shadow-accent);
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
		color: var(--accent-text);
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
		color: var(--accent-text);
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
		color: var(--muted-text);
		font-weight: 400;
		line-height: var(--lh-kh);
	}

	.btn-confirm {
		width: 100%;
		padding: var(--space-4);
		border-radius: var(--radius-md);
		background: linear-gradient(150deg, var(--accent), var(--accent-warm));
		color: var(--on-accent);
		font-size: var(--fs-lg);
		font-weight: 600;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-1);
	}

	.btn-confirm .kh {
		font-size: var(--fs-sm);
		color: color-mix(in srgb, var(--on-accent) 75%, transparent);
		font-weight: 400;
		line-height: var(--lh-kh);
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
