<script lang="ts">
	import { onMount } from 'svelte';
	import { Images, MapPin, Languages } from 'lucide-svelte';
	import { ogImageUrl } from '$lib/api';
	import { T } from '$lib/events-i18n';
	import { displayNames, formatRange, type ReaderLang } from '$lib/events-ui';
	import type { EventDTO } from '$lib/events-types';
	import { layoutAt, cssTransform, clampPos, snapTarget, restoreIndex, parseRemembered, cardSize, fitStage, CARD_W, type Remembered } from '$lib/carousel-layout';

	interface Props {
		events: EventDTO[];
		readerLang: ReaderLang;
		onOpen: (id: number) => void;
		/** Place vraiment trop petite : le parent réduit ses rangées de filtres à 1 ligne. */
		onTight?: (tight: boolean) => void;
	}
	let { events, readerLang, onOpen, onTight }: Props = $props();

	let pos = $state(0); // position flottante du carrousel (indice de la carte centrale)
	let target = 0;
	let dragging = false;
	let reduced = $state(false);
	let raf = 0;
	// Dernier évènement au centre (id + date de début), mémorisé quand le carrousel s'arrête.
	const MEM_KEY = 'coffre-carousel-pos';
	let mem: Remembered | null = null;
	try { mem = parseRemembered(localStorage.getItem(MEM_KEY)); } catch { /* stockage indisponible : la page marche sans */ }
	function commit(i = Math.round(target)) {
		const e = events[i];
		if (!e) return;
		mem = { id: e.id, start: e.dates.start };
		try { localStorage.setItem(MEM_KEY, JSON.stringify(mem)); } catch { /* idem */ }
	}
	let lastKey = '';
	let stageEl: HTMLDivElement;
	let rootEl: HTMLDivElement;
	let stageH = $state(330);
	let tight = false;
	const size = $derived(cardSize(stageH));
	const spread = $derived(size.w / CARD_W);
	const SCRUB_H = 44;

	function scroller(el: HTMLElement): HTMLElement | null {
		for (let p = el.parentElement; p; p = p.parentElement) if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p;
		return null;
	}
	// Scène + curseur tiennent entre le haut du carrousel (sans défilement) et le haut du dock.
	function measure() {
		if (!rootEl) return;
		const dockTop = document.querySelector('.nav-dock')?.getBoundingClientRect().top ?? innerHeight;
		const top = rootEl.getBoundingClientRect().top + (scroller(rootEl)?.scrollTop ?? 0);
		const fit = fitStage(dockTop - top - 8, SCRUB_H, tight);
		if (Math.abs(fit.stageH - stageH) > 1) stageH = fit.stageH;
		if (fit.tight !== tight) { tight = fit.tight; onTight?.(tight); }
	}

	const center = $derived(Math.round(pos));
	const max = $derived(Math.max(0, events.length - 1));
	const visible = $derived(events.map((e, i) => ({ e, i, t: layoutAt(i - pos, reduced) })).filter((c) => c.t.visible));

	// Liste filtrée : on garde au centre l'évènement le plus proche (en date) de l'ancien centre.
	$effect(() => {
		const key = events.map((e) => e.id).join(',');
		if (key === lastKey) return;
		lastKey = key;
		pos = target = restoreIndex(events.map((e) => ({ id: e.id, start: e.dates.start })), mem);
	});

	// Animation seulement le temps du rattrapage : aucune boucle permanente.
	function settle() {
		cancelAnimationFrame(raf);
		const step = () => {
			if (dragging) return;
			const diff = target - pos;
			if (reduced || Math.abs(diff) < 0.002) { pos = target; commit(); return; }
			pos += diff * 0.2;
			raf = requestAnimationFrame(step);
		};
		raf = requestAnimationFrame(step);
	}
	function go(i: number) { target = clampPos(Math.round(i), events.length); commit(); settle(); }

	onMount(() => {
		const mq = matchMedia('(prefers-reduced-motion: reduce)');
		reduced = mq.matches;
		const on = () => (reduced = mq.matches);
		mq.addEventListener('change', on);
		// molette : seulement le défilement horizontal (la molette verticale reste celle de la page)
		const wheel = (e: WheelEvent) => {
			if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
			e.preventDefault();
			go(target + Math.sign(e.deltaX));
		};
		stageEl.addEventListener('wheel', wheel, { passive: false });
		const ro = new ResizeObserver(measure);
		ro.observe(document.body);
		if (rootEl.parentElement) ro.observe(rootEl.parentElement);
		addEventListener('resize', measure);
		measure();
		requestAnimationFrame(measure);
		document.fonts?.ready.then(measure);
		return () => { mq.removeEventListener('change', on); stageEl.removeEventListener('wheel', wheel); cancelAnimationFrame(raf); ro.disconnect(); removeEventListener('resize', measure); };
	});

	let startX = 0, startPos = 0, lastX = 0, lastT = 0, vel = 0, moved = 0, captured = false, suppressClick = false;
	function down(e: PointerEvent) {
		cancelAnimationFrame(raf);
		dragging = true; captured = false;
		startX = lastX = e.clientX; startPos = pos; moved = 0; vel = 0; lastT = performance.now();
	}
	function move(e: PointerEvent) {
		if (!dragging) return;
		const dx = e.clientX - startX;
		moved = Math.max(moved, Math.abs(dx));
		if (moved < 6) return; // un tap ne devient jamais un glissement
		if (!captured) { stageEl.setPointerCapture(e.pointerId); captured = true; }
		const now = performance.now();
		vel = (e.clientX - lastX) / Math.max(1, now - lastT);
		lastX = e.clientX; lastT = now;
		pos = clampPos(startPos - dx / 100, events.length);
	}
	function up() {
		if (!dragging) return;
		dragging = false;
		if (performance.now() - lastT > 80) vel = 0; // doigt immobile avant de relâcher : pas d'élan
		suppressClick = moved >= 6;
		if (suppressClick) { target = snapTarget(pos, vel, events.length); commit(); settle(); setTimeout(() => (suppressClick = false), 0); }
	}
	function cardClick(i: number, id: number) {
		if (suppressClick) return;
		if (i === center) { commit(i); onOpen(id); } else go(i);
	}
	function key(e: KeyboardEvent) {
		if (e.key === 'ArrowRight') { e.preventDefault(); go(Math.round(target) + 1); }
		else if (e.key === 'ArrowLeft') { e.preventDefault(); go(Math.round(target) - 1); }
	}
