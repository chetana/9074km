<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		listObjects,
		signDownload,
		signUpload,
		uploadFile,
		deleteObject,
		fetchNote,
		saveNote as apiSaveNote,
		fetchMeta,
		saveMeta,
		fetchReactions,
		saveReactions as apiSaveReactions,
		isMediaFile,
		invalidateListCache,
		previewUrl as buildShareUrl,
		getCachedList,
		getCachedNote,
		getCachedMeta,
		getCachedReactions,
		type CoffreItem
	} from '$lib/api';
	import { createSWR } from '$lib/swr.svelte';
	import { compressImage } from '$lib/compressor';
	import { generateVideoThumbnail } from '$lib/thumbnailer';
	import { Semaphore } from '$lib/semaphore';
	import { auth } from '$lib/auth';
	import { dayLabel, REACTIONS } from '$lib/i18n';
	import DayNavBar from './DayNavBar.svelte';
	import DaysChipBar from './DaysChipBar.svelte';
	import NoteField from './NoteField.svelte';
	import FileTile from './FileTile.svelte';
	import FabUpload from './FabUpload.svelte';
	import FileViewer from './FileViewer.svelte';

	interface Props {
		year: string;
		month: string;
		day: string;
		initialFile: string | null;
		onDayChange: (day: string) => void;
		onDateChange: (year: string, month: string, day: string) => void;
		onCountChange?: (count: number | null) => void;
	}

	let { year, month, day, initialFile, onDayChange, onDateChange, onCountChange }: Props = $props();

	// --- State ---
	// --- SWR Hooks ---
	const prefix = $derived(`${year}/${month}/${day}/`);

	const swrItems = createSWR(
		`items_${prefix}`,
		() => getCachedList(prefix),
		() => listObjects(prefix),
		{ prefixes: [], items: [] }
	);

	const swrNote = createSWR(
		`note_${year}_${month}_${day}`,
		() => getCachedNote(year, month, day),
		() => fetchNote(year, month, day),
		''
	);

	const swrMeta = createSWR(
		`meta_${year}_${month}_${day}`,
		() => getCachedMeta(year, month, day),
		() => fetchMeta(year, month, day),
		{}
	);

	const swrReactions = createSWR(
		`react_${year}_${month}_${day}`,
		() => getCachedReactions(year, month, day),
		() => fetchReactions(year, month, day),
		{}
	);

	// --- Local writable state (initialisé via SWR) ---
	let note = $state('');
	let meta = $state<Record<string, string>>({});
	let reactions = $state<Record<string, string[]>>({});

	// Sync local state when SWR updates (important for editing)
	$effect(() => { note = swrNote.data; });
	$effect(() => { meta = swrMeta.data; });
	$effect(() => { reactions = swrReactions.data; });

	let items = $derived(swrItems.data.items);
	let days = $state<string[]>([]);
	let dayCounts = $state<Record<string, number>>({});
	let columns = $state(2);
	let selectionMode = $state(false);
	let selected = $state(new Set<string>());
	let uploadPhase = $state<'idle' | 'compressing' | 'uploading'>('idle');
	let uploadCurrent = $state(0);
	let uploadTotal = $state(0);
	let viewerIndex = $state<number | null>(null);
	let deepLinkHandled = false;

	// Pull-to-refresh
	let isPulling = $state(false);
	let pullDist = $state(0);
	const PULL_THRESHOLD = 64;
	let pullStartY = 0;

	// Scroll memory (per day)
	let gridEl: HTMLDivElement | undefined;
	const scrollMemory = new Map<string, number>();

	// Pinch-to-zoom
	let pinchStartDist = 0;
	let pinchStartCols = 2;

	// URL cache with semaphore (max 3 concurrent fetches)
	const urlSemaphore = new Semaphore(3);
	let urlCache = new Map<string, string>();

	// --- Derived ---
	const mediaItems = $derived((items ?? []).filter((i) => isMediaFile(i.name)));
	const prefix = $derived(`${year}/${month}/${day}/`);

	$effect(() => {
		onCountChange?.(items === null ? null : mediaItems.length);
	});

	// --- Load data ---
	// --- Load data ---
	async function refreshAll() {
		await Promise.all([
			swrItems.refresh(),
			swrNote.refresh(),
			swrMeta.refresh(),
			swrReactions.refresh()
		]);
	}

	$effect(() => {
		// Handle deep link after items are loaded
		if (!deepLinkHandled && initialFile && items.length > 0) {
			deepLinkHandled = true;
			const idx = mediaItems.findIndex((i) => i.name.endsWith(initialFile));
			if (idx >= 0) viewerIndex = idx;
		}
	});

	async function loadDays() {
		const res = await listObjects(`${year}/${month}/`);
		const dayPrefixes = res.prefixes
			.map((p) => p.split('/')[2])
			.filter(Boolean)
			.sort();
		days = dayPrefixes;

		// Load counts in parallel
		const counts = await Promise.all(
			dayPrefixes.map(async (d) => {
				const r = await listObjects(`${year}/${month}/${d}/`);
				const count = r.items.filter((i) => isMediaFile(i.name)).length;
				return [d, count] as [string, number];
			})
		);
		dayCounts = Object.fromEntries(counts);
	}

	onMount(() => {
		loadDays();
	});

	// Reload when day changes + save/restore scroll
	$effect(() => {
		const _day = day;
		if (gridEl) scrollMemory.set(_day, 0); // reset on new day
		const saved = scrollMemory.get(_day) ?? 0;
		if (gridEl) gridEl.scrollTop = saved;
	});

	function onGridScroll() {
		if (gridEl) scrollMemory.set(day, gridEl.scrollTop);
	}

	// Pull-to-refresh + swipe horizontal handlers
	let swipeStartX = 0;
	let swipeStartY = 0;
	const SWIPE_THRESHOLD = 60;

	function onGridTouchStart(e: TouchEvent) {
		swipeStartX = e.touches[0].clientX;
		swipeStartY = e.touches[0].clientY;
		if (gridEl && gridEl.scrollTop === 0) {
			pullStartY = swipeStartY;
		}
	}

	function onGridTouchMove(e: TouchEvent) {
		if (e.touches.length !== 1) return;
		const dx = e.touches[0].clientX - swipeStartX;
		const dy = e.touches[0].clientY - swipeStartY;
		// Pull-to-refresh : mouvement vers le bas quand en haut du scroll
		if (pullStartY !== 0 && !gridEl?.scrollTop && dy > 0 && Math.abs(dy) > Math.abs(dx)) {
			pullDist = Math.min(dy, PULL_THRESHOLD * 1.5);
			isPulling = true;
		}
	}

	function onGridTouchEnd(e: TouchEvent) {
		if (isPulling && pullDist >= PULL_THRESHOLD) {
			refreshAll();
		}
		isPulling = false;
		pullDist = 0;
		pullStartY = 0;

		// Swipe horizontal → changer de jour (seulement si pas de scroll vertical significatif)
		const dx = (e.changedTouches[0]?.clientX ?? 0) - swipeStartX;
		const dy = (e.changedTouches[0]?.clientY ?? 0) - swipeStartY;
		if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) {
			if (dx < 0) goToNextDay(); // swipe gauche → jour suivant
			else goToPrevDay();        // swipe droite → jour précédent
		}
		swipeStartX = 0;
		swipeStartY = 0;
	}

	// Pinch-to-zoom handlers
	function onGridPinchStart(e: TouchEvent) {
		if (e.touches.length === 2) {
			const dx = e.touches[0].clientX - e.touches[1].clientX;
			const dy = e.touches[0].clientY - e.touches[1].clientY;
			pinchStartDist = Math.hypot(dx, dy);
			pinchStartCols = columns;
		}
	}

	function onGridPinchMove(e: TouchEvent) {
		if (e.touches.length !== 2 || pinchStartDist === 0) return;
		const dx = e.touches[0].clientX - e.touches[1].clientX;
		const dy = e.touches[0].clientY - e.touches[1].clientY;
		const dist = Math.hypot(dx, dy);
		const ratio = dist / pinchStartDist;
		// Pinch out (ratio > 1.3) → fewer columns, pinch in (ratio < 0.7) → more columns
		if (ratio > 1.3 && pinchStartCols > 2) {
			columns = pinchStartCols - 1;
			pinchStartDist = dist;
			pinchStartCols = columns;
		} else if (ratio < 0.7 && pinchStartCols < 4) {
			columns = pinchStartCols + 1;
			pinchStartDist = dist;
			pinchStartCols = columns;
		}
	}

	function onGridPinchEnd() {
		pinchStartDist = 0;
	}

	// --- URL fetching ---
	async function getUrl(name: string): Promise<string> {
		const cached = urlCache.get(name);
		if (cached) return cached;
		const url = await urlSemaphore.run(() => signDownload(name));
		urlCache.set(name, url);
		return url;
	}

	// Preload signed URLs for grid items
	$effect(() => {
		const visible = mediaItems.slice(0, 12);
		for (const item of visible) {
			if (!urlCache.has(item.name)) {
				getUrl(item.name).catch(() => {});
			}
		}
	});

	// --- Navigation ---
	function goToPrevDay() {
		const idx = days.indexOf(day);
		if (idx > 0) onDayChange(days[idx - 1]);
	}

	function goToNextDay() {
		const idx = days.indexOf(day);
		if (idx >= 0 && idx < days.length - 1) onDayChange(days[idx + 1]);
	}

	function cycleColumns() {
		columns = columns >= 4 ? 2 : columns + 1;
	}

	// --- Selection ---
	function toggleSelection(name: string) {
		const s = new Set(selected);
		if (s.has(name)) {
			s.delete(name);
		} else {
			s.add(name);
		}
		selected = s;
		selectionMode = s.size > 0;
	}

	function clearSelection() {
		selected = new Set();
		selectionMode = false;
	}

	// --- Upload ---
	async function handleUpload(files: FileList, uploadDate: string) {
		// uploadDate = YYYY-MM-DD (peut différer du jour affiché)
		const [upY, upM, upD] = uploadDate.split('-');

		const fileArray = Array.from(files);
		uploadTotal = fileArray.length;
		uploadCurrent = 0;

		const firstName = auth.getFirstName() || 'Chet';
		const metaUpdates: Record<string, string> = {};

		// Compress phase — en parallèle
		uploadPhase = 'compressing';
		const compressed = await Promise.all(
			fileArray.map(async (file) => {
				const isVid = /\.(mp4|mov|webm|avi|mkv)$/i.test(file.name);
				const result = isVid
					? { blob: file as Blob, contentType: file.type, filename: file.name }
					: await compressImage(file);
				uploadCurrent += 1;
				return result;
			})
		);

		// Upload phase — en parallèle
		uploadPhase = 'uploading';
		uploadCurrent = 0;
		await Promise.all(
			compressed.map(async ({ blob, contentType, filename }) => {
				const path = `${upY}/${upM}/${upD}/${filename}`;
				try {
					const signedUrl = await signUpload(path, contentType);
					const bytes = new Uint8Array(await blob.arrayBuffer());
					await uploadFile(signedUrl, bytes, contentType);
					metaUpdates[filename] = firstName;
				} catch (e) {
					console.error('Upload failed for', filename, e);
				} finally {
					uploadCurrent += 1;
				}
			})
		);

		// Save meta sur la date d'upload
		if (Object.keys(metaUpdates).length > 0) {
			const currentMeta = (upY === year && upM === month && upD === day) ? meta : {};
			const newMeta = { ...currentMeta, ...metaUpdates };
			await saveMeta(upY, upM, upD, newMeta);
			if (upY === year && upM === month && upD === day) meta = newMeta;
		}

		uploadPhase = 'idle';

		// Invalider le cache pour la date uploadée (et ses parents)
		invalidateListCache(`${upY}/${upM}/${upD}/`);

		// Naviguer vers la date d'upload si différente
		if (upY !== year || upM !== month || upD !== day) {
			onDateChange(upY, upM, upD);
		} else {
			refreshAll();
		}
	}

	// --- Delete ---
	async function deleteSelected() {
		if (selected.size === 0) return;
		const names = Array.from(selected);
		const confirmed = confirm(
			`Supprimer ${names.length} fichier(s) ? · លុប ${names.length} ឯកសារ ?`
		);
		if (!confirmed) return;

		await Promise.all(names.map((name) => deleteObject(name)));
		invalidateListCache(`${year}/${month}/${day}/`);
		clearSelection();
		refreshAll();
	}

	// --- Note ---
	async function handleNoteSave(text: string) {
		note = text;
		await apiSaveNote(year, month, day, text);
	}

	// --- Reactions ---
	async function handleReactionToggle(filename: string, emoji: string) {
		const key = filename.split('/').pop() ?? filename;
		const current = reactions[key] ?? [];
		let updated: string[];
		if (current.includes(emoji)) {
			updated = current.filter((e) => e !== emoji);
		} else {
			updated = [...current, emoji];
		}
		reactions = { ...reactions, [key]: updated };
		await apiSaveReactions(year, month, day, reactions);
	}

	// --- Share / Copy ---
	function handleCopyLink(filename: string) {
		const fname = filename.split('/').pop() ?? filename;
		const url = buildShareUrl(year, month, day, fname);
		navigator.clipboard.writeText(url).catch(() => {});
	}

	async function handleShare(filename: string) {
		const fname = filename.split('/').pop() ?? filename;
		const url = buildShareUrl(year, month, day, fname);
		if (navigator.share) {
			await navigator.share({ url });
		} else {
			navigator.clipboard.writeText(url).catch(() => {});
		}
	}

	// --- Viewer items (with url proxy for FileViewer) ---
	function viewerItems() {
		return mediaItems.map((item) => ({
			name: item.name,
			signedUrl: urlCache.get(item.name) ?? null
		}));
	}

	// Thumb width adapté au nombre de colonnes (largeur écran ~390px mobile)
	const thumbWidth = $derived(columns === 2 ? 600 : columns === 3 ? 300 : 200);

	// Day label for DayNavBar
	const currentDayLabel = $derived((() => { const l = dayLabel(`${year}-${month}-${day}`); return `${parseInt(day, 10)} ${l.fr} · ${l.kh}`; })());
