<script lang="ts">
	import { onMount } from 'svelte';
	import { X, Film, Plus } from 'lucide-svelte';
	import { ogImageUrl, signDownload } from '$lib/api';
	import { generateVideoThumbnail } from '$lib/thumbnailer';
	import { eventsStore } from '$lib/events.svelte';
	import { fetchUnclassified, fetchForDate, addEventMedia, removeEventMedia, skipMedia, EventApiError, type UnclassifiedItem } from '$lib/events-api';
	import type { EventDTO } from '$lib/events-types';
	import { T } from '$lib/events-i18n';
	import { toasts } from '$lib/toast.svelte';
	import { displayNames, formatRange, dayHeadingLong, fillT, type ReaderLang } from '$lib/events-ui';
	import { skippedMessage } from '$lib/upload-attach';
	import { U } from '$lib/upload-i18n';
	import EventForm from './EventForm.svelte';

	interface Props {
		readerLang: ReaderLang;
		onclose: () => void; // à la fermeture : l'appelant recharge compteur, suggestions et liste
	}
	let { readerLang, onclose }: Props = $props();

	type Action = { path: string; kind: 'event'; eventId: number } | { path: string; kind: 'skip' };

	let items = $state<UnclassifiedItem[]>([]);
	let total = $state(0); // « restantes » au départ
	let idx = $state(0);
	let loading = $state(true);
	let failed = $state(false);
	let busy = $state(false);
	let lastEventId = $state<number | null>(null); // « comme la précédente »
	let history = $state<Action[]>([]);
	let undoUntil = $state(0);
	let undoTimer: ReturnType<typeof setTimeout> | undefined;
	let covering = $state<Record<string, EventDTO[]>>({});
	let formOpen = $state(false);
	let videoThumb = $state<string | null>(null);

	// Ordre : les jours avec le plus de photos d'abord (puis jour récent), photos d'un même jour côte à côte.
	function order(list: UnclassifiedItem[]): UnclassifiedItem[] {
		const counts = new Map<string, number>();
		for (const i of list) counts.set(i.day, (counts.get(i.day) ?? 0) + 1);
		return [...list].sort((a, b) => (counts.get(b.day)! - counts.get(a.day)!) || (a.day < b.day ? 1 : a.day > b.day ? -1 : 0) || (a.path < b.path ? -1 : 1));
	}

	async function load() {
		loading = true;
		failed = false;
		try {
			const all: UnclassifiedItem[] = [];
			let cursor: string | null = null;
			for (let page = 0; page < 8; page++) {
				const p = await fetchUnclassified(100, cursor);
				if (page === 0) total = p.total;
				all.push(...p.items);
				cursor = p.nextCursor;
				if (!cursor) break;
			}
			items = order(all);
			idx = 0;
		} catch {
			failed = true;
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void eventsStore.load();
		void load();
		const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onclose(); };
		window.addEventListener('keydown', esc);
		return () => { window.removeEventListener('keydown', esc); clearTimeout(undoTimer); };
	});

	const current = $derived(items[idx] ?? null);
	const remaining = $derived(Math.max(total - history.length, 0));

	// Évènements couvrant la date de la photo courante (auto_attach d'abord), mis en cache par jour.
	$effect(() => {
		const day = current?.day;
		if (!day || day in covering) return;
		fetchForDate(day).then((r) => { covering = { ...covering, [day]: r.events }; }).catch(() => { covering = { ...covering, [day]: [] }; });
	});

	// Vidéo : vignette FIXE (pas de lecture, pas d'autoplay).
	$effect(() => {
		videoThumb = null;
		const c = current;
		if (!c || c.kind !== 'video') return;
		let dead = false;
		signDownload(c.path).then((u) => generateVideoThumbnail(u)).then((b) => { if (!dead && b) videoThumb = URL.createObjectURL(b); }).catch(() => {});
		return () => { dead = true; };
	});

	const cover = $derived(current ? (covering[current.day] ?? []) : []);
	const recents = $derived(eventsStore.list.filter((e) => !cover.some((c) => c.id === e.id)).slice(0, 6));
	const byId = $derived(new Map([...eventsStore.list, ...Object.values(covering).flat()].map((e) => [e.id, e])));
	const nameOf = (e: EventDTO) => displayNames(e, readerLang);
	const prevEvent = $derived(lastEventId === null ? null : (byId.get(lastEventId) ?? null));

	function armUndo() {
		clearTimeout(undoTimer);
		undoUntil = Date.now() + 5000;
		undoTimer = setTimeout(() => (undoUntil = 0), 5000);
	}

	function fail(e: unknown) {
		toasts.push({ message: e instanceof EventApiError && e.status === 0 ? T.offlineAction.fr : T.genericError.fr, messageKh: e instanceof EventApiError && e.status === 0 ? T.offlineAction.kh : T.genericError.kh });
	}

	async function assign(ev: EventDTO) {
		const c = current;
		if (!c || busy) return;
		busy = true;
		try {
			const r = await addEventMedia(ev.id, [c.path], 'keep'); // jamais de déplacement silencieux
			if (r.skipped.length) {
				const other = byId.get(r.skipped[0].eventId);
				const msg = skippedMessage(1, other ? nameOf(other).primary : null, U);
				toasts.push({ message: msg.fr, messageKh: msg.kh, duration: 6000 });
			} else {
				lastEventId = ev.id;
				history = [...history, { path: c.path, kind: 'event', eventId: ev.id }];
			}
			idx++;
			armUndo();
		} catch (e) { fail(e); } finally { busy = false; }
	}

	async function skip() {
		const c = current;
		if (!c || busy) return;
		busy = true;
		try {
			await skipMedia([c.path]);
			history = [...history, { path: c.path, kind: 'skip' }];
			idx++;
			armUndo();
		} catch (e) { fail(e); } finally { busy = false; }
	}

	async function undo() {
		const a = history[history.length - 1];
		if (!a || busy) return;
		busy = true;
		try {
			if (a.kind === 'event') await removeEventMedia(a.eventId, [a.path]);
			else await skipMedia([a.path], true);
			history = history.slice(0, -1);
			idx = Math.max(idx - 1, 0);
			undoUntil = 0;
		} catch (e) { fail(e); } finally { busy = false; }
	}

	// --- Geste : ← passer, → même choix que la précédente (étiquette visible pendant le geste) ---
	let dx = $state(0);
	let startX = 0, startY = 0;
	let dragging = $state(false);
	const THRESHOLD = 90;

	function down(e: PointerEvent) { dragging = true; startX = e.clientX; startY = e.clientY; dx = 0; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); }
	function move(e: PointerEvent) {
		if (!dragging) return;
		const mx = e.clientX - startX, my = e.clientY - startY;
		if (Math.abs(my) > Math.abs(mx) * 1.2 && Math.abs(mx) < 20) return; // geste vertical : on laisse défiler
		dx = Math.max(Math.min(mx, 160), -160);
	}
	async function up() {
		if (!dragging) return;
		dragging = false;
		const d = dx;
		dx = 0;
		if (d <= -THRESHOLD) await skip();
		else if (d >= THRESHOLD) {
			if (prevEvent) await assign(prevEvent);
			else toasts.push({ message: T.noPrev.fr, messageKh: T.noPrev.kh, duration: 2500 });
		}
	}

	function created(ev: EventDTO) {
		formOpen = false;
		void assign(ev);
	}
