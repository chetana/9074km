<script lang="ts">
	import BottomSheet from '$lib/BottomSheet.svelte';
	import { Plus, ImagePlus, Sparkles, Hourglass, ChevronDown, X } from 'lucide-svelte';
	import { userStore } from '$lib/auth';
	import { eventsStore } from '$lib/events.svelte';
	import { fetchForDate, addEventMedia } from '$lib/events-api';
	import { displayNames, readerLangFor } from '$lib/events-ui';
	import { preselectEvent, resolveGroupEvents, attachUploaded, skippedMessage } from '$lib/upload-attach';
	import { toasts } from '$lib/toast.svelte';
	import { T } from '$lib/events-i18n';
	import type { EventDTO } from '$lib/events-types';
	import EventForm from './EventForm.svelte';
	import { loadExif, planUploadDates, countsLabel, type ExifMap, type UploadPlan, type DateGroup } from '$lib/upload-exif';
	import { formatRange } from '$lib/events-ui';
	import { U } from '$lib/upload-i18n';

	interface Props {
		phase: 'idle' | 'compressing' | 'uploading';
		current: number;
		total: number;
		currentDate: string; // YYYY-MM-DD
		/** Renvoie les chemins RÉELLEMENT envoyés (sert au rattachement à l'évènement). */
		onFiles: (files: File[] | FileList, date: string, exif?: ExifMap) => void | string[] | Promise<void | string[]>;
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
		touched = false;
		selectedEventId = null;
		listOpen = false;
		void eventsStore.load();
		showSheet = true;
	}

	// --- « Cet envoi : évènement » : pré-sélectionné d'après la date, décochable, jamais silencieux ---
	const readerLang = $derived(readerLangFor($userStore?.name));
	let covering = $state<EventDTO[]>([]);
	let extra = $state<EventDTO[]>([]); // évènements créés ici ou couvrant d'autres dates (pour les noms)
	let selectedEventId = $state<number | null>(null);
	let touched = false; // l'utilisateur a choisi à la main pour la date courante
	let lastDate = '';
	let listOpen = $state(false);
	let formOpen = $state(false);
	let reqToken = 0;

	async function refreshCovering(date: string) {
		const t = ++reqToken;
		try {
			const r = await fetchForDate(date);
			if (t !== reqToken) return;
			covering = r.events;
			if (!touched) selectedEventId = preselectEvent(r.events);
		} catch {
			if (t !== reqToken) return;
			covering = [];
			if (!touched) selectedEventId = null;
		}
	}

	$effect(() => {
		if (!showSheet) return;
		const d = pickedDate;
		if (d !== lastDate) { touched = false; lastDate = d; }
		const h = setTimeout(() => void refreshCovering(d), 200);
		return () => clearTimeout(h);
	});

	const byId = $derived(new Map([...eventsStore.list, ...extra, ...covering].map((e) => [e.id, e])));
	const selected = $derived(selectedEventId === null ? null : (byId.get(selectedEventId) ?? null));
	const others = $derived(eventsStore.list.filter((e) => !covering.some((c) => c.id === e.id)).slice(0, 12));
	const nameOf = (e: EventDTO) => displayNames(e, readerLang);

	function choose(id: number | null) {
		selectedEventId = id;
		touched = true;
		listOpen = false;
	}

	function onEventCreated(ev: EventDTO) {
		extra = [...extra.filter((e) => e.id !== ev.id), ev];
		formOpen = false;
		choose(ev.id);
		showSheet = true;
	}

	function openCreate() {
		listOpen = false;
		showSheet = false;
		formOpen = true;
	}

	function attachFailedToast(retry: () => void) {
		toasts.push({
			message: U.attachFailed.fr, messageKh: U.attachFailed.kh, actionLabel: T.retry.fr, actionLabelKh: T.retry.kh, duration: 10000,
			onAction: retry
		});
	}

	// mode « keep » : une photo déjà rangée dans un AUTRE évènement (même nom de fichier, même jour) n'est jamais
	// déplacée en silence ; on le dit, et « Déplacer ici » demande un déplacement explicite.
	async function attach(eventId: number, paths: string[]) {
		const { failed, skipped } = await attachUploaded([{ eventId, paths }], (id, ps) => addEventMedia(id, ps, 'keep'));
		if (failed.length) return attachFailedToast(() => void attach(eventId, paths));
		void eventsStore.load();
		if (skipped.length === 0) {
			toasts.push({ message: U.attached.fr, messageKh: U.attached.kh });
			return;
		}
		const others = new Set(skipped.map((s) => s.otherEventId));
		const only = others.size === 1 ? byId.get([...others][0]) : undefined;
		const msg = skippedMessage(skipped.length, only ? nameOf(only).primary : null, U);
		const moving = skipped.map((s) => s.path);
		toasts.push({
			message: msg.fr, messageKh: msg.kh, actionLabel: U.moveHere.fr, actionLabelKh: U.moveHere.kh, duration: 12000,
			onAction: () => void moveSkipped(eventId, moving)
		});
	}

	async function moveSkipped(eventId: number, paths: string[]) {
		const { failed } = await attachUploaded([{ eventId, paths }], (id, ps) => addEventMedia(id, ps, 'move'));
		if (failed.length) return attachFailedToast(() => void moveSkipped(eventId, paths));
		toasts.push({ message: T.moved.fr, messageKh: T.moved.kh });
		void eventsStore.load();
	}

	// `fn` capturé AVANT la boucle : le FAB de la liste est démonté dès que l'envoi navigue vers le jour.
	async function sendGroup(fn: Props['onFiles'], files: File[], date: string, exif: ExifMap, eventId: number | null) {
		const paths = await fn(files, date, exif);
		if (eventId !== null && Array.isArray(paths) && paths.length > 0) await attach(eventId, paths);
	}

	function handleConfirm() {
		showSheet = false;
		inputEl.click();
	}

	function handleCancel() {
		showSheet = false;
	}

	// Date de prise de vue (EXIF, lue sur l'original avant compression) : proposée, jamais imposée.
	let readProgress = $state<{ done: number; total: number } | null>(null);
	let pending = $state<{ files: File[]; plan: UploadPlan; exif: ExifMap; groupEvents: Record<string, number | null>; original: Record<string, number | null>; keepEventId: number | null } | null>(null);

	async function handleChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = input.files ? Array.from(input.files) : [];
		input.value = '';
		if (files.length === 0) return;
		const load = await loadExif(files, { onProgress: (done, total) => { if (total > 20) readProgress = { done, total }; } });
		readProgress = null;
		await prepare(files, load.map, load.failed);
	}

	// Jamais d'envoi silencieux d'un lot dont l'EXIF n'a pas été lu entièrement : la feuille s'ouvre et le dit.
	async function prepare(files: File[], exif: ExifMap, failed: File[]) {
		const plan = planUploadDates(files, exif, pickedDate, failed);
		if (!plan.needsConfirm) {
			await sendGroup(onFiles, files, pickedDate, exif, selectedEventId);
			return;
		}
		// Évènement de chaque date : choix explicite pour la date du sheet, évènement couvrant pour les autres.
		const dates = plan.byTaken.map((g) => g.date);
		const cov = new Map<string, EventDTO[]>();
		await Promise.all(dates.filter((d) => d !== pickedDate).map(async (d) => {
			try { cov.set(d, (await fetchForDate(d)).events); } catch { cov.set(d, []); }
		}));
		extra = [...extra, ...[...cov.values()].flat()];
		const resolved = Object.fromEntries(resolveGroupEvents(dates, pickedDate, selectedEventId, cov).map((r) => [r.date, r.eventId]));
		pending = { files, plan, exif, groupEvents: { ...resolved }, original: resolved, keepEventId: selectedEventId };
	}

	async function retryRead() {
		const p = pending;
		if (!p) return;
		pending = null;
		const load = await loadExif(p.plan.failed, { onProgress: (done, total) => { if (total > 20) readProgress = { done, total }; } });
		readProgress = null;
		for (const [f, x] of load.map) p.exif.set(f, x);
		await prepare(p.files, p.exif, load.failed);
	}

	async function runGroups(groups: DateGroup[], mode: 'taken' | 'keep') {
		const p = pending;
		pending = null;
		if (!p) return;
		const fn = onFiles;
		for (const g of groups) await sendGroup(fn, g.files, g.date, p.exif, mode === 'keep' ? p.keepEventId : (p.groupEvents[g.date] ?? null));
	}

	function toggleGroupEvent(date: string) {
		if (!pending) return;
		pending.groupEvents[date] = pending.groupEvents[date] === null ? (pending.original[date] ?? null) : null;
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
	<div class="evt-row">
		<span class="evt-label">{U.thisUpload.fr} · <span lang="km">{U.thisUpload.kh}</span> :</span>
		<button class="evt-btn" aria-expanded={listOpen} aria-haspopup="listbox" onclick={() => (listOpen = !listOpen)}>
			{#if selected}
				{#if selected.emoji}<span aria-hidden="true">{selected.emoji}</span>{/if}
				<span class="evt-name" lang={nameOf(selected).primaryLang}>{nameOf(selected).primary}</span>
			{:else}
				<span class="evt-name">{U.noEvent.fr} · <span lang="km">{U.noEvent.kh}</span></span>
			{/if}
			<ChevronDown size={20} aria-hidden="true" />
		</button>
	</div>
	{#if listOpen}
		<ul class="evt-list" role="listbox">
			<li><button role="option" aria-selected={selectedEventId === null} class:on={selectedEventId === null} onclick={() => choose(null)}>{U.noEvent.fr} · <span lang="km">{U.noEvent.kh}</span></button></li>
			{#if covering.length}<li class="evt-sec">{U.forThisDate.fr} · <span lang="km">{U.forThisDate.kh}</span></li>{/if}
			{#each covering as e (e.id)}
				<li><button role="option" aria-selected={selectedEventId === e.id} class:on={selectedEventId === e.id} onclick={() => choose(e.id)}>{#if e.emoji}<span aria-hidden="true">{e.emoji}</span>{/if} <span lang={nameOf(e).primaryLang}>{nameOf(e).primary}</span></button></li>
			{/each}
			{#if others.length}<li class="evt-sec">{U.otherEvents.fr} · <span lang="km">{U.otherEvents.kh}</span></li>{/if}
			{#each others as e (e.id)}
				<li><button role="option" aria-selected={selectedEventId === e.id} class:on={selectedEventId === e.id} onclick={() => choose(e.id)}>{#if e.emoji}<span aria-hidden="true">{e.emoji}</span>{/if} <span lang={nameOf(e).primaryLang}>{nameOf(e).primary}</span></button></li>
			{/each}
			<li><button role="option" aria-selected="false" class="evt-new" onclick={openCreate}><Plus size={20} aria-hidden="true" /> {T.newEvent.fr} · <span lang="km">{T.newEvent.kh}</span></button></li>
		</ul>
	{/if}
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
					{@const evId = pending.groupEvents[g.date] ?? null}
					{@const ev = evId === null ? null : (byId.get(evId) ?? null)}
					<li>
						<span class="taken-date">{label(g.date).fr} · <span lang="km">{label(g.date).kh}</span></span>
						<span class="taken-n">{countsLabel(g.files).fr} · <span lang="km">{countsLabel(g.files).kh}</span></span>
						{#if pending.original[g.date] != null || evId !== null}
							<button class="row-evt" aria-pressed={evId !== null} onclick={() => toggleGroupEvent(g.date)}>
								{#if ev}
									{#if ev.emoji}<span aria-hidden="true">{ev.emoji}</span>{/if}
									<span lang={nameOf(ev).primaryLang}>{nameOf(ev).primary}</span> <X size={18} aria-label="{U.noEventLong.fr} · {U.noEventLong.kh}" />
								{:else}
									{U.noEventLong.fr} · <span lang="km">{U.noEventLong.kh}</span>
								{/if}
							</button>
						{/if}
					</li>
				{/each}
			</ul>
			{#if pending.plan.failed.length > 0}
				<p class="notice">{U.readFailed.fr.replace('{n}', String(pending.plan.failed.length))}<br /><span lang="km">{U.readFailed.kh.replace('{n}', String(pending.plan.failed.length))}</span></p>
				<button class="btn-retry" onclick={retryRead}><span>{U.retryRead.fr}</span> <span class="kh" lang="km">{U.retryRead.kh}</span></button>
			{:else if pending.plan.noDate > 0}
				<p class="notice">{U.noDate.fr.replace('{n}', String(pending.plan.noDate))}<br /><span lang="km">{U.noDate.kh.replace('{n}', String(pending.plan.noDate))}</span></p>
			{/if}
			<p class="taken-q">{single ? U.useThisDate.fr : U.sortEach.fr}</p>
			<p class="taken-q-kh" lang="km">{single ? U.useThisDate.kh : U.sortEach.kh}</p>
		</div>
		<button class="btn-confirm" onclick={() => runGroups(pending!.plan.byTaken, 'taken')}>
			<span>{single ? U.yesUse.fr : U.yesSort.fr}</span>
			<span class="kh" lang="km">{single ? U.yesUse.kh : U.yesSort.kh}</span>
		</button>
		<button class="btn-keep" onclick={() => runGroups(pending!.plan.keep, 'keep')}>
			<span>{U.keep.fr}</span>
			<span class="kh" lang="km">{U.keep.kh}</span>
			<span class="keep-date">{label(pickedDate).fr} · <span lang="km">{label(pickedDate).kh}</span></span>
			{#if pending.keepEventId !== null && byId.get(pending.keepEventId)}
				<span class="keep-date">{nameOf(byId.get(pending.keepEventId)!).primary}</span>
			{/if}
		</button>
		<button class="btn-cancel" onclick={() => (pending = null)}>
			{U.cancel.fr} · <span lang="km">{U.cancel.kh}</span>
		</button>
	{/if}
</BottomSheet>

<EventForm
	open={formOpen}
	event={null}
	initial={{ dateStart: pickedDate, dateEnd: pickedDate }}
	onclose={() => { formOpen = false; showSheet = true; }}
	onSaved={(ev) => onEventCreated(ev)}
/>

{#if readProgress}
	<p class="reading" role="status">{U.reading.fr} {readProgress.done}/{readProgress.total} · <span lang="km">{U.reading.kh}</span></p>
{/if}

<!-- FAB -->
{#if pending === null && !showSheet && !formOpen}
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
		/* --dock-h = hauteur mesurée du dock (layout) ; repli sur l'ancienne estimation. */
		bottom: calc(var(--dock-h, var(--nav-height) + env(safe-area-inset-bottom, 0px)) + var(--space-4));
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
		font-size: var(--fs-base);
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
	.taken-title { font-family: var(--font-display); font-size: var(--fs-xl); text-wrap: balance; color: var(--text); }
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
	.notice { background: var(--peach); color: var(--peach-text); border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); font-size: var(--fs-md); text-align: center; line-height: var(--lh-kh); }
	.btn-retry { min-height: var(--btn-tap); border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--surface); color: var(--accent-text); font-size: var(--fs-md); display: flex; align-items: center; justify-content: center; gap: var(--space-2); }
	.btn-retry .kh { font-size: var(--fs-xl); }
	.reading { position: fixed; left: var(--space-4); right: var(--space-4); bottom: calc(var(--dock-h, var(--nav-height)) + var(--space-3)); z-index: 100; text-align: center; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--space-2); font-size: var(--fs-md); }
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
	.evt-row { display: flex; flex-direction: column; gap: var(--space-1); }
	.evt-label { font-size: var(--fs-md); color: var(--text-secondary); font-weight: 600; }
	.evt-label span { font-size: var(--fs-xl); line-height: var(--lh-kh); }
	.evt-btn { min-height: 3rem; width: 100%; display: flex; align-items: center; gap: var(--space-2); padding: 0 var(--space-3); border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--surface-2); color: var(--text); font-size: var(--fs-xl); text-align: left; }
	.evt-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-display); }
	.evt-name span { font-size: var(--fs-xl); }
	.evt-list { list-style: none; display: flex; flex-direction: column; gap: var(--space-1); max-height: 30dvh; overflow-y: auto; }
	.evt-list button { width: 100%; min-height: var(--btn-tap); padding: 0 var(--space-3); border-radius: var(--radius-md); background: var(--surface-2); text-align: left; font-size: var(--fs-xl); display: flex; align-items: center; gap: var(--space-2); }
	.evt-list button span[lang='km'] { font-size: var(--fs-xl); }
	.evt-list button.on { background: var(--raised); box-shadow: inset 0 0 0 2px var(--accent-deep); }
	.evt-list .evt-new { color: var(--accent-text); font-weight: 600; }
	.evt-sec { font-size: var(--fs-md); color: var(--muted-text); font-weight: 600; padding: var(--space-1) var(--space-1) 0; }
	.evt-sec span { font-size: var(--fs-lg); }
	.row-evt { margin-top: var(--space-1); min-height: var(--btn-tap); align-self: center; display: inline-flex; align-items: center; gap: var(--space-2); padding: 0 var(--space-3); border-radius: var(--radius-full); background: var(--surface); color: var(--text); font-size: var(--fs-lg); }
	.row-evt span[lang='km'] { font-size: var(--fs-xl); }
	.row-evt[aria-pressed='false'] { color: var(--muted-text); }
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
