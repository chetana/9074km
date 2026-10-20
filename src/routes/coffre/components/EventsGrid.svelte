<script lang="ts">
	import { onMount } from 'svelte';
	import { Search, Plus, WifiOff, CalendarHeart, MapPin, Images, Ellipsis, Download, Languages, GalleryHorizontal, LayoutGrid, CalendarDays, ChevronDown, Check, X } from 'lucide-svelte';
	import BottomSheet from '$lib/BottomSheet.svelte';
	import { toasts } from '$lib/toast.svelte';
	import { ogImageUrl } from '$lib/api';
	import { eventsStore } from '$lib/events.svelte';
	import { fetchUnclassified, fetchSuggestions, downloadExport, EventApiError } from '$lib/events-api';
	import type { SuggestionDTO, EventDTO } from '$lib/events-types';
	import SuggestionCard from './SuggestionCard.svelte';
	import { suggestionBar } from '$lib/suggestion-bar.svelte';
	import EventCarousel from './EventCarousel.svelte';
	import { T } from '$lib/events-i18n';
	import { MONTHS_FR, MONTHS_KH } from '$lib/i18n';
	import {
		displayNames, formatRange, sortEvents, groupByMonth, matchesQuery, yearsOf, placesOf, samePlace, colorStyle, type ReaderLang
	} from '$lib/events-ui';

	interface Props {
		readerLang: ReaderLang;
		onOpen: (id: number) => void;
		onCreate: () => void;
	}
	let { readerLang, onOpen, onCreate }: Props = $props();

	// Compteur « à classer » (masqué à 0 ou si l'index est indisponible) : le chip ouvre le mode tri, chargé à la demande
	// (chunk dynamique : il ne pèse rien tant qu'on ne trie pas).
	let unclassified = $state(0);
	let SortComp = $state<any>(null);
	let sortOpen = $state(false);
	async function loadUnclassified() {
		try { unclassified = (await fetchUnclassified(1)).total; } catch { unclassified = 0; }
	}
	async function openSort() {
		SortComp ??= (await import('./SortMode.svelte')).default;
		sortOpen = true;
	}
	function closeSort() {
		sortOpen = false;
		void refreshAll();
	}

	// Une suggestion à la fois (la plus fournie) ; refus et ajouts rechargent la liste.
	let suggestions = $state<SuggestionDTO[]>([]);
	async function loadSuggestions() {
		try { suggestions = await fetchSuggestions(); } catch { suggestions = []; }
	}
	function refreshAll() {
		void loadUnclassified();
		void loadSuggestions();
		void eventsStore.load();
	}

	// Menu ⋯ : export JSON des évènements (6 par heure et par utilisateur côté serveur)
	let menuOpen = $state(false);
	async function doExport() {
		menuOpen = false;
		try { await downloadExport(); }
		catch (e) {
			const limited = e instanceof EventApiError && e.status === 429;
			toasts.push(limited ? { message: T.exportLimit.fr, messageKh: T.exportLimit.kh } : { message: T.genericError.fr, messageKh: T.genericError.kh });
		}
	}

	let query = $state('');
	let year = $state<number | null>(null);
	let place = $state<string | null>(null);

	// Vue par défaut : carrousel « Album » ; la grille reste le secours. Choix mémorisé (localStorage facultatif).
	const VIEW_KEY = 'coffre-events-view';
	let view = $state<'album' | 'grid'>('album');
	function setView(v: 'album' | 'grid') {
		view = v;
		try { localStorage.setItem(VIEW_KEY, v); } catch { /* stockage indisponible : la page marche sans */ }
	}

	onMount(() => {
		try { if (localStorage.getItem(VIEW_KEY) === 'grid') view = 'grid'; } catch { /* idem */ }
		void eventsStore.load(); void loadUnclassified(); void loadSuggestions();
	});

	// Choix des fenêtres : années (comptées selon le lieu choisi) et lieux (comptés sur l'année choisie).
	const inYear = (e: EventDTO, y: number | null) => y === null || Number(e.dates.start.slice(0, 4)) === y;
	const yearOptions = $derived(
		yearsOf(eventsStore.list)
			.map((y) => ({ y, n: eventsStore.list.filter((e) => inYear(e, y) && (place === null || samePlace(e, place))).length }))
			.filter((o) => o.n > 0 || o.y === year)
	);
	const placeOptions = $derived(placesOf(eventsStore.list.filter((e) => inYear(e, year))));
	const placeLabel = $derived(place === null ? null : (placesOf(eventsStore.list).find((p) => p.key === place)?.label ?? place));
	let yearOpen = $state(false);
	let placeOpen = $state(false);
	function pickYear(y: number) {
		year = year === y ? null : y;
		const pl = place;
		if (pl !== null && !eventsStore.list.some((e) => inYear(e, year) && samePlace(e, pl))) place = null;
		yearOpen = false;
	}
	function pickPlace(key: string) {
		place = place === key ? null : key;
		placeOpen = false;
	}
	function clearAll() { year = null; place = null; yearOpen = false; placeOpen = false; }

	// Suggestions : un bouton à droite du chip « à classer », la liste complète dans une fenêtre.
	let suggOpen = $state(false);
	$effect(() => { if (suggOpen && suggestions.length === 0) suggOpen = false; });
	// Le bouton vit dans la barre du haut : on lui donne le compteur et l'ouverture de la fenêtre.
	$effect(() => {
		suggestionBar.count = suggestions.length;
		suggestionBar.open = () => (suggOpen = true);
		return () => { suggestionBar.count = 0; suggestionBar.open = null; };
	});
	$effect(() => {
		suggestionBar.todo = unclassified;
		suggestionBar.openSort = () => void openSort();
		return () => { suggestionBar.todo = 0; suggestionBar.openSort = null; };
	});
	const total = $derived(eventsStore.list.length);
	const shown = $derived(
		sortEvents(
			eventsStore.list.filter(
				(e) => matchesQuery(e, query) && (year === null || Number(e.dates.start.slice(0, 4)) === year) && (place === null || samePlace(e, place))
			)
		)
	);
	const groups = $derived(groupByMonth(shown));
	const countText = $derived(
		shown.length === total
			? { fr: T.eventsCount.fr.replace('{n}', String(total)), kh: T.eventsCount.kh.replace('{n}', String(total)) }
			: { fr: T.eventsOf.fr.replace('{n}', String(shown.length)).replace('{m}', String(total)), kh: T.eventsOf.kh.replace('{n}', String(shown.length)).replace('{m}', String(total)) }
	);
	const showSkeleton = $derived(eventsStore.loading && total === 0);
