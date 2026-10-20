<script lang="ts">
	import BottomSheet from '$lib/BottomSheet.svelte';
	import { Plus, ImagePlus, Sparkles, Hourglass } from 'lucide-svelte';
	import { loadExif, planUploadDates, countsLabel, type ExifMap, type UploadPlan, type DateGroup } from '$lib/upload-exif';
	import { formatRange } from '$lib/events-ui';
	import { U } from '$lib/upload-i18n';

	interface Props {
		phase: 'idle' | 'compressing' | 'uploading';
		current: number;
		total: number;
		currentDate: string; // YYYY-MM-DD
		onFiles: (files: File[] | FileList, date: string, exif?: ExifMap) => void | Promise<void>;
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

	// Date de prise de vue (EXIF, lue sur l'original avant compression) : proposée, jamais imposée.
	let pending = $state<{ plan: UploadPlan; exif: ExifMap } | null>(null);

	async function handleChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = input.files ? Array.from(input.files) : [];
		input.value = '';
		if (files.length === 0) return;
		const exif = await loadExif(files);
		const plan = planUploadDates(files, exif, pickedDate);
		if (!plan.needsConfirm) {
			await onFiles(files, pickedDate, exif);
			return;
		}
		pending = { plan, exif };
	}

	async function runGroups(groups: DateGroup[]) {
		const p = pending;
		pending = null;
		if (!p) return;
		for (const g of groups) await onFiles(g.files, g.date, p.exif);
	}

	const single = $derived(!!pending && pending.plan.byTaken.length === 1);
	const label = (d: string) => formatRange(d, d);


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

<!-- Confirmation de la date de prise de vue -->
<BottomSheet open={pending !== null} onclose={() => (pending = null)}>
	{#if pending}
		<div class="taken">
			<h2 class="taken-title">{single ? U.takenOn.fr : U.manyDays.fr}</h2>
			<p class="taken-title-kh" lang="km">{single ? U.takenOn.kh : U.manyDays.kh}</p>
			<ul class="taken-list">
				{#each pending.plan.byTaken as g (g.date)}
					<li>
						<span class="taken-date">{label(g.date).fr} · <span lang="km">{label(g.date).kh}</span></span>
						<span class="taken-n">{countsLabel(g.files).fr} · <span lang="km">{countsLabel(g.files).kh}</span></span>
					</li>
				{/each}
			</ul>
			<p class="taken-q">{single ? U.useThisDate.fr : U.sortEach.fr}</p>
			<p class="taken-q-kh" lang="km">{single ? U.useThisDate.kh : U.sortEach.kh}</p>
		</div>
		<button class="btn-confirm" onclick={() => runGroups(pending!.plan.byTaken)}>
			<span>{single ? U.yesUse.fr : U.yesSort.fr}</span>
			<span class="kh" lang="km">{single ? U.yesUse.kh : U.yesSort.kh}</span>
		</button>
		<button class="btn-keep" onclick={() => runGroups(pending!.plan.keep)}>
			<span>{U.keep.fr}</span>
			<span class="kh" lang="km">{U.keep.kh}</span>
			<span class="keep-date">{label(pickedDate).fr} · <span lang="km">{label(pickedDate).kh}</span></span>
		</button>
		<button class="btn-cancel" onclick={() => (pending = null)}>
			{U.cancel.fr} · <span lang="km">{U.cancel.kh}</span>
		</button>
	{/if}
</BottomSheet>

<!-- FAB -->
{#if pending === null}
<button class="fab" class:busy={phase !== 'idle'} onclick={handleFabClick} aria-label="Ajouter des fichiers">
	{#if phase === 'idle'}
		<Plus size={26} />
	{:else if phase === 'compressing'}
		<span class="fab-label"><Sparkles size={16} /> {current}/{total}</span>
	{:else}
		<span class="fab-label"><Hourglass size={16} /> {current}/{total}</span>
	{/if}
</button>
{/if}

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

	.taken { text-align: center; display: flex; flex-direction: column; gap: var(--space-1); }
	.taken-title { font-family: var(--font-display); font-size: var(--fs-2xl); color: var(--text); }
	.taken-title-kh { font-size: var(--fs-xl); color: var(--text-secondary); line-height: var(--lh-kh); }
	.taken-list { list-style: none; display: flex; flex-direction: column; gap: var(--space-2); margin: var(--space-2) 0; max-height: 34dvh; overflow-y: auto; flex-shrink: 1; min-height: 0; }
	.taken-list li { flex-shrink: 0; }
	.btn-confirm, .btn-keep, .btn-cancel { flex-shrink: 0; }
	.taken-list li { background: var(--surface-2); border-radius: var(--radius-md); padding: var(--space-1) var(--space-3); display: flex; flex-direction: column; }
	.taken-date { font-size: var(--fs-xl); font-weight: 600; color: var(--accent-text); }
	.taken-date span { font-size: var(--fs-xl); }
	.taken-n { font-size: var(--fs-md); color: var(--muted-text); }
	.taken-n span { font-size: 1rem; }
	.taken-q { font-size: var(--fs-lg); color: var(--text); font-weight: 600; }
	.taken-q-kh { font-size: var(--fs-xl); color: var(--text-secondary); line-height: var(--lh-kh); }
	.btn-confirm .kh { font-size: var(--fs-xl); }
	.btn-keep {
		width: 100%;
		min-height: var(--btn-tap);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		font-size: var(--fs-md);
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.btn-cancel span { font-size: 1rem; }
	.keep-date { font-size: var(--fs-md); color: var(--muted-text); }
	.keep-date span { font-size: 1rem; }
	.btn-keep .kh { font-size: var(--fs-xl); line-height: var(--lh-kh); color: var(--text-secondary); }

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
