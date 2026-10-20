<script lang="ts">
	import { X, Sparkles } from 'lucide-svelte';
	import BottomSheet from '$lib/BottomSheet.svelte';
	import { eventsStore } from '$lib/events.svelte';
	import { createEvent, dismissSuggestion, attachInChunks, addEventMedia, EventApiError } from '$lib/events-api';
	import type { EventDTO, SuggestionDTO } from '$lib/events-types';
	import { T } from '$lib/events-i18n';
	import { toasts } from '$lib/toast.svelte';
	import { displayNames, formatRange, fillT, type ReaderLang } from '$lib/events-ui';
	import { skippedMessage } from '$lib/upload-attach';
	import { U } from '$lib/upload-i18n';
	import EventPicker from './EventPicker.svelte';

	interface Props {
		suggestion: SuggestionDTO;
		readerLang: ReaderLang;
		onDone: () => void; // après ajout ou refus : recharger suggestions, chip et liste
	}
	let { suggestion, readerLang, onDone }: Props = $props();

	// Cible choisie : l'évènement qui recouvre la plage (« ajouter à ») ou, à défaut, un nouvel évènement.
	let target = $state<EventDTO | null>(null);
	let creating = $state(false); // true = « nouvel évènement » (nom modifiable)
	let name = $state('');
	let confirmOpen = $state(false);
	let pickerOpen = $state(false);
	let busy = $state(false);
	let error = $state<string | null>(null);

	const covering = $derived(suggestion.eventId === null ? null : eventsStore.byId(suggestion.eventId));
	const range = $derived(formatRange(suggestion.start, suggestion.end));
	const rangeLabel = $derived(readerLang === 'kh' ? range.kh : range.fr);
	const shownName = $derived(covering ? displayNames(covering, readerLang).primary : suggestion.proposedName);
	const q = $derived(covering ? T.suggAttachTo : T.suggCreate);

	function yes() {
		error = null;
		if (covering) { target = covering; creating = false; } else { target = null; creating = true; name = suggestion.proposedName; }
		confirmOpen = true;
	}

	function pickOther(ev: EventDTO) {
		pickerOpen = false;
		target = ev;
		creating = false;
		error = null;
		confirmOpen = true;
	}

	function newOther() {
		pickerOpen = false;
		target = null;
		creating = true;
		name = suggestion.proposedName;
		error = null;
		confirmOpen = true;
	}

	async function dismiss() {
		try {
			await dismissSuggestion(suggestion.start, suggestion.end, suggestion.count);
			onDone();
		} catch {
			toasts.push({ message: T.genericError.fr, messageKh: T.genericError.kh });
		}
	}

	// Jamais de rattachement silencieux : cette confirmation affiche le nombre de photos ; mode « keep » ensuite.
	async function confirm() {
		if (busy) return;
		if (creating && !name.trim()) { error = T.needName.fr; return; }
		busy = true;
		error = null;
		try {
			let ev = target;
			if (creating) {
				ev = await createEvent({ name: name.trim(), dateStart: suggestion.start, dateEnd: suggestion.end });
				eventsStore.upsert(ev);
				target = ev;
				creating = false;
			}
			const r = await attachInChunks(ev!.id, suggestion.paths);
			confirmOpen = false;
			if (r.skipped.length) {
				const others = new Set(r.skipped.map((s) => s.eventId));
				const only = others.size === 1 ? eventsStore.byId([...others][0]) : null;
				const msg = skippedMessage(r.skipped.length, only ? displayNames(only, readerLang).primary : null, U);
				const moving = r.skipped.map((s) => s.path);
				const evId = ev!.id;
				toasts.push({ message: msg.fr, messageKh: msg.kh, actionLabel: U.moveHere.fr, actionLabelKh: U.moveHere.kh, duration: 12000,
					onAction: () => void addEventMedia(evId, moving, 'move').then(() => { void eventsStore.load(); onDone(); }).catch(() => toasts.push({ message: T.genericError.fr, messageKh: T.genericError.kh })) });
			} else {
				toasts.push({ message: fillT(T.addedN.fr, { n: r.added }), messageKh: fillT(T.addedN.kh, { n: r.added }) });
			}
			void eventsStore.load();
			onDone();
		} catch (e) {
			error = e instanceof EventApiError && e.status === 0 ? T.offlineAction.fr : T.genericError.fr;
		} finally {
			busy = false;
		}
	}

	const confirmQ = $derived(creating ? T.confirmCreate : T.confirmAttach);
	const confirmX = $derived(creating ? name.trim() || suggestion.proposedName : target ? displayNames(target, readerLang).primary : '');
</script>