</script>

<div class="events">
	<div class="controls">
		<label class="search">
			<Search size={18} aria-hidden="true" />
			<input type="search" placeholder="{T.search.fr} · {T.search.kh}" bind:value={query} aria-label={T.search.fr} enterkeyhint="search" />
		</label>
		<button class="new-btn" onclick={onCreate} aria-label="{T.newEvent.fr} · {T.newEvent.kh}" title="{T.newEvent.fr} · {T.newEvent.kh}">
			<Plus size={24} />
		</button>
		<button class="view-btn" onclick={() => setView(view === 'album' ? 'grid' : 'album')} aria-label={view === 'album' ? `${T.viewGrid.fr} · ${T.viewGrid.kh}` : `${T.viewAlbum.fr} · ${T.viewAlbum.kh}`} title={view === 'album' ? `${T.viewGrid.fr} · ${T.viewGrid.kh}` : `${T.viewAlbum.fr} · ${T.viewAlbum.kh}`}>
			{#if view === 'album'}<LayoutGrid size={22} />{:else}<GalleryHorizontal size={22} />{/if}
		</button>
		<button class="more-btn" onclick={() => (menuOpen = true)} aria-label="{T.more.fr} · {T.more.kh}" title="{T.more.fr} · {T.more.kh}">
			<Ellipsis size={22} />
		</button>
	</div>

	{#if total > 0}
		<div class="filters">
			<div class="fbtn" class:on={year !== null}>
				<button class="fmain" onclick={() => (yearOpen = true)} aria-haspopup="dialog" aria-label="{T.filterYear.fr} · {T.filterYear.kh}{year !== null ? ` : ${year}` : ''}">
					<CalendarDays size={18} aria-hidden="true" />
					{#if year === null}<span class="ft"><span>{T.allYearsLong.fr}</span><span class="kh" lang="km">{T.allYearsLong.kh}</span></span>{:else}<span class="ft one">{year}</span>{/if}
					<ChevronDown size={16} aria-hidden="true" />
				</button>
				{#if year !== null}<button class="fx" onclick={() => (year = null)} aria-label="{T.clearFilter.fr} · {T.clearFilter.kh} ({T.filterYear.fr})"><X size={18} /></button>{/if}
			</div>
			<div class="fbtn" class:on={place !== null}>
				<button class="fmain" onclick={() => (placeOpen = true)} aria-haspopup="dialog" aria-label="{T.filterPlace.fr} · {T.filterPlace.kh}{place !== null ? ` : ${placeLabel}` : ''}">
					<MapPin size={18} aria-hidden="true" />
					{#if place === null}<span class="ft"><span>{T.allPlaces.fr}</span><span class="kh" lang="km">{T.allPlaces.kh}</span></span>{:else}<span class="ft one">{placeLabel}</span>{/if}
					<ChevronDown size={16} aria-hidden="true" />
				</button>
				{#if place !== null}<button class="fx" onclick={() => (place = null)} aria-label="{T.clearFilter.fr} · {T.clearFilter.kh} ({T.filterPlace.fr})"><X size={18} /></button>{/if}
			</div>
		</div>
	{/if}

	{#if eventsStore.offline}
		<div class="banner" role="status">
			<WifiOff size={16} aria-hidden="true" />
			<span>{T.offline.fr} · <span lang="km">{T.offline.kh}</span></span>
		</div>
	{/if}

	{#if showSkeleton}
		<div class="grid" aria-busy="true">
			{#each [1, 2, 3, 4] as n (n)}<div class="card ghost"></div>{/each}
		</div>
	{:else if eventsStore.failed}
		<div class="state">
			<p>{T.loadError.fr}</p>
			<p class="kh" lang="km">{T.loadError.kh}</p>
			<button class="primary" onclick={() => eventsStore.load()}>
				<span>{T.retry.fr}</span> <span class="kh" lang="km">{T.retry.kh}</span>
			</button>
		</div>
	{:else if total === 0}
		<div class="state">
			<CalendarHeart size={44} class="state-icon" aria-hidden="true" />
			<p class="state-title">{T.noEvents.fr}</p>
			<p class="kh state-kh" lang="km">{T.noEvents.kh}</p>
			<button class="primary" onclick={onCreate}>
				<span class="fr-l"><Plus size={18} /> {T.noEventsCta.fr}</span> <span class="kh" lang="km">{T.noEventsCta.kh}</span>
			</button>
		</div>
	{:else if shown.length === 0}
		<p class="count" role="status">{countText.fr} · <span lang="km">{countText.kh}</span></p>
		<div class="state empty-filter"><p>{T.noEventsFilter.fr}</p><p class="kh" lang="km">{T.noEventsFilter.kh}</p></div>
	{:else if view === 'album'}
		<p class="count" role="status">{countText.fr} · <span lang="km">{countText.kh}</span></p>
		<EventCarousel events={shown} {readerLang} {onOpen} />
	{:else}
		<p class="count" role="status">{countText.fr} · <span lang="km">{countText.kh}</span></p>
		{#each groups as g (g.key)}
			<h3 class="sep" class:up={g.upcoming}>
				{#if g.upcoming}
					{T.upcoming.fr} · <span class="kh" lang="km">{T.upcoming.kh}</span>
				{:else}
					{MONTHS_FR[g.month - 1]} {g.year} · <span class="kh" lang="km">{MONTHS_KH[g.month - 1]} {g.year}</span>
				{/if}
			</h3>
			<div class="grid">
				{#each g.events as e (e.id)}
					{@const n = displayNames(e, readerLang)}
					{@const r = formatRange(e.dates.start, e.dates.end)}
					<button class="card" class:upcoming={e.upcoming} style={colorStyle(e.color)} onclick={() => onOpen(e.id)}>
						{#if e.cover}
							<img src={ogImageUrl(e.cover, 400)} alt="" loading="lazy" />
						{:else if e.emoji}
							<span class="big-emoji" aria-hidden="true">{e.emoji}</span>
						{/if}
						{#if e.upcoming}
							<span class="veil"></span>
							<span class="badge"><span class="b-fr">{T.upcoming.fr}</span><span lang="km">{T.upcoming.kh}</span></span>
						{:else if e.namesPending}
							<span class="badge pend-badge" title="{T.translating.fr} · {T.translating.kh}"><Languages size={16} aria-hidden="true" /><span lang="km">{T.translatingShort.kh}</span></span>
						{:else if e.emoji && e.cover}
							<span class="mini-emoji" aria-hidden="true">{e.emoji}</span>
						{/if}
						<span class="caption">
							<span class="name" lang={n.primaryLang}>{n.primary}</span>
							{#if n.secondary}<span class="name2" lang={n.secondaryLang}>{n.secondary}</span>{/if}
							<span class="meta" lang={readerLang === 'kh' ? 'km' : 'fr'}>{readerLang === 'kh' ? r.kh : r.fr}</span>
							<span class="meta"><Images size={13} aria-hidden="true" /> {e.count}{#if e.place}&nbsp;· <MapPin size={13} aria-hidden="true" /> {e.place}{/if}</span>
						</span>
					</button>
				{/each}
			</div>
		{/each}
	{/if}
</div>

{#if sortOpen && SortComp}
	<SortComp {readerLang} onclose={closeSort} />
{/if}

<BottomSheet open={menuOpen} onclose={() => (menuOpen = false)}>
	<button class="mi" onclick={doExport}><Download size={20} /><span class="mi-txt"><span>{T.exportAction.fr}</span><span class="kh" lang="km">{T.exportAction.kh}</span></span></button>
</BottomSheet>

<BottomSheet open={yearOpen} onclose={() => (yearOpen = false)}>
	<div class="opts" role="listbox" aria-label="{T.chooseYear.fr} · {T.chooseYear.kh}">
		<h2 class="opt-title">{T.chooseYear.fr} · <span class="kh" lang="km">{T.chooseYear.kh}</span></h2>
		{#each yearOptions as o (o.y)}
			<button class="opt" class:on={year === o.y} role="option" aria-selected={year === o.y} onclick={() => pickYear(o.y)}>
				{#if year === o.y}<Check size={20} aria-hidden="true" />{:else}<span class="ph"></span>{/if}
				<span class="ol">{o.y}</span><span class="oc">{o.n}</span>
			</button>
		{/each}
		{#if year !== null || place !== null}<button class="opt clear" onclick={clearAll}><X size={20} aria-hidden="true" /><span class="ol">{T.clearAll.fr} · <span class="kh" lang="km">{T.clearAll.kh}</span></span></button>{/if}
	</div>
</BottomSheet>

<BottomSheet open={placeOpen} onclose={() => (placeOpen = false)}>
	<div class="opts" role="listbox" aria-label="{T.choosePlace.fr} · {T.choosePlace.kh}">
		<h2 class="opt-title">{T.choosePlace.fr} · <span class="kh" lang="km">{T.choosePlace.kh}</span></h2>
		{#each placeOptions as p (p.key)}
			<button class="opt" class:on={place === p.key} role="option" aria-selected={place === p.key} onclick={() => pickPlace(p.key)}>
				{#if place === p.key}<Check size={20} aria-hidden="true" />{:else}<span class="ph"></span>{/if}
				<span class="ol">{p.label}</span><span class="oc">{p.count}</span>
			</button>
		{/each}
		{#if year !== null || place !== null}<button class="opt clear" onclick={clearAll}><X size={20} aria-hidden="true" /><span class="ol">{T.clearAll.fr} · <span class="kh" lang="km">{T.clearAll.kh}</span></span></button>{/if}
	</div>
</BottomSheet>

<BottomSheet open={suggOpen} onclose={() => (suggOpen = false)}>
	<div class="sugg-list">
		{#each suggestions as s (s.start + s.end)}
			<SuggestionCard suggestion={s} {readerLang} onDone={refreshAll} />
		{/each}
	</div>
</BottomSheet>

<style>
	.events {
		padding: var(--space-3) var(--space-4) calc(var(--nav-height) + env(safe-area-inset-bottom, 0px) + var(--space-8));
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.controls { display: flex; gap: var(--space-2); }
	.search {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--btn-tap);
		padding: 0 var(--space-3);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		color: var(--muted-text);
	}
	.search input { flex: 1; min-width: 0; border: none; background: none; outline: none; font-size: 1rem; color: var(--text); }
	.more-btn, .view-btn { width: var(--btn-tap); height: var(--btn-tap); border-radius: var(--radius-full); background: var(--surface); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--text-secondary); }
	.mi { display: flex; align-items: center; gap: var(--space-3); min-height: 3.25rem; padding: 0 var(--space-3); border-radius: var(--radius-md); font-size: var(--fs-lg); text-align: left; background: var(--surface-2); width: 100%; }
	.mi .kh { font-size: var(--fs-xl); color: var(--text-secondary); }
	.mi-txt { display: flex; flex-direction: column; line-height: 1.25; min-width: 0; }
	.new-btn {
		width: var(--btn-tap);
		height: var(--btn-tap);
		justify-content: center;
		display: flex;
		align-items: center;
		border-radius: var(--radius-full);
		background: linear-gradient(150deg, var(--accent), var(--accent-warm));
		color: var(--on-accent);
		box-shadow: var(--shadow-accent);
		flex-shrink: 0;
		font-weight: 600;
	}
	.sugg-list { display: flex; flex-direction: column; gap: var(--space-3); }
	.filters { display: flex; gap: var(--space-2); }
	.fbtn { flex: 1; min-width: 0; display: flex; align-items: stretch; border-radius: var(--radius-full); background: var(--raised); color: var(--text-secondary); }
	.fbtn.on { background: var(--accent); color: var(--on-accent); font-weight: 600; }
	.fmain { flex: 1; min-width: 0; min-height: var(--btn-tap); display: flex; align-items: center; gap: var(--space-2); padding: 0 var(--space-3); text-align: left; }
	.ft { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.15; font-size: var(--fs-md); }
	.ft > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.ft .kh { font-size: var(--fs-xl); line-height: var(--lh-kh); }
	.ft.one { font-size: var(--fs-lg); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	@media (max-width: 400px) {
		.fmain { padding: 0 var(--space-2); gap: var(--space-1); }
		.fmain > :global(svg:first-child) { display: none; }
	}
	.fx { width: var(--btn-tap); min-height: var(--btn-tap); flex: none; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-full); }
	.opts { display: flex; flex-direction: column; gap: var(--space-1); }
	.opt-title { font-family: var(--font-display); font-size: var(--fs-xl); text-align: center; padding-bottom: var(--space-2); }
	.opt-title .kh { font-size: var(--fs-xl); }
	.opt { min-height: 3.25rem; display: flex; align-items: center; gap: var(--space-3); padding: 0 var(--space-3); border-radius: var(--radius-md); background: var(--surface-2); font-size: var(--fs-lg); text-align: left; }
	.opt.on { background: var(--accent); color: var(--on-accent); font-weight: 600; }
	.opt .ph { width: 20px; flex: none; }
	.opt .ol { flex: 1; min-width: 0; }
	.opt .ol .kh { font-size: var(--fs-xl); }
	.opt .oc { font-size: var(--fs-md); opacity: 0.8; }
	.opt.clear { color: var(--accent-text); }
	.count { font-size: var(--fs-md); color: var(--text-secondary); align-self: flex-start; padding: 2px var(--space-3); border-radius: var(--radius-full); background: var(--surface); }
	.count span { font-size: 1rem; }
	.empty-filter { padding: var(--space-6) 0; }
	.empty-filter .kh { font-size: var(--fs-xl); }
	.banner {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		background: var(--peach);
		color: var(--peach-text);
		border-radius: var(--radius-md);
		font-size: var(--fs-md);
	}
	.banner span { font-size: 1rem; }
	.sep {
		font-family: var(--font-display);
		font-size: var(--fs-lg);
		font-weight: 600;
		color: var(--text-secondary);
		margin-top: var(--space-2);
	}
	.sep.up { color: var(--accent-text); }
	.sep .kh { font-size: var(--fs-xl); }
	.grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
	.card {
		position: relative;
		aspect-ratio: 4 / 5;
		border-radius: var(--radius-pebble);
		overflow: hidden;
		background: var(--ev-bg, var(--raised));
		border: 1px solid var(--border-soft);
		box-shadow: var(--shadow-sm);
		text-align: left;
		display: block;
		padding: 0;
		color: var(--text);
	}
	.card.ghost { background: color-mix(in srgb, var(--accent) 10%, var(--card)); border-color: transparent; }
	.card img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
	.big-emoji { position: absolute; top: 18%; left: 0; right: 0; text-align: center; font-size: 3.25rem; line-height: 1; }
	.mini-emoji {
		position: absolute; top: var(--space-2); right: var(--space-2);
		width: 2rem; height: 2rem; border-radius: var(--radius-full);
		display: flex; align-items: center; justify-content: center;
		background: color-mix(in srgb, var(--bg) 85%, transparent); font-size: 1.1rem;
	}
	.veil { position: absolute; inset: 0; background: color-mix(in srgb, var(--bg) 40%, transparent); }
	.badge {
		position: absolute; top: var(--space-2); left: var(--space-2);
		background: var(--gold); color: var(--gold-text);
		font-size: var(--fs-md); font-weight: 600;
		padding: 0.1rem 0.6rem; border-radius: var(--radius-full);
		display: flex; flex-direction: column; align-items: flex-start; line-height: 1.25;
		max-width: calc(100% - var(--space-4));
	}
	.badge span[lang='km'] { font-size: 1rem; line-height: var(--lh-kh); margin-top: -2px; }
	.badge .b-fr { font-size: var(--fs-md); }
	/* Une seule ligne, collée en haut : l'emoji (à partir de 18 % de la hauteur) n'est plus recouvert. */
	.badge.pend-badge { background: var(--surface); color: var(--gold-text); border: 1px solid var(--gold); flex-direction: row; align-items: center; gap: 4px; white-space: nowrap; top: 6px; left: 6px; padding: 0 var(--space-2); line-height: 1.5; }
	.badge.pend-badge span { margin-top: 0; }
	.caption {
		position: absolute; left: 0; right: 0; bottom: 0;
		display: flex; flex-direction: column; gap: 1px;
		padding: var(--space-6) var(--space-3) var(--space-3);
		background: linear-gradient(to top, color-mix(in srgb, var(--bg) 96%, transparent) 55%, transparent);
	}
	.name {
		font-family: var(--font-display);
		font-size: var(--fs-xl);
		font-weight: 600;
		line-height: 1.25;
		display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
	}
	.name:lang(km) { line-height: var(--lh-kh); }
	.name2 { font-size: var(--fs-md); color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.name2:lang(km) { font-size: 1rem; }
	.meta {
		font-size: var(--fs-base); color: var(--muted-text);
		display: flex; align-items: center; gap: 3px;
		white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
	}
	.meta:lang(km) { font-size: 1rem; }
	.state {
		display: flex; flex-direction: column; align-items: center; gap: var(--space-2);
		padding: var(--space-12) var(--space-4); text-align: center; color: var(--text-secondary);
	}
	.state :global(.state-icon) { color: var(--accent-deep); }
	.state-title { font-family: var(--font-display); font-size: var(--fs-2xl); color: var(--text); }
	.state-kh { font-size: var(--fs-xl); }
	.primary {
		min-height: var(--btn-tap);
		margin-top: var(--space-3);
		padding: 0 var(--space-6);
		display: inline-flex; flex-direction: column; align-items: center; justify-content: center;
		border-radius: var(--radius-full);
		background: linear-gradient(150deg, var(--accent), var(--accent-warm));
		color: var(--on-accent); font-weight: 600; font-size: var(--fs-lg);
		box-shadow: var(--shadow-accent);
	}
	.primary .kh { font-size: var(--fs-xl); line-height: var(--lh-kh); }
	.fr-l { display: inline-flex; align-items: center; gap: var(--space-1); }
</style>
