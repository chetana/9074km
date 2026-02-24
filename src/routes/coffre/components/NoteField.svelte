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
<dialog bind:this={dialogEl} class="note-dialog" onclose={close}>
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
		gap: 8px;
		width: 100%;
		padding: 10px 16px;
		background: var(--card);
		border-bottom: 1px solid var(--border);
		text-align: left;
	}

	.note-icon {
		font-size: 14px;
		flex-shrink: 0;
	}

	.note-preview {
		font-size: 13px;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.note-placeholder {
		font-size: 13px;
		color: var(--muted);
		font-style: italic;
	}

	.note-dialog {
		width: 100%;
		height: 100%;
		max-width: 100%;
		max-height: 100%;
		margin: 0;
		padding: 0;
		border: none;
		background: var(--bg);
		color: var(--text);
	}

	.note-dialog::backdrop {
		background: rgba(0, 0, 0, 0.6);
	}

	.note-editor {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.note-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.note-title {
		font-size: 15px;
		font-weight: 600;
	}

	.done-btn {
		font-size: 14px;
		color: var(--accent);
		font-weight: 600;
		padding: 4px 8px;
	}

	.note-textarea {
		flex: 1;
		padding: 16px;
		background: transparent;
		border: none;
		outline: none;
		font-size: 15px;
		line-height: 1.6;
		resize: none;
	}
</style>
