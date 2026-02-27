<script lang="ts">
	import { onDestroy } from 'svelte';

	interface Props {
		note: string;
		onSave: (text: string) => void;
	}

	let { note, onSave }: Props = $props();

	let dialogEl: HTMLDialogElement;
	let editText = $state('');
	let dirty = $state(false);

	function open() {
		editText = note;
		dirty = false;
		dialogEl.showModal();
	}

	function close() {
		if (dirty) {
			onSave(editText.trim());
		}
		dialogEl.close();
	}

	function onInput() {
		dirty = true;
	}

	// Auto-save on destroy if dialog somehow left open
	onDestroy(() => {
		if (dirty) onSave(editText.trim());
	});

	const preview = $derived(note.split('\n')[0]?.trim() || '');
</script>

<!-- Collapsed note field -->
<button class="note-collapsed" onclick={open}>
	<span class="note-icon">📝</span>
	{#if preview}
		<span class="note-preview">{preview}</span>
	{:else}
		<span class="note-placeholder">Ajouter une note… · បន្ថែមចំណាំ…</span>
	{/if}
</button>

<!-- Full-screen note editor dialog -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialogEl} class="note-dialog" onclose={close} onclick={(e) => { if (e.target === dialogEl) close(); }}>
	<div class="note-editor">
		<div class="note-toolbar">
			<span class="note-title">📝 Note · ចំណាំ</span>
			<button class="done-btn" onclick={close}>Fait · រួចរាល់</button>
		</div>
		<textarea
			class="note-textarea"
			bind:value={editText}
			oninput={onInput}
			placeholder="Écris ici… · សរសេរទីនេះ…"
		></textarea>
	</div>
</dialog>

<style>
	.note-collapsed {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-3) var(--space-4);
		background: var(--card);
		border-bottom: 1px solid var(--border);
		text-align: left;
	}

	.note-icon {
		font-size: var(--fs-md);
		flex-shrink: 0;
	}

	.note-preview {
		font-size: var(--fs-base);
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.note-placeholder {
		font-size: var(--fs-base);
		color: var(--muted);
		font-style: italic;
	}

	.note-dialog {
		width: calc(100% - var(--space-8));
		max-width: 480px;
		max-height: 70vh;
		margin: auto;
		padding: 0;
		border: none;
		border-radius: var(--radius-2xl);
		background: var(--card);
		color: var(--text);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
		overflow: hidden;
	}

	.note-dialog::backdrop {
		background: rgba(0, 0, 0, 0.6);
	}

	.note-editor {
		display: flex;
		flex-direction: column;
		max-height: 70vh;
	}

	.note-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4) var(--space-6);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.note-title {
		font-size: var(--fs-lg);
		font-weight: 600;
	}

	.done-btn {
		font-size: var(--fs-md);
		color: var(--accent);
		font-weight: 600;
		padding: var(--space-1) var(--space-2);
	}

	.note-textarea {
		flex: 1;
		padding: var(--space-4) var(--space-6);
		background: transparent;
		border: none;
		outline: none;
		font-size: var(--fs-md);
		line-height: 1.6;
		resize: none;
		min-height: 160px;
	}
</style>