</script>

<div class="day-files">
	<!-- Day navigation bar -->
	<DayNavBar
		label={currentDayLabel}
		hasPrev={days.indexOf(day) > 0}
		hasNext={days.indexOf(day) < days.length - 1}
		{columns}
		onPrev={goToPrevDay}
		onNext={goToNextDay}
		onCycleColumns={cycleColumns}
	/>

	<!-- Days chip bar -->
	<DaysChipBar
		{days}
		{dayCounts}
		currentDay={day}
		{year}
		{month}
		onSelect={onDayChange}
	/>

	<!-- Note field -->
	<NoteField {note} onSave={handleNoteSave} />

	<!-- Selection action bar -->
	{#if selectionMode}
		<div class="selection-bar">
			<span>{selected.size} sélectionné(s)</span>
			<div class="selection-actions">
				<button onclick={deleteSelected} class="delete-btn">🗑 Supprimer</button>
				<button onclick={clearSelection}>Annuler</button>
			</div>
		</div>
	{/if}

	<!-- Pull-to-refresh indicator -->
	{#if isPulling}
		<div class="pull-indicator" style="height: {Math.min(pullDist, PULL_THRESHOLD)}px">
			<span class:ready={pullDist >= PULL_THRESHOLD}>
				{pullDist >= PULL_THRESHOLD ? '↑ Relâcher' : '↓ Tirer pour rafraîchir'}
			</span>
		</div>
	{/if}

	<!-- Grid -->
	<div
		class="grid"
		style="--cols: {columns}; --cell-size: calc((100vw - {columns + 1} * var(--space-1)) / {columns})"
		bind:this={gridEl}
		onscroll={onGridScroll}
		ontouchstart={(e) => { onGridTouchStart(e); onGridPinchStart(e); }}
		ontouchmove={(e) => { onGridTouchMove(e); onGridPinchMove(e); }}
		ontouchend={(e) => { onGridTouchEnd(e); onGridPinchEnd(); }}
		ontouchcancel={(e) => { onGridTouchEnd(e); onGridPinchEnd(); }}
	>
		{#if swrItems.loading && items.length === 0}
			<!-- Skeleton -->
			{#each [1,2,3,4,5,6] as _}
				<div class="skeleton"></div>
			{/each}
		{:else if mediaItems.length === 0}
			<div class="empty">
				<p>Aucun fichier · គ្មានឯកសារ</p>
			</div>
		{:else}
			{#each mediaItems as item, i}
				<FileTile
					name={item.name}
					signedUrl={urlCache.get(item.name) ?? null}
					uploader={meta[item.name.split('/').pop() ?? ''] ?? null}
					reactions={reactions[item.name.split('/').pop() ?? ''] ?? []}
					selected={selected.has(item.name)}
					{selectionMode}
					{thumbWidth}
					onTap={() => (viewerIndex = i)}
					onLongPress={() => toggleSelection(item.name)}
				/>
			{/each}
		{/if}
	</div>

	<!-- FAB Upload -->
	<FabUpload
		phase={uploadPhase}
		current={uploadCurrent}
		total={uploadTotal}
		currentDate={`${year}-${month}-${day}`}
		onFiles={handleUpload}
	/>

	<!-- File Viewer -->
	{#if viewerIndex !== null}
		<FileViewer
			items={viewerItems()}
			initialIndex={viewerIndex}
			{reactions}
			hasPrevDay={days.indexOf(day) > 0}
			hasNextDay={days.indexOf(day) < days.length - 1}
			onClose={() => (viewerIndex = null)}
			onReactionToggle={handleReactionToggle}
			onGetUrl={getUrl}
			onShare={handleShare}
			onCopyLink={handleCopyLink}
			onPrevDay={() => { onDayChange(days[days.indexOf(day) - 1]); viewerIndex = null; }}
			onNextDay={() => { onDayChange(days[days.indexOf(day) + 1]); viewerIndex = null; }}
		/>
	{/if}
</div>

<style>
	.day-files {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
	}

	/* Pull-to-refresh */
	.pull-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		flex-shrink: 0;
		transition: height 0.1s;
		font-size: var(--fs-sm);
		color: var(--muted);
	}

	.pull-indicator span.ready {
		color: var(--accent);
	}

	/* Selection bar */
	.selection-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-2) var(--space-4);
		background: var(--card);
		border-bottom: 1px solid var(--border);
		font-size: var(--fs-base);
		flex-shrink: 0;
	}

	.selection-actions {
		display: flex;
		gap: var(--space-3);
		align-items: center;
	}

	.delete-btn {
		color: #ff6b6b;
	}

	/* Grid */
	.grid {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-1);
		display: grid;
		grid-template-columns: repeat(var(--cols), 1fr);
		grid-auto-rows: var(--cell-size);
		gap: var(--space-1);
		-webkit-overflow-scrolling: touch;
		padding-bottom: calc(var(--nav-height) + env(safe-area-inset-bottom, 0px) + var(--nav-height));
	}

	/* Skeleton */
	.skeleton {
		aspect-ratio: 1;
		background: var(--card);
		border-radius: var(--radius-sm);
		animation: shimmer 1.4s ease-in-out infinite;
	}

	@keyframes shimmer {
		0%, 100% { opacity: 0.4; }
		50% { opacity: 0.8; }
	}

	/* Empty */
	.empty {
		grid-column: 1 / -1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 48px 16px;
		color: var(--muted);
		font-size: 14px;
	}
</style>
