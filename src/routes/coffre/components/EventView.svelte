<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { ArrowLeft, Ellipsis, MapPin, Pencil, Trash2, Image as ImageIcon, X, ArrowRightLeft, WifiOff, Images } from 'lucide-svelte';
	import BottomSheet from '$lib/BottomSheet.svelte';
	import {
		ogImageUrl, signDownload, previewUrl, fetchReactions, saveReactions
	} from '$lib/api';
	import { eventsStore } from '$lib/events.svelte';
	import {
		fetchEventMedia, cachedEventMedia, removeEventMedia, addEventMedia, patchEvent, deleteEvent, EventApiError
	} from '$lib/events-api';
	import type { EventDTO } from '$lib/events-types';
	import { T } from '$lib/events-i18n';
	import { toasts } from '$lib/toast.svelte';
	import { Semaphore } from '$lib/semaphore';
	import { displayNames, formatRange, groupPathsByDay, dayHeading, colorStyle, type ReaderLang } from '$lib/events-ui';
	import FileTile from './FileTile.svelte';
	import FileViewer from './FileViewer.svelte';
	import EventPicker from './EventPicker.svelte';

	interface Props {
		eventId: number;
		readerLang: ReaderLang;
		onBack: () => void;
		onEdit: (ev: EventDTO) => void;
		onCreateFor: (paths: string[]) => void; // « Nouvel évènement » depuis « Déplacer vers… »
	}
	let { eventId, readerLang, onBack, onEdit, onCreateFor }: Props = $props();

	const ev = $derived(eventsStore.byId(eventId));
	let paths = $state<string[]>([]);
	let hidden = $state(new Set<string>()); // retirés en attente de confirmation (toast Annuler)
	let loading = $state(true);
	let failed = $state(false);
	let offline = $state(false);
	let menuOpen = $state(false);
	let moveOpen = $state(false);
	let selected = $state(new Set<string>());
	let coverPick = $state(false);
	let viewerIndex = $state<number | null>(null);

	const visible = $derived(paths.filter((p) => !hidden.has(p)));
	const days = $derived(groupPathsByDay(visible));
	const selectionMode = $derived(selected.size > 0 || coverPick);

	const urlSemaphore = new Semaphore(3);
	const urlCache = new SvelteMap<string, string>();
	async function getUrl(name: string) {
		const c = urlCache.get(name);
		if (c) return c;
		const u = await urlSemaphore.run(() => signDownload(name));
		urlCache.set(name, u);
		return u;
	}

	// Les vignettes de vidéos ont besoin de l'URL signée ; les images passent par og-image.
	$effect(() => {
		for (const p of visible.filter((x) => /\.(mp4|mov|webm|avi|mkv)$/i.test(x)).slice(0, 12)) {
			if (!urlCache.has(p)) getUrl(p).catch(() => {});
		}
	});

	async function loadMedia() {
		loading = true;
		failed = false;
		try {
			paths = await fetchEventMedia(eventId);
			offline = false;
		} catch (e) {
			offline = e instanceof EventApiError && e.status === 0;
			if (paths.length === 0) failed = !offline;
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		const c = cachedEventMedia(eventId);
		if (c) paths = c;
		if (!eventsStore.hydrated || !ev) void eventsStore.load();
		void loadMedia();
	});

	function toggle(p: string) {
		const s = new Set(selected);
		if (s.has(p)) s.delete(p); else s.add(p);
		selected = s;
	}
	function clearSelection() { selected = new Set(); coverPick = false; }

	function tap(p: string, idx: number) {
		if (selectionMode) toggle(p); else viewerIndex = idx;
	}

	function guardOnline(): boolean {
		if (typeof navigator !== 'undefined' && navigator.onLine === false) {
			toasts.push({ message: T.offlineAction.fr, messageKh: T.offlineAction.kh });
			return false;
		}
		return true;
	}

	function fail(e: unknown) {
		if (e instanceof EventApiError && e.status === 409 && e.current) {
			eventsStore.upsert(e.current);
			toasts.push({ message: T.conflict.fr, messageKh: T.conflict.kh });
		} else {
			toasts.push({ message: T.genericError.fr, messageKh: T.genericError.kh });
		}
	}

	// Retrait : masqué tout de suite, requête envoyée à l'expiration du toast (Annuler 5 s).
	function removeSelected() {
		if (!guardOnline()) return;
		const gone = [...selected];
		hidden = new Set([...hidden, ...gone]);
		clearSelection();
		toasts.push({
			message: T.removed.fr, messageKh: T.removed.kh, actionLabel: T.cancel.fr, actionLabelKh: T.cancel.kh, duration: 5000,
			onAction: () => { const h = new Set(hidden); gone.forEach((g) => h.delete(g)); hidden = h; },
			onExpire: async () => {
				try { await removeEventMedia(eventId, gone); await loadMedia(); void eventsStore.load(); }
				catch (e) { const h = new Set(hidden); gone.forEach((g) => h.delete(g)); hidden = h; fail(e); }
			}
		});
	}

	async function moveTo(target: EventDTO) {
		moveOpen = false;
		if (!guardOnline()) return;
		const moving = [...selected];
		try {
			await addEventMedia(target.id, moving);
			clearSelection();
			toasts.push({ message: T.moved.fr, messageKh: T.moved.kh });
			await loadMedia();
			void eventsStore.load();
		} catch (e) { fail(e); }
	}

	async function setCover(path: string | null) {
		if (!ev || !guardOnline()) return;
		try {
			const updated = await patchEvent(ev.id, { ifVersion: ev.version, coverPath: path });
			eventsStore.upsert(updated);
			clearSelection();
			toasts.push({ message: T.coverSet.fr, messageKh: T.coverSet.kh });
		} catch (e) { fail(e); }
	}

	function startCoverPick() { menuOpen = false; selected = new Set(); coverPick = true; }

	function confirmCover() {
		const [p] = [...selected];
		if (p) void setCover(p);
	}

	function deleteThisEvent() {
		menuOpen = false;
		if (!ev || !guardOnline()) return;
		const snapshot = ev;
		eventsStore.remove(snapshot.id);
		onBack();
		toasts.push({
			message: T.deleted.fr, messageKh: T.deleted.kh, actionLabel: T.cancel.fr, actionLabelKh: T.cancel.kh, duration: 5000,
			onAction: () => eventsStore.upsert(snapshot),
			onExpire: async () => {
				try { await deleteEvent(snapshot.id); }
				catch (e) { eventsStore.upsert(snapshot); fail(e); }
			}
		});
	}

	// --- Viewer : réactions chargées à l'ouverture pour les jours de l'évènement ---
	let dayReactions = $state<Record<string, Record<string, string[]>>>({});
	const viewerReactions = $derived.by(() => {
		const merged: Record<string, string[]> = {};
		for (const r of Object.values(dayReactions)) Object.assign(merged, r);
		return merged;
	});

	async function openViewer(i: number) {
		viewerIndex = i;
		const missing = days.map((d) => d.date).filter((d) => !(d in dayReactions)).slice(0, 12);
		const loaded = await Promise.all(missing.map(async (d) => [d, await fetchReactions(...(d.split('-') as [string, string, string]))] as const));
		dayReactions = { ...dayReactions, ...Object.fromEntries(loaded) };
	}

	async function toggleReaction(path: string, emoji: string) {
		const [y, m, d, file] = path.split('/');
		const key = `${y}-${m}-${d}`;
		const cur = dayReactions[key] ?? {};
		const list = cur[file] ?? [];
		const next = { ...cur, [file]: list.includes(emoji) ? list.filter((e) => e !== emoji) : [...list, emoji] };
		dayReactions = { ...dayReactions, [key]: next };
		try { await saveReactions(y, m, d, next); } catch { /* le prochain rechargement rétablit l'état serveur */ }
	}

	function shareLink(path: string) {
		const [y, m, d, f] = path.split('/');
		const url = previewUrl(y, m, d, f);
		if (navigator.share) void navigator.share({ url }).catch(() => {});
		else navigator.clipboard.writeText(url).catch(() => {});
	}
	function copyLink(path: string) {
		const [y, m, d, f] = path.split('/');
		navigator.clipboard.writeText(previewUrl(y, m, d, f)).catch(() => {});
	}

	const flat = $derived(days.flatMap((d) => d.paths));
	const names = $derived(ev ? displayNames(ev, readerLang) : null);
	const range = $derived(ev ? formatRange(ev.dates.start, ev.dates.end) : null);
