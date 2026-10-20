<script lang="ts">
	import { Film } from 'lucide-svelte';
	import BottomSheet from '$lib/BottomSheet.svelte';
	import { ogImageUrl } from '$lib/api';
	import { fetchUnclassified, type UnclassifiedItem } from '$lib/events-api';
	import { T } from '$lib/events-i18n';
	import { dayHeading } from '$lib/events-ui';

	interface Props {
		open: boolean;
		onOpenDay: (day: string) => void;
		onclose: () => void;
	}
	let { open, onOpenDay, onclose }: Props = $props();

	let items = $state<UnclassifiedItem[]>([]);
	let total = $state(0);
	let next = $state<string | null>(null);
	let loading = $state(false);
	let failed = $state(false);

	async function load(more: boolean) {
		loading = true;
		failed = false;
		try {
			const p = await fetchUnclassified(50, more ? next : null);
			total = p.total;
			next = p.nextCursor;
			items = more ? [...items, ...p.items] : p.items;
		} catch {
			failed = true;
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (open) void load(false);
	});

	// Regroupé par jour, dans l'ordre reçu (jour décroissant).
	const days = $derived.by(() => {
		const out: { day: string; items: UnclassifiedItem[] }[] = [];
		for (const it of items) {
			const g = out[out.length - 1];
			if (g && g.day === it.day) g.items.push(it);
			else out.push({ day: it.day, items: [it] });
		}
		return out;
	});
</script>

<BottomSheet {open} {onclose}>
	<div class="head">
		<h2 class="title">{T.unclassifiedTitle.fr}</h2>
		<p class="title-kh" lang="km">{T.unclassifiedTitle.kh}</p>
		{#if !failed}<p class="total">{total} {T.toClassify.fr}</p>{/if}
	</div>

	{#if failed}
		<button class="more" onclick={() => load(false)}>{T.retry.fr} <span lang="km">{T.retry.kh}</span></button>
	{:else if !loading && items.length === 0}
		<p class="empty">{T.allSorted.fr} · <span lang="km">{T.allSorted.kh}</span></p>
	{/if}

	{#each days as g (g.day)}
		{@const h = dayHeading(g.day)}
		<section class="day">
			<div class="day-head">
				<h3>{h.fr} {g.day.slice(0, 4)} · <span lang="km">{h.kh}</span></h3>
				<button class="see" onclick={() => { onOpenDay(g.day); onclose(); }}>{T.viewDay.fr} <span lang="km">{T.viewDay.kh}</span></button>
			</div>
			<div class="thumbs">
				{#each g.items as it (it.path)}
					<div class="th">
						{#if it.kind === 'image'}<img src={ogImageUrl(it.path, 200)} alt="" loading="lazy" />{:else}<Film size={22} aria-hidden="true" />{/if}
					</div>
				{/each}
			</div>
		</section>
	{/each}

	{#if next && !failed}
		<button class="more" disabled={loading} onclick={() => load(true)}>{T.loadMore.fr} <span lang="km">{T.loadMore.kh}</span></button>
	{/if}
</BottomSheet>

<style>
	.head { text-align: center; }
	.title { font-family: var(--font-display); font-size: var(--fs-2xl); }
	.title-kh { font-size: var(--fs-xl); color: var(--text-secondary); line-height: var(--lh-kh); }
	.total { font-size: var(--fs-md); color: var(--muted-text); }
	.empty { text-align: center; color: var(--text-secondary); font-size: var(--fs-lg); padding: var(--space-4); }
	.empty span, .more span, .see span { font-size: var(--fs-xl); line-height: var(--lh-kh); }
	.day-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); margin-bottom: var(--space-2); }
	.day-head h3 { font-size: var(--fs-lg); font-weight: 600; color: var(--text); }
	.day-head h3 span { font-size: var(--fs-xl); }
	.see { min-height: var(--btn-tap); padding: 0 var(--space-3); border-radius: var(--radius-full); background: var(--raised); color: var(--accent-text); font-size: var(--fs-md); font-weight: 600; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
	.thumbs { display: grid; grid-template-columns: repeat(5, 1fr); gap: var(--space-1); }
	.th { aspect-ratio: 1; border-radius: var(--radius-sm); overflow: hidden; background: var(--surface-2); display: flex; align-items: center; justify-content: center; color: var(--muted-glyph); }
	.th img { width: 100%; height: 100%; object-fit: cover; }
	.more { min-height: var(--btn-tap); width: 100%; border-radius: var(--radius-full); background: var(--raised); color: var(--on-accent); font-weight: 600; font-size: var(--fs-md); display: flex; flex-direction: column; align-items: center; justify-content: center; }
	.more:disabled { opacity: 0.6; }
</style>
