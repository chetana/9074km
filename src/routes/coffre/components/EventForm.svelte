<script lang="ts">
	import { untrack } from 'svelte';
	import BottomSheet from '$lib/BottomSheet.svelte';
	import LangTag from '$lib/LangTag.svelte';
	import { eventsStore } from '$lib/events.svelte';
	import { createEvent, patchEvent, EventApiError, type EventFormBody } from '$lib/events-api';
	import type { EventDTO, EventColor } from '$lib/events-types';
	import { T } from '$lib/events-i18n';
	import { toasts } from '$lib/toast.svelte';
	import { EVENT_COLOR_LIST, colorStyle, validateEventForm } from '$lib/events-ui';

	interface Props {
		open: boolean;
		event: EventDTO | null; // null = création
		initial?: { name?: string; dateStart?: string; dateEnd?: string; mediaPaths?: string[] };
		onclose: () => void;
		onSaved: (ev: EventDTO, created: boolean) => void;
	}
	let { open, event, initial, onclose, onSaved }: Props = $props();

	const QUICK = ['🎢', '🎂', '✈️', '🏖️', '💍', '🎉'];
	const COLOR_NAMES: Record<EventColor, string> = { accent: 'Rose', lavender: 'Lavande', gold: 'Doré', mint: 'Menthe', peach: 'Pêche' };

	let name = $state('');
	let nameFr = $state('');
	let nameEn = $state('');
	let nameKh = $state('');
	let dateStart = $state('');
	let dateEnd = $state('');
	let place = $state('');
	let emoji = $state('');
	let color = $state<EventColor>('accent');
	let autoAttach = $state(true);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let nameEl: HTMLInputElement | undefined = $state();

	$effect(() => {
		if (!open) return;
		untrack(() => {
			error = null;
			saving = false;
			if (event) {
				nameFr = event.names.fr; nameEn = event.names.en; nameKh = event.names.kh;
				dateStart = event.dates.start; dateEnd = event.dates.end;
				place = event.place ?? ''; emoji = event.emoji ?? ''; color = event.color; autoAttach = event.autoAttach;
			} else {
				name = initial?.name ?? '';
				const today = new Date().toLocaleDateString('sv');
				dateStart = initial?.dateStart ?? today;
				dateEnd = initial?.dateEnd ?? dateStart;
				place = ''; emoji = ''; color = 'accent'; autoAttach = true;
			}
		});
		if (!event) setTimeout(() => nameEl?.focus(), 360);
	});

	function onStartChange() {
		if (dateEnd < dateStart) dateEnd = dateStart;
	}

	const ERR: Record<string, string> = {
		name: T.needName.fr, 'name-long': T.tooLong.fr, range: T.badRange.fr, 'range-long': T.badRange.fr, dates: T.badRange.fr
	};

	async function save() {
		if (saving) return;
		const firstName = event ? nameFr : name;
		const bad = validateEventForm({ name: firstName, dateStart, dateEnd });
		if (bad) { error = ERR[bad] ?? T.genericError.fr; return; }
		error = null;
		saving = true;
		try {
			if (!event) {
				const body: EventFormBody = {
					name: name.trim(), dateStart, dateEnd, place: place.trim() || null, emoji: emoji.trim() || null, color, autoAttach
				};
				if (initial?.mediaPaths?.length) body.mediaPaths = initial.mediaPaths;
				const created = await createEvent(body);
				eventsStore.upsert(created);
				onSaved(created, true);
			} else {
				const body: EventFormBody = { ifVersion: event.version };
				const names: Record<string, string> = {};
				if (nameFr.trim() !== event.names.fr) names.fr = nameFr.trim();
				if (nameEn.trim() !== event.names.en) names.en = nameEn.trim();
				if (nameKh.trim() !== event.names.kh) names.kh = nameKh.trim();
				if (Object.keys(names).length) body.names = names;
				if (dateStart !== event.dates.start) body.dateStart = dateStart;
				if (dateEnd !== event.dates.end) body.dateEnd = dateEnd;
				if ((place.trim() || null) !== event.place) body.place = place.trim() || null;
				if ((emoji.trim() || null) !== event.emoji) body.emoji = emoji.trim() || null;
				if (color !== event.color) body.color = color;
				if (autoAttach !== event.autoAttach) body.autoAttach = autoAttach;
				if (Object.keys(body).length === 1) { onclose(); return; }
				const updated = await patchEvent(event.id, body);
				eventsStore.upsert(updated);
				onSaved(updated, false);
			}
		} catch (e) {
			if (e instanceof EventApiError && e.status === 409 && e.current) {
				eventsStore.upsert(e.current);
				toasts.push({ message: T.conflict.fr, messageKh: T.conflict.kh });
				onclose();
			} else if (e instanceof EventApiError && e.status === 0) {
				error = T.offlineAction.fr;
			} else {
				error = T.genericError.fr;
			}
		} finally {
			saving = false;
		}
	}