<section class="card" aria-label="{T.suggTitle.fr} · {T.suggTitle.kh}">
	<header class="head">
		<Sparkles size={18} aria-hidden="true" />
		<span class="tag">{T.suggTitle.fr} · <span lang="km">{T.suggTitle.kh}</span></span>
		<button class="x" onclick={dismiss} aria-label="{T.dismiss.fr} · {T.dismiss.kh}" title="{T.dismiss.fr} · {T.dismiss.kh}"><X size={20} /></button>
	</header>
	<p class="what">{fillT(T.suggText.fr, { n: suggestion.count, d: range.fr })}</p>
	<p class="what kh" lang="km">{fillT(T.suggText.kh, { n: suggestion.count, d: range.kh })}</p>
	<p class="q" lang={covering ? displayNames(covering, readerLang).primaryLang : 'fr'}>{fillT(q.fr, { x: shownName })}</p>
	<div class="btns">
		<button class="yes" onclick={yes}>{T.yes.fr} <span class="kh" lang="km">{T.yes.kh}</span></button>
		<button class="other" onclick={() => (pickerOpen = true)}>{T.other.fr} <span class="kh" lang="km">{T.other.kh}</span></button>
	</div>
</section>

<EventPicker open={pickerOpen} date={suggestion.start} excludeId={null} {readerLang} onPick={pickOther} onCreate={newOther} onclose={() => (pickerOpen = false)} />

<BottomSheet open={confirmOpen} onclose={() => { if (!busy) confirmOpen = false; }}>
	<div class="confirm">
		<h2 class="cq">{fillT(confirmQ.fr, { n: suggestion.count, x: confirmX })}</h2>
		<p class="cq-kh" lang="km">{fillT(confirmQ.kh, { n: suggestion.count, x: confirmX })}</p>
		<p class="crange">{range.fr} · <span lang="km">{range.kh}</span></p>
		{#if creating}
			<label class="field">
				<span class="lbl">{T.name.fr} · <span lang="km">{T.name.kh}</span></span>
				<input bind:value={name} maxlength="80" autocomplete="off" />
			</label>
		{/if}
		{#if error}<p class="err" role="alert">{error}</p>{/if}
		<button class="go" disabled={busy} onclick={confirm}>{creating ? T.createAction.fr : T.addAction.fr} <span class="kh" lang="km">{creating ? T.createAction.kh : T.addAction.kh}</span></button>
		<button class="no" disabled={busy} onclick={() => (confirmOpen = false)}>{T.cancel.fr} <span class="kh" lang="km">{T.cancel.kh}</span></button>
	</div>
</BottomSheet>

<style>
	.card { background: var(--lavender); color: var(--on-lavender); border-radius: var(--radius-pebble); padding: var(--space-3) var(--space-4) var(--space-4); display: flex; flex-direction: column; gap: var(--space-1); box-shadow: var(--shadow-sm); }
	.head { display: flex; align-items: center; gap: var(--space-2); }
	.tag { flex: 1; font-size: var(--fs-md); font-weight: 600; color: var(--lavender-text); }
	.tag span { font-size: var(--fs-xl); }
	.x { width: var(--btn-tap); height: var(--btn-tap); margin: calc(var(--space-2) * -1) calc(var(--space-2) * -1) 0 0; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-full); color: var(--lavender-text); }
	.what { font-size: var(--fs-lg); font-weight: 600; line-height: 1.35; }
	.what.kh { font-size: var(--fs-xl); font-weight: 400; line-height: var(--lh-kh); }
	.q { font-family: var(--font-display); font-size: var(--fs-xl); margin-top: var(--space-1); }
	.q:lang(km) { line-height: var(--lh-kh); }
	.btns { display: flex; gap: var(--space-2); margin-top: var(--space-2); }
	.btns button { flex: 1; min-height: var(--btn-tap); border-radius: var(--radius-full); font-weight: 600; font-size: var(--fs-lg); display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.15; padding: var(--space-1); }
	.btns .kh { font-size: var(--fs-xl); line-height: var(--lh-kh); }
	.yes { background: linear-gradient(150deg, var(--accent), var(--accent-warm)); color: var(--on-accent); box-shadow: var(--shadow-accent); }
	.other { background: var(--surface); color: var(--on-lavender); }
	.confirm { display: flex; flex-direction: column; gap: var(--space-2); text-align: center; }
	.cq { font-family: var(--font-display); font-size: var(--fs-2xl); line-height: 1.25; }
	.cq-kh { font-size: var(--fs-xl); color: var(--text-secondary); line-height: var(--lh-kh); }
	.crange { font-size: var(--fs-md); color: var(--muted-text); }
	.crange span { font-size: 1rem; }
	.field { display: flex; flex-direction: column; gap: var(--space-1); text-align: left; }
	.lbl { font-size: var(--fs-md); color: var(--text-secondary); font-weight: 600; }
	.lbl span { font-size: var(--fs-xl); }
	.field input { min-height: var(--btn-tap); padding: 0 var(--space-3); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: var(--fs-xl); font-family: var(--font-display); }
	.err { color: var(--accent-text); font-weight: 600; }
	.go { min-height: 3rem; border-radius: var(--radius-full); background: linear-gradient(150deg, var(--accent), var(--accent-warm)); color: var(--on-accent); font-weight: 600; font-size: var(--fs-xl); display: flex; align-items: center; justify-content: center; gap: var(--space-2); box-shadow: var(--shadow-accent); }
	.no { min-height: var(--btn-tap); color: var(--text-secondary); font-size: var(--fs-lg); display: flex; align-items: center; justify-content: center; gap: var(--space-2); }
	.go .kh, .no .kh { font-size: var(--fs-xl); }
	.go:disabled, .no:disabled { opacity: 0.6; }
</style>