</script>

<div class="event-view">
	{#if ev && names && range}
		<header class="hero" style={colorStyle(ev.color)}>
			{#if ev.cover}<img src={ogImageUrl(ev.cover, 800)} alt="" />{/if}
			<span class="veil"></span>
			<button class="round back" onclick={onBack} aria-label="{T.back.fr} · {T.back.kh}"><ArrowLeft size={22} /></button>
			<button class="round more" onclick={() => (menuOpen = true)} aria-label="{T.more.fr} · {T.more.kh}"><Ellipsis size={22} /></button>
			<div class="hero-txt">
				{#if ev.emoji}<span class="emoji" aria-hidden="true">{ev.emoji}</span>{/if}
				<h2 class="title" lang={names.primaryLang}>{names.primary}</h2>
				{#if names.secondary}<p class="title2" lang={names.secondaryLang}>{names.secondary}</p>{/if}
				<p class="meta">
					{readerLang === 'kh' ? range.kh : range.fr}
					{#if ev.place}· <MapPin size={14} aria-hidden="true" /> {ev.place}{/if}
					· <Images size={14} aria-hidden="true" /> {visible.length}
				</p>
				{#if ev.namesPending}<p class="pending">{T.translating.fr} · <span lang="km">{T.translating.kh}</span></p>{/if}
			</div>
		</header>
	{:else}
		<header class="hero plain">
			<button class="round back" onclick={onBack} aria-label="{T.back.fr} · {T.back.kh}"><ArrowLeft size={22} /></button>
		</header>
	{/if}

	{#if offline}
		<div class="banner" role="status"><WifiOff size={16} aria-hidden="true" /> {T.offline.fr} · <span lang="km">{T.offline.kh}</span></div>
	{/if}

	{#if selectionMode}
		<div class="selbar">
			<span class="count">
				{#if coverPick && selected.size === 0}<span>{T.coverHint.fr}</span><span class="kh" lang="km">{T.coverHint.kh}</span>
				{:else}{selected.size} {T.selected.fr}{/if}
			</span>
			<div class="acts">
				{#if coverPick}
					<button class="act" disabled={selected.size !== 1} onclick={confirmCover}><ImageIcon size={20} /><span>{T.cover.fr}</span><span class="kh" lang="km">{T.cover.kh}</span></button>
				{:else}
					<button class="act" onclick={removeSelected}><X size={20} /><span>{T.remove.fr}</span><span class="kh" lang="km">{T.remove.kh}</span></button>
					<button class="act" onclick={() => (moveOpen = true)}><ArrowRightLeft size={20} /><span>{T.moveTo.fr.replace('…', '')}</span><span class="kh" lang="km">{T.moveTo.kh.replace('…', '')}</span></button>
					<button class="act" disabled={selected.size !== 1} onclick={() => { const [p] = [...selected]; void setCover(p); }}><ImageIcon size={20} /><span>{T.cover.fr}</span><span class="kh" lang="km">{T.cover.kh}</span></button>
				{/if}
				<button class="act ghost" onclick={clearSelection}><span>{T.cancel.fr}</span><span class="kh" lang="km">{T.cancel.kh}</span></button>
			</div>
		</div>
	{/if}

	<div class="body">
		{#if loading && paths.length === 0}
			<div class="grid" aria-busy="true">{#each [1, 2, 3, 4, 5, 6] as n (n)}<div class="cell ghost"></div>{/each}</div>
		{:else if failed}
			<div class="state">
				<p>{T.loadError.fr}</p><p class="kh" lang="km">{T.loadError.kh}</p>
				<button class="retry" onclick={loadMedia}>{T.retry.fr} <span class="kh" lang="km">{T.retry.kh}</span></button>
			</div>
		{:else if visible.length === 0}
			<div class="state">
				<p class="state-title">{T.emptyEvent.fr}</p>
				<p class="kh" lang="km">{T.emptyEvent.kh}</p>
				<p class="hint">{T.emptyEventHint.fr}</p>
				<p class="kh hint" lang="km">{T.emptyEventHint.kh}</p>
			</div>
		{:else}
			{#each days as d (d.date)}
				{@const h = dayHeading(d.date)}
				<section>
					<h3 class="day">{h.fr} · <span lang="km">{h.kh}</span> <span class="n">{d.paths.length}</span></h3>
					<div class="grid">
						{#each d.paths as p (p)}
							<div class="cell">
								<FileTile
									name={p}
									signedUrl={urlCache.get(p) ?? null}
									uploader={null}
									reactions={[]}
									selected={selected.has(p)}
									{selectionMode}
									thumbWidth={300}
									onTap={() => void openViewer(flat.indexOf(p))}
									onLongPress={() => toggle(p)}
								/>
							</div>
						{/each}
					</div>
				</section>
			{/each}
		{/if}
	</div>

	{#if viewerIndex !== null}
		<FileViewer
			items={flat.map((p) => ({ name: p, signedUrl: urlCache.get(p) ?? null }))}
			initialIndex={viewerIndex}
			reactions={viewerReactions}
			hasPrevDay={false}
			hasNextDay={false}
			onClose={() => (viewerIndex = null)}
			onReactionToggle={toggleReaction}
			onGetUrl={getUrl}
			onShare={shareLink}
			onCopyLink={copyLink}
			onPrevDay={() => {}}
			onNextDay={() => {}}
		/>
	{/if}
</div>

<BottomSheet open={menuOpen} onclose={() => (menuOpen = false)}>
	<div class="menu">
		<button class="mi" onclick={() => { menuOpen = false; if (ev) onEdit(ev); }}><Pencil size={20} /> {T.edit.fr} <span class="kh" lang="km">{T.edit.kh}</span></button>
		<button class="mi" onclick={startCoverPick}><ImageIcon size={20} /> {T.cover.fr} <span class="kh" lang="km">{T.cover.kh}</span></button>
		<button class="mi" onclick={() => { menuOpen = false; void setCover(null); }}><ImageIcon size={20} /> {T.autoCover.fr} <span class="kh" lang="km">{T.autoCover.kh}</span></button>
		<button class="mi danger" onclick={deleteThisEvent}><Trash2 size={20} /> {T.delete.fr} <span class="kh" lang="km">{T.delete.kh}</span></button>
	</div>
</BottomSheet>

<EventPicker
	open={moveOpen}
	mode="move"
	date={null}
	excludeId={eventId}
	{readerLang}
	onPick={(t) => void moveTo(t)}
	onCreate={() => { moveOpen = false; onCreateFor([...selected]); }}
	onclose={() => (moveOpen = false)}
/>

<style>
	.event-view { display: flex; flex-direction: column; height: 100%; overflow-y: auto; -webkit-overflow-scrolling: touch; padding-bottom: calc(var(--nav-height) + env(safe-area-inset-bottom, 0px) + var(--space-8)); }
	.hero {
		position: relative;
		aspect-ratio: 16 / 9;
		min-height: 11rem;
		flex-shrink: 0;
		background: var(--ev-bg, var(--raised));
		overflow: hidden;
		border-radius: 0 0 var(--radius-xl) var(--radius-xl);
	}
	.hero.plain { aspect-ratio: auto; min-height: 4rem; }
	.hero img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
	.veil { position: absolute; inset: 0; background: linear-gradient(to top, color-mix(in srgb, var(--bg) 96%, transparent) 30%, color-mix(in srgb, var(--bg) 30%, transparent)); }
	.round {
		position: absolute; top: var(--space-3); width: var(--btn-tap); height: var(--btn-tap);
		border-radius: var(--radius-full); background: color-mix(in srgb, var(--surface) 88%, transparent);
		display: flex; align-items: center; justify-content: center; color: var(--text); box-shadow: var(--shadow-sm); z-index: 2;
	}
	.back { left: var(--space-3); }
	.more { right: var(--space-3); }
	.hero-txt { position: absolute; left: var(--space-4); right: var(--space-4); bottom: var(--space-3); display: flex; flex-direction: column; gap: 2px; color: var(--text); }
	.emoji { font-size: 1.6rem; line-height: 1; }
	.title { font-family: var(--font-display); font-size: var(--fs-3xl); font-weight: 600; line-height: 1.2; }
	.title:lang(km) { line-height: var(--lh-kh); }
	.title2 { font-size: var(--fs-xl); color: var(--text-secondary); line-height: 1.3; }
	.title2:lang(km) { line-height: var(--lh-kh); }
	.meta { font-size: var(--fs-md); color: var(--text-secondary); display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
	.pending { font-size: var(--fs-base); color: var(--gold-text); }
	.banner { display: flex; align-items: center; gap: var(--space-2); margin: var(--space-3) var(--space-4) 0; padding: var(--space-2) var(--space-3); background: var(--peach); color: var(--peach-text); border-radius: var(--radius-md); font-size: var(--fs-md); }
	.selbar { position: sticky; top: 0; z-index: 3; display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-2) var(--space-3); background: var(--surface); border-bottom: 1px solid var(--border); box-shadow: var(--shadow-sm); }
	.count { font-size: var(--fs-md); display: flex; flex-direction: column; }
	.count .kh { font-size: var(--fs-lg); }
	.acts { display: flex; gap: var(--space-1); }
	.act { flex: 1; min-height: 3.25rem; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: var(--radius-md); background: var(--raised); color: var(--on-accent); font-size: var(--fs-sm); line-height: 1.15; padding: var(--space-1); }
	.act .kh { font-size: var(--fs-md); line-height: var(--lh-kh); }
	.act.ghost { background: none; color: var(--text-secondary); }
	.act:disabled { opacity: 0.45; }
	.body { padding: var(--space-3) var(--space-1) 0; display: flex; flex-direction: column; gap: var(--space-4); }
	.day { font-family: var(--font-display); font-size: var(--fs-xl); font-weight: 600; padding: 0 var(--space-3) var(--space-2); display: flex; align-items: baseline; gap: var(--space-1); }
	.day span[lang='km'] { font-size: var(--fs-xl); }
	.day .n { margin-left: auto; font-size: var(--fs-md); color: var(--muted-text); font-weight: 400; font-family: Inter, sans-serif; }
	.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-1); }
	.cell { aspect-ratio: 1; min-width: 0; }
	.cell.ghost { background: color-mix(in srgb, var(--accent) 10%, var(--card)); border-radius: var(--radius-sm); }
	.state { display: flex; flex-direction: column; align-items: center; gap: var(--space-2); padding: var(--space-8) var(--space-4); text-align: center; color: var(--text-secondary); }
	.state .kh { font-size: var(--fs-xl); }
	.state-title { font-family: var(--font-display); font-size: var(--fs-xl); color: var(--text); }
	.hint { font-size: var(--fs-md); }
	.hint.kh { font-size: var(--fs-lg); }
	.retry { min-height: var(--btn-tap); padding: 0 var(--space-6); border-radius: var(--radius-full); background: var(--accent); color: var(--on-accent); font-weight: 600; display: inline-flex; gap: var(--space-2); align-items: center; }
	.menu { display: flex; flex-direction: column; gap: var(--space-1); }
	.mi { display: flex; align-items: center; gap: var(--space-3); min-height: 3.25rem; padding: 0 var(--space-3); border-radius: var(--radius-md); font-size: var(--fs-lg); text-align: left; background: var(--surface-2); }
	.mi .kh { font-size: var(--fs-xl); color: var(--text-secondary); }
	.mi.danger { color: var(--accent-text); }
</style>