</script>

<div class="sort" role="dialog" aria-modal="true" aria-label="{T.sortTitle.fr} · {T.sortTitle.kh}">
	<header class="bar">
		<button class="round" onclick={onclose} aria-label="{T.closeAction.fr} · {T.closeAction.kh}"><X size={22} /></button>
		<div class="count" aria-live="polite">
			<span class="count-n">{fillT(T.remaining.fr, { r: remaining, t: total })}</span>
			<span class="count-kh" lang="km">{fillT(T.remaining.kh, { r: remaining, t: total })}</span>
		</div>
		<span class="spacer"></span>
	</header>

	{#if loading}
		<p class="state">…</p>
	{:else if failed}
		<div class="state">
			<p>{T.loadError.fr}</p>
			<button class="primary" onclick={load}>{T.retry.fr} <span class="kh" lang="km">{T.retry.kh}</span></button>
		</div>
	{:else if !current}
		<div class="state">
			<p class="done">{T.allSorted.fr}</p>
			<p class="kh" lang="km">{T.allSorted.kh}</p>
			<button class="primary" onclick={onclose}>{T.closeAction.fr} <span class="kh" lang="km">{T.closeAction.kh}</span></button>
		</div>
	{:else}
		{@const r = formatRange(current.day, current.day)}
		{@const h = dayHeadingLong(current.day)}
		<div class="stage">
			<div class="hint left" style:opacity={Math.min(Math.max(-dx / THRESHOLD, 0), 1)}>{T.skip.fr} · <span lang="km">{T.skip.kh}</span></div>
			<div class="hint right" style:opacity={Math.min(Math.max(dx / THRESHOLD, 0), 1)}>
				{#if prevEvent}{T.sameAsPrev.fr} : {nameOf(prevEvent).primary}{:else}{T.noPrev.fr}{/if}
			</div>
			<div class="photo" style:transform="translateX({dx}px) rotate({dx / 40}deg)" style:transition={dragging ? 'none' : 'transform 0.2s ease'} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} role="img" aria-label={r.fr}>
				{#if current.kind === 'image'}
					<img src={ogImageUrl(current.path, 800)} alt="" draggable="false" />
				{:else if videoThumb}
					<img src={videoThumb} alt="" draggable="false" /><span class="vid"><Film size={18} /> {T.video.fr} · <span lang="km">{T.video.kh}</span></span>
				{:else}
					<div class="vph"><Film size={44} aria-hidden="true" /><span>{T.video.fr} · <span lang="km">{T.video.kh}</span></span></div>
				{/if}
			</div>
		</div>

		<div class="meta">
			<p class="date">{h.fr} {current.day.slice(0, 4)} · <span lang="km">{h.kh}</span></p>
			{#if current.uploadedBy}<p class="by">{fillT(T.sentBy.fr, { x: current.uploadedBy })}</p>{/if}
		</div>

		<div class="chips" role="group" aria-label={T.chooseEvent.fr}>
			{#each cover as e (e.id)}
				<button class="chip strong" disabled={busy} onclick={() => assign(e)}>{#if e.emoji}<span aria-hidden="true">{e.emoji}</span>{/if}<span lang={nameOf(e).primaryLang}>{nameOf(e).primary}</span></button>
			{/each}
			{#each recents as e (e.id)}
				<button class="chip" disabled={busy} onclick={() => assign(e)}>{#if e.emoji}<span aria-hidden="true">{e.emoji}</span>{/if}<span lang={nameOf(e).primaryLang}>{nameOf(e).primary}</span></button>
			{/each}
			<button class="chip new" disabled={busy} onclick={() => (formOpen = true)}><Plus size={20} aria-hidden="true" /> {T.newEvent.fr} <span lang="km">{T.newEvent.kh}</span></button>
		</div>

		<footer class="foot">
			<button class="skip" disabled={busy} onclick={skip}>{T.skip.fr} <span class="kh" lang="km">{T.skip.kh}</span></button>
			{#if undoUntil > Date.now() && history.length}
				<button class="undo" disabled={busy} onclick={undo}>{T.cancel.fr} <span class="kh" lang="km">{T.cancel.kh}</span></button>
			{/if}
		</footer>
	{/if}
</div>

<EventForm open={formOpen} event={null} initial={{ dateStart: current?.day, dateEnd: current?.day }} onclose={() => (formOpen = false)} onSaved={(ev) => created(ev)} />

<style>
	.sort {
		position: fixed; inset: 0; z-index: 90;
		background: var(--bg);
		display: flex; flex-direction: column;
		padding-top: env(safe-area-inset-top, 0px);
		padding-bottom: env(safe-area-inset-bottom, 0px);
		overflow: hidden;
	}
	.bar { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-3); flex-shrink: 0; }
	.round { width: var(--btn-tap); height: var(--btn-tap); border-radius: var(--radius-full); background: var(--surface); box-shadow: var(--shadow-sm); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
	.spacer { width: var(--btn-tap); flex-shrink: 0; }
	.count { flex: 1; text-align: center; display: flex; flex-direction: column; line-height: 1.2; }
	.count-n { font-family: var(--font-display); font-size: var(--fs-xl); font-weight: 600; }
	.count-kh { font-size: var(--fs-xl); color: var(--text-secondary); line-height: var(--lh-kh); }
	.state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-2); text-align: center; color: var(--text-secondary); padding: var(--space-4); }
	.done { font-family: var(--font-display); font-size: var(--fs-2xl); color: var(--text); }
	.kh { font-size: var(--fs-xl); }
	.primary { min-height: var(--btn-tap); padding: 0 var(--space-6); border-radius: var(--radius-full); background: linear-gradient(150deg, var(--accent), var(--accent-warm)); color: var(--on-accent); font-weight: 600; font-size: var(--fs-lg); display: flex; flex-direction: column; align-items: center; justify-content: center; margin-top: var(--space-3); }
	.stage { position: relative; flex: 1 1 0; min-height: 0; padding: 0 var(--space-4); display: flex; align-items: center; justify-content: center; }
	.photo { width: 100%; height: 100%; max-height: 100%; border-radius: var(--radius-pebble); overflow: hidden; background: var(--surface-2); box-shadow: var(--shadow-md); touch-action: pan-y; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; position: relative; display: flex; align-items: center; justify-content: center; }
	.photo img { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
	.vid, .vph { position: absolute; display: flex; align-items: center; gap: var(--space-2); }
	.vid { left: var(--space-3); bottom: var(--space-3); background: color-mix(in srgb, var(--bg) 90%, transparent); padding: 4px var(--space-3); border-radius: var(--radius-full); font-size: var(--fs-md); }
	.vid span, .vph span span { font-size: 1rem; }
	.vph { position: static; flex-direction: column; color: var(--muted-text); }
	.hint { position: absolute; top: var(--space-4); z-index: 2; max-width: 70%; padding: var(--space-2) var(--space-3); border-radius: var(--radius-full); background: var(--text); color: var(--bg); font-weight: 600; font-size: var(--fs-lg); pointer-events: none; opacity: 0; }
	.hint span { font-size: var(--fs-xl); }
	.hint.left { right: var(--space-6); }
	.hint.right { left: var(--space-6); background: var(--accent-deep); color: white; }
	.meta { padding: var(--space-2) var(--space-4) 0; text-align: center; flex-shrink: 0; }
	.date { font-family: var(--font-display); font-size: var(--fs-xl); font-weight: 600; }
	.date span { font-size: var(--fs-xl); }
	.by { font-size: var(--fs-md); color: var(--muted-text); }
	.chips { display: flex; flex-wrap: wrap; gap: var(--space-2); justify-content: center; padding: var(--space-2) var(--space-3); flex-shrink: 0; }
	.chip { min-height: var(--btn-tap); padding: 0 var(--space-4); border-radius: var(--radius-full); background: var(--raised); color: var(--text); font-size: var(--fs-xl); display: inline-flex; align-items: center; gap: var(--space-2); max-width: 100%; }
	.chip span[lang] { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.chip.strong { background: var(--accent); color: var(--on-accent); font-weight: 600; }
	.chip.new { background: var(--lavender); color: var(--on-lavender); font-weight: 600; }
	.chip:disabled { opacity: 0.6; }
	.foot { display: flex; gap: var(--space-3); justify-content: center; padding: var(--space-1) var(--space-4) var(--space-3); flex-shrink: 0; }
	.skip, .undo { min-height: 3rem; padding: 0 var(--space-6); border-radius: var(--radius-full); font-weight: 600; font-size: var(--fs-lg); display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.1; }
	.skip { background: var(--surface); color: var(--text); box-shadow: var(--shadow-sm); }
	.undo { background: var(--text); color: var(--bg); }
	.skip .kh, .undo .kh { font-size: var(--fs-xl); line-height: var(--lh-kh); }
</style>
