<script lang="ts">
	import { onMount } from 'svelte';
	import { Search, Plus, WifiOff, CalendarHeart, MapPin, Images, Inbox, Ellipsis, Download, Languages, GalleryHorizontal, LayoutGrid } from 'lucide-svelte';
	import BottomSheet from '$lib/BottomSheet.svelte';
	import { toasts } from '$lib/toast.svelte';
	import { ogImageUrl } from '$lib/api';
	import { eventsStore } from '$lib/events.svelte';
	import { fetchUnclassified, fetchSuggestions, downloadExport, EventApiError } from '$lib/events-api';
	import type { SuggestionDTO } from '$lib/events-types';
	import SuggestionCard from './SuggestionCard.svelte';
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
	let tight = $state(false); // place trop petite pour le carrousel : filtres sur 1 ligne
	function setView(v: 'album' | 'grid') {
		view = v;
		try { localStorage.setItem(VIEW_KEY, v); } catch { /* stockage indisponible : la page marche sans */ }
	}

	onMount(() => {
		try { if (localStorage.getItem(VIEW_KEY) === 'grid') view = 'grid'; } catch { /* idem */ }
		void eventsStore.load(); void loadUnclassified(); void loadSuggestions();
	});

	// Indique qu'une rangée de puces défile encore (fondu en bas) : mise à jour au redimensionnement, au défilement et aux changements.
	function moreHint(node: HTMLElement) {
		const upd = () => { node.dataset.more = node.scrollHeight > node.clientHeight + 1 && node.scrollTop + node.clientHeight < node.scrollHeight - 2 ? '1' : ''; };
		const ro = new ResizeObserver(upd);
		const mo = new MutationObserver(upd);
		ro.observe(node); mo.observe(node, { childList: true, subtree: true });
		node.addEventListener('scroll', upd, { passive: true });
		upd();
		return { destroy() { ro.disconnect(); mo.disconnect(); node.removeEventListener('scroll', upd); } };
	}

	const years = $derived(yearsOf(eventsStore.list));
	const places = $derived(placesOf(eventsStore.list));
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

	{#if suggestions.length}
		<SuggestionCard suggestion={suggestions[0]} {readerLang} onDone={refreshAll} />
	{/if}

	{#if unclassified > 0}
		<button class="todo" onclick={openSort}>
			<Inbox size={20} aria-hidden="true" />
			<span class="todo-n">{unclassified}</span> {T.toClassify.fr} · <span class="kh" lang="km">{T.toClassify.kh}</span>
		</button>
	{/if}

	{#if years.length > 1}
		<div class="chips" class:compact={tight && view === 'album'} use:moreHint role="group" aria-label="Année">
			<button class="chip all" class:on={year === null} aria-pressed={year === null} onclick={() => (year = null)}>
				{T.allYears.fr} <span class="kh" lang="km">{T.allYears.kh}</span>
			</button>
			{#each years as y (y)}
				<button class="chip" class:on={year === y} aria-pressed={year === y} onclick={() => (year = y)}>{y}</button>
			{/each}
		</div>
	{/if}

	{#if places.length > 1}
		<div class="chips" class:compact={tight && view === 'album'} use:moreHint role="group" aria-label="Lieu">
			<button class="chip all" class:on={place === null} aria-pressed={place === null} onclick={() => (place = null)}>
				<MapPin size={16} aria-hidden="true" /> {T.allPlacesShort.fr} <span class="kh" lang="km">{T.allPlacesShort.kh}</span>
			</button>
			{#each places as p (p.key)}
				<button class="chip" class:on={place === p.key} aria-pressed={place === p.key} onclick={() => (place = place === p.key ? null : p.key)}><MapPin size={16} aria-hidden="true" /> {p.label}{#if p.count > 1} <span class="n">{p.count}</span>{/if}</button>
			{/each}
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
		<EventCarousel events={shown} {readerLang} {onOpen} onTight={(v) => (tight = v)} />
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
	.todo {
		min-height: var(--btn-tap);
		display: flex; align-items: center; gap: var(--space-2);
		padding: 0 var(--space-4);
		border-radius: var(--radius-full);
		background: var(--lavender); color: var(--on-lavender);
		font-size: var(--fs-lg); font-weight: 600;
		align-self: flex-start;
	}
	.todo .kh { font-size: var(--fs-xl); }
	.todo-n { font-family: var(--font-display); font-size: var(--fs-xl); }
	/* 2 lignes de puces au plus, défilement vertical, fondu en bas tant qu'il en reste. */
	.chips { display: flex; flex-wrap: wrap; gap: var(--space-2); max-height: calc(var(--btn-tap) * 2 + var(--space-2)); overflow-y: auto; overscroll-behavior: contain; scrollbar-width: none; }
	.chips.compact { max-height: var(--btn-tap); }
	.chips:global([data-more='1']) { -webkit-mask-image: linear-gradient(180deg, #000 calc(100% - 22px), transparent); mask-image: linear-gradient(180deg, #000 calc(100% - 22px), transparent); }
	.count { font-size: var(--fs-md); color: var(--text-secondary); padding: 0 var(--space-1); }
	.count span { font-size: 1rem; }
	.empty-filter { padding: var(--space-6) 0; }
	.empty-filter .kh { font-size: var(--fs-xl); }
	.chip {
		min-height: var(--btn-tap);
		padding: 0 var(--space-3);
		border-radius: var(--radius-full);
		background: var(--raised);
		color: var(--text-secondary);
		font-size: var(--fs-lg);
		white-space: nowrap;
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}
	.chip .kh { font-size: var(--fs-xl); }
	.chip .n { font-size: var(--fs-md); opacity: 0.7; }
	/* Un seul style PLEIN = un filtre réellement appliqué ; « Toutes/Tous » sélectionné (aucun filtre) = contour. */
	.chip.on { background: var(--accent); color: var(--on-accent); font-weight: 600; }
	.chip.all.on { background: transparent; color: var(--accent-text); box-shadow: inset 0 0 0 2px var(--accent); }
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