</script>

<BottomSheet {open} {onclose}>
	<form class="form" onsubmit={(e) => { e.preventDefault(); void save(); }}>
		<div class="head">
			<h2 class="title">{event ? T.edit.fr : T.newEvent.fr}</h2>
			<p class="title-kh" lang="km">{event ? T.edit.kh : T.newEvent.kh}</p>
		</div>

		{#if event}
			<fieldset class="field">
				<legend>{T.namesIn3.fr} · <span lang="km">{T.namesIn3.kh}</span></legend>
				{#if event.namesPending}<p class="pending">{T.translating.fr} · <span lang="km">{T.translating.kh}</span></p>{/if}
				<label class="lang-row"><LangTag lang="fr" /><input bind:value={nameFr} maxlength="80" aria-label="Nom en français" /></label>
				<label class="lang-row"><LangTag lang="en" /><input bind:value={nameEn} maxlength="80" aria-label="Nom en anglais" /></label>
				<label class="lang-row"><LangTag lang="kh" /><input bind:value={nameKh} maxlength="80" lang="km" class="kh-input" aria-label="Nom en khmer" /></label>
			</fieldset>
		{:else}
			<label class="field">
				<span class="lbl">{T.name.fr} · <span lang="km">{T.name.kh}</span></span>
				<input bind:this={nameEl} bind:value={name} maxlength="80" class="name-input" autocomplete="off" />
			</label>
		{/if}

		<div class="dates">
			<label class="field">
				<span class="lbl">{T.dateFrom.fr} · <span lang="km">{T.dateFrom.kh}</span></span>
				<input type="date" bind:value={dateStart} onchange={onStartChange} />
			</label>
			<label class="field">
				<span class="lbl">{T.dateTo.fr} · <span lang="km">{T.dateTo.kh}</span></span>
				<input type="date" bind:value={dateEnd} min={dateStart} />
			</label>
		</div>

		<label class="field">
			<span class="lbl">{T.place.fr} · <span lang="km">{T.place.kh}</span></span>
			<input bind:value={place} maxlength="120" autocomplete="off" />
		</label>

		<div class="field">
			<span class="lbl">{T.emoji.fr} · <span lang="km">{T.emoji.kh}</span></span>
			<div class="quick">
				{#each QUICK as q (q)}
					<button type="button" class="emo" class:on={emoji === q} aria-pressed={emoji === q} onclick={() => (emoji = emoji === q ? '' : q)}>{q}</button>
				{/each}
				<input class="emo-free" bind:value={emoji} maxlength="16" placeholder="{T.otherEmoji.fr} · {T.otherEmoji.kh}" aria-label="{T.otherEmoji.fr} · {T.otherEmoji.kh}" />
			</div>
		</div>

		<div class="field">
			<span class="lbl">{T.color.fr} · <span lang="km">{T.color.kh}</span></span>
			<div class="colors">
				{#each EVENT_COLOR_LIST as c (c)}
					<button type="button" class="swatch" class:on={color === c} style={colorStyle(c)} aria-label={COLOR_NAMES[c]} aria-pressed={color === c} onclick={() => (color = c)}></button>
				{/each}
			</div>
		</div>

		<label class="check">
			<input type="checkbox" bind:checked={autoAttach} />
			<span>{T.autoAttach.fr}<span class="kh" lang="km">{T.autoAttach.kh}</span></span>
		</label>

		{#if error}<p class="err" role="alert">{error}</p>{/if}

		<button class="save" type="submit" disabled={saving}>
			{T.save.fr} <span class="kh" lang="km">{T.save.kh}</span>
		</button>
		<button class="cancel" type="button" onclick={onclose}>
			{T.cancel.fr} <span class="kh" lang="km">{T.cancel.kh}</span>
		</button>
	</form>
</BottomSheet>

<style>
	.form { display: flex; flex-direction: column; gap: var(--space-3); }
	.head { text-align: center; }
	.title { font-family: var(--font-display); font-size: var(--fs-2xl); }
	.title-kh { font-size: var(--fs-xl); color: var(--text-secondary); line-height: var(--lh-kh); }
	.field { display: flex; flex-direction: column; gap: var(--space-1); border: none; min-width: 0; }
	.lbl, legend { font-size: var(--fs-md); color: var(--text-secondary); font-weight: 600; }
	.lbl span, legend span { font-size: var(--fs-xl); }
	input:not([type='checkbox']) {
		min-height: var(--btn-tap);
		padding: 0 var(--space-3);
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		font-size: 1rem;
		width: 100%;
		min-width: 0;
	}
	input:focus-visible { outline: 2px solid var(--accent-deep); outline-offset: 1px; }
	.name-input { font-size: var(--fs-xl); font-family: var(--font-display); }
	.kh-input { font-size: var(--fs-xl); line-height: var(--lh-kh); }
	.lang-row { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-1); }
	.pending span { font-size: 1rem; }
	.pending { font-size: var(--fs-md); color: var(--gold-text); background: color-mix(in srgb, var(--gold) 35%, var(--surface)); padding: 2px var(--space-2); border-radius: var(--radius-sm); }
	.dates { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
	.quick { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
	.emo {
		width: var(--btn-tap); height: var(--btn-tap); border-radius: var(--radius-full);
		background: var(--surface-2); font-size: 1.4rem; border: 2px solid transparent;
	}
	.emo.on { border-color: var(--accent-deep); background: var(--raised); }
	.emo-free { flex: 1 1 100%; font-size: 1.3rem !important; }
	.emo-free::placeholder { font-size: 1rem; }
	.colors { display: flex; gap: var(--space-3); }
	.swatch {
		width: var(--btn-tap); height: var(--btn-tap); border-radius: var(--radius-full);
		background: var(--ev-bg); border: 3px solid var(--surface); box-shadow: 0 0 0 1px var(--border);
	}
	.swatch.on { box-shadow: 0 0 0 3px var(--accent-deep); }
	.check { display: flex; align-items: center; gap: var(--space-3); min-height: var(--btn-tap); font-size: var(--fs-lg); }
	.check input { width: 1.5rem; height: 1.5rem; accent-color: var(--accent-deep); flex-shrink: 0; }
	.check .kh { display: block; font-size: var(--fs-xl); color: var(--text-secondary); }
	.err { color: var(--accent-text); font-size: var(--fs-lg); font-weight: 600; text-align: center; }
	.save {
		min-height: 3rem; border-radius: var(--radius-full);
		background: linear-gradient(150deg, var(--accent), var(--accent-warm));
		color: var(--on-accent); font-weight: 600; font-size: var(--fs-xl);
		box-shadow: var(--shadow-accent);
		display: flex; align-items: center; justify-content: center; gap: var(--space-2);
	}
	.save:disabled { opacity: 0.6; }
	.cancel { min-height: var(--btn-tap); color: var(--text-secondary); font-size: var(--fs-lg); display: flex; align-items: center; justify-content: center; gap: var(--space-2); }
	.cancel .kh, .save .kh { font-size: var(--fs-xl); }
</style>