</script>

<div class="carousel" bind:this={rootEl}>
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="stage" class:reduced bind:this={stageEl} style="height:{stageH}px" role="group" aria-roledescription="carrousel" aria-label="{T.browse.fr} · {T.browse.kh}"
		onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onkeydown={key}
	>
		{#each visible as { e, i, t } (e.id)}
			{@const n = displayNames(e, readerLang)}
			{@const r = formatRange(e.dates.start, e.dates.end)}
			{@const isCenter = i === center}
			<div class="slot" style="width:{size.w}px;height:{size.h}px;margin:{-size.h / 2}px 0 0 {-size.w / 2}px;transform:{cssTransform(t, spread)};opacity:{t.opacity};z-index:{t.zIndex};filter:{t.brightness < 1 ? `brightness(${t.brightness})` : 'none'}" data-i={i} data-center={isCenter ? '' : undefined}>
				<button
					class="album" tabindex={isCenter ? 0 : -1} aria-current={isCenter ? 'true' : undefined}
					aria-label={isCenter ? `${n.primary} — ${T.open.fr}` : n.primary} onclick={() => cardClick(i, e.id)}
				>
					<span class="pages" aria-hidden="true"></span>
					<span class="body">
						<span class="spine" aria-hidden="true"></span>
						{#if e.cover}
							<img class="cv" style="height:{size.h - size.cap}px" src={ogImageUrl(e.cover, 600)} alt="" draggable="false" />
						{:else}
							<span class="cv ph" style="height:{size.h - size.cap}px" aria-hidden="true">{e.emoji ?? ''}</span>
						{/if}
						{#if e.emoji && e.cover}<span class="emoji" aria-hidden="true">{e.emoji}</span>{/if}
						{#if e.namesPending}<span class="pend"><Languages size={16} aria-hidden="true" /><span lang="km">{T.translatingShort.kh}</span></span>{/if}
						<span class="cap" class:c1={size.h < 270} class:c0={size.h < 210} style="height:{size.cap}px">
							<span class="t1" lang={n.primaryLang}>{n.primary}</span>
							{#if n.secondary}<span class="t2" lang={n.secondaryLang}>{n.secondary}</span>{/if}
							<span class="meta" lang={readerLang === 'kh' ? 'km' : 'fr'}>{readerLang === 'kh' ? r.kh : r.fr}</span>
							{#if size.meta2}<span class="meta"><Images size={13} aria-hidden="true" /> {e.count}{#if e.place}&nbsp;· <MapPin size={13} aria-hidden="true" /> {e.place}{/if}</span>{/if}
						</span>
						<span class="gloss" aria-hidden="true" style="--gx:{isCenter ? (pos - center) * 200 - 40 : -40}%"></span>
					</span>
				</button>
			</div>
		{/each}
	</div>
	<input
		class="scrub" type="range" min="0" max={max} step="0.01" value={pos} disabled={events.length < 2}
		aria-label="{T.browse.fr} · {T.browse.kh}"
		oninput={(e) => { cancelAnimationFrame(raf); pos = target = +e.currentTarget.value; }}
		onchange={(e) => go(+e.currentTarget.value)}
	/>
</div>

<style>
	.carousel { display: flex; flex-direction: column; gap: var(--space-1); }
	.stage {
		position: relative; overflow: hidden; perspective: 1100px; perspective-origin: 50% 42%;
		touch-action: pan-y; user-select: none; -webkit-user-select: none; cursor: grab;
	}
	.stage.reduced { perspective: none; }
	.slot { position: absolute; left: 50%; top: 50%; will-change: transform, opacity; }
	.album { position: relative; display: block; width: 100%; height: 100%; padding: 0; text-align: left; color: var(--text); -webkit-touch-callout: none; }
	.album:focus-visible { outline: 3px solid var(--accent-text); outline-offset: 4px; border-radius: 10px; }
	.body { position: absolute; inset: 0; border-radius: 6px 14px 14px 6px; overflow: hidden; background: var(--surface); box-shadow: 0 18px 36px color-mix(in srgb, var(--text) 33%, transparent); }
	.spine { position: absolute; left: 0; top: 0; bottom: 0; width: 18px; z-index: 3; background: linear-gradient(90deg, #8e3a5a, #c2587f 55%, #a64468); box-shadow: inset -2px 0 4px #0003; }
	.spine::after { content: ''; position: absolute; inset: 14px 6px; background: repeating-linear-gradient(180deg, var(--accent-soft, #ffe3ec) 0 6px, transparent 6px 20px); opacity: 0.7; border-radius: 2px; }
	.cv { position: absolute; left: 18px; top: 0; right: 0; width: calc(100% - 18px); object-fit: cover; }
	.cv.ph { display: flex; align-items: center; justify-content: center; font-size: 3.25rem; background: var(--ev-bg, var(--raised)); }
	.emoji { position: absolute; right: 10px; top: 10px; font-size: 26px; z-index: 3; filter: drop-shadow(0 2px 3px #0005); }
	.pend { position: absolute; left: 26px; top: 8px; z-index: 3; display: flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: var(--radius-full); background: var(--gold); color: var(--gold-text); font-size: var(--fs-md); }
	.pend span { font-size: 1rem; }
	.cap { position: absolute; left: 18px; right: 0; bottom: 0; background: linear-gradient(180deg, var(--raised), var(--surface)); padding: 8px 12px; display: flex; flex-direction: column; gap: 1px; z-index: 2; overflow: hidden; }
	.t1, .t2, .meta { flex-shrink: 0; }
	.t1 { font-family: var(--font-display); font-size: 1.0625rem; font-weight: 600; line-height: 1.15; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; }
	.t2 { font-size: 1.125rem; font-weight: 600; line-height: var(--lh-kh); color: var(--accent-text); font-style: normal; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; }
	.cap.c1 .t2 { -webkit-line-clamp: 1; line-clamp: 1; }
	.meta { font-size: 0.8125rem; color: var(--muted-text); line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }
	.meta :global(svg) { vertical-align: -2px; }
	.pages { position: absolute; right: -7px; top: 6px; bottom: 6px; width: 8px; border-radius: 0 8px 8px 0; background: repeating-linear-gradient(180deg, #fff 0 3px, #e6d6df 3px 4px); box-shadow: 2px 3px 6px color-mix(in srgb, var(--text) 20%, transparent); }
	.gloss { position: absolute; inset: 0; z-index: 4; pointer-events: none; background: linear-gradient(115deg, transparent 35%, #ffffff55 48%, transparent 62%); transform: translateX(var(--gx, -40%)); }
	.stage.reduced .gloss { display: none; }
	.scrub { width: 100%; height: var(--btn-tap); accent-color: var(--accent-text); }
</style>
