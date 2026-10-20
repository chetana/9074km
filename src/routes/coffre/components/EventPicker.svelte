<script lang="ts">
	import { Plus } from 'lucide-svelte';
	import BottomSheet from '$lib/BottomSheet.svelte';
	import { eventsStore } from '$lib/events.svelte';
	import { fetchForDate } from '$lib/events-api';
	import type { EventDTO } from '$lib/events-types';
	import { T } from '$lib/events-i18n';
	import { displayNames, formatRange, pickerSections, coveringFromList, colorStyle, type ReaderLang } from '$lib/events-ui';

	interface Props {
		open: boolean;
		mode?: 'add' | 'move';
		date: string | null; // AAAA-MM-JJ : jour d'où viennent les photos (suggestions)
		excludeId?: number | null;
		readerLang: ReaderLang;
		onPick: (ev: EventDTO) => void;
		onCreate: () => void;
		onclose: () => void;
	}
	let { open, mode = 'add', date, excludeId = null, readerLang, onPick, onCreate, onclose }: Props = $props();

	let serverCovering = $state<EventDTO[] | null>(null);

	$effect(() => {
		if (!open) return;
		serverCovering = null;
		void eventsStore.load();
		if (date) {
			fetchForDate(date).then((r) => { serverCovering = r.events; }).catch(() => { serverCovering = null; });
		}
	});

	const covering = $derived(serverCovering ?? (date ? coveringFromList(eventsStore.list, date) : []));
	const sections = $derived(pickerSections(eventsStore.list, covering, excludeId));
</script>

{#snippet row(e: EventDTO)}
	{@const n = displayNames(e, readerLang)}
	{@const r = formatRange(e.dates.start, e.dates.end)}
	<button class="row" style={colorStyle(e.color)} onclick={() => onPick(e)}>
		<span class="dot" aria-hidden="true">{e.emoji ?? ''}</span>
		<span class="txt">
			<span class="name" lang={n.primaryLang}>{n.primary}</span>
			<span class="sub">{readerLang === 'kh' ? r.kh : r.fr} · {e.count} {T.photos.fr}</span>
		</span>
	</button>
{/snippet}

<BottomSheet {open} {onclose}>
	<div class="head">
		<h2 class="title">{mode === 'move' ? T.moveTo.fr : T.chooseEvent.fr}</h2>
		<p class="title-kh" lang="km">{mode === 'move' ? T.moveTo.kh : T.chooseEvent.kh}</p>
	</div>

	<button class="row create" onclick={onCreate}>
		<span class="dot plus" aria-hidden="true"><Plus size={22} /></span>
		<span class="txt">
			<span class="name">{T.newEvent.fr}</span>
			<span class="name-kh" lang="km">{T.newEvent.kh}</span>
		</span>
	</button>

	{#if sections.suggested.length}
		<h3 class="sec">{T.suggested.fr} · <span lang="km">{T.suggested.kh}</span></h3>
		{#each sections.suggested as e (e.id)}{@render row(e)}{/each}
	{/if}
	{#if sections.recent.length}
		<h3 class="sec">{T.recent.fr} · <span lang="km">{T.recent.kh}</span></h3>
		{#each sections.recent as e (e.id)}{@render row(e)}{/each}
	{/if}
	{#if eventsStore.loading && eventsStore.list.length === 0}
		<p class="hint">…</p>
	{/if}
</BottomSheet>

<style>
	.head { text-align: center; }
	.title { font-family: var(--font-display); font-size: var(--fs-2xl); color: var(--text); }
	.title-kh { font-size: var(--fs-xl); color: var(--text-secondary); line-height: var(--lh-kh); }
	.sec { font-size: var(--fs-md); color: var(--text-secondary); font-weight: 600; margin-top: var(--space-2); }
	.sec span { font-size: var(--fs-xl); }
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		min-height: 3.5rem;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		background: var(--surface-2);
		text-align: left;
	}
	.row.create { background: var(--raised); }
	.dot {
		width: 2.5rem; height: 2.5rem; border-radius: var(--radius-full);
		display: flex; align-items: center; justify-content: center;
		background: var(--ev-bg, var(--raised)); font-size: 1.35rem; flex-shrink: 0;
	}
	.dot.plus { background: var(--accent); color: var(--on-accent); }
	.txt { display: flex; flex-direction: column; min-width: 0; }
	.name { font-family: var(--font-display); font-size: var(--fs-xl); font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.name:lang(km) { line-height: var(--lh-kh); }
	.name-kh { font-size: var(--fs-xl); color: var(--text-secondary); line-height: var(--lh-kh); }
	.sub { font-size: var(--fs-base); color: var(--muted-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.hint { text-align: center; color: var(--muted-text); }
</style>
