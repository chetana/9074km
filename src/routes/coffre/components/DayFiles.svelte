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
		previewUrl as buildShareUrl,
		type CoffreItem
	} from '$lib/api';
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
	}

	let { year, month, day, initialFile, onDayChange }: Props = $props();

	// --- State ---
	let items = $state<CoffreItem[] | null>(null);
	let days = $state<string[]>([]);
	let dayCounts = $state<Record<string, number>>({});
	let note = $state('');
	let meta = $state<Record<string, string>>({});
	let reactions = $state<Record<string, string[]>>({});
	let columns = $state(2);
	let selectionMode = $state(false);
	let selected = $state(new Set<string>());
	let uploadPhase = $state<'idle' | 'compressing' | 'uploading'>('idle');
	let uploadCurrent = $state(0);
	let uploadTotal = $state(0);
	let viewerIndex = $state<number | null>(null);
	let deepLinkHandled = false;

	// URL cache with semaphore (max 3 concurrent fetches)
	const urlSemaphore = new Semaphore(3);
	let urlCache = new Map<string, string>();

	// --- Derived ---
	const mediaItems = $derived((items ?? []).filter((i) => isMediaFile(i.name)));
	const prefix = $derived(`${year}/${month}/${day}/`);

	// --- Load data ---
	async function loadAll() {
		items = null;
		const [itemsRes, noteRes, metaRes, reactionsRes] = await Promise.all([
			listObjects(prefix),
			fetchNote(year, month, day).catch(() => ''),
			fetchMeta(year, month, day).catch(() => ({})),
			fetchReactions(year, month, day).catch(() => ({}))
		]);
		items = itemsRes.items;
		note = noteRes;
		meta = metaRes;
		reactions = reactionsRes;

		// Handle deep link after first load
		if (!deepLinkHandled && initialFile) {
			deepLinkHandled = true;
			const idx = mediaItems.findIndex((i) => i.name.endsWith(initialFile));
			if (idx >= 0) viewerIndex = idx;
		}
	}

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
		loadAll();
		loadDays();
	});

	// Reload when day changes
	$effect(() => {
		const _ = day;
		loadAll();
	});

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
	async function handleUpload(files: FileList) {
		const fileArray = Array.from(files);
		uploadTotal = fileArray.length;
		uploadCurrent = 0;

		const firstName = auth.getFirstName() ?? 'Chet';
		const metaUpdates: Record<string, string> = {};

		// Compress phase
		uploadPhase = 'compressing';
		const compressed: Array<{ blob: Blob; contentType: string; filename: string; original: File }> =
			[];
		for (let i = 0; i < fileArray.length; i++) {
			uploadCurrent = i + 1;
			const file = fileArray[i];
			const isVid = /\.(mp4|mov|webm|avi|mkv)$/i.test(file.name);
			if (isVid) {
				compressed.push({ blob: file, contentType: file.type, filename: file.name, original: file });
			} else {
				const result = await compressImage(file);
				compressed.push({ ...result, original: file });
			}
		}

		// Upload phase
		uploadPhase = 'uploading';
		uploadCurrent = 0;
		for (let i = 0; i < compressed.length; i++) {
			uploadCurrent = i + 1;
			const { blob, contentType, filename } = compressed[i];
			const path = `${year}/${month}/${day}/${filename}`;
			try {
				const signedUrl = await signUpload(path, contentType);
				const bytes = new Uint8Array(await blob.arrayBuffer());
				await uploadFile(signedUrl, bytes, contentType);
				metaUpdates[filename] = firstName;
			} catch (e) {
				console.error('Upload failed for', filename, e);
			}
		}

		// Save meta
		if (Object.keys(metaUpdates).length > 0) {
			const newMeta = { ...meta, ...metaUpdates };
			await saveMeta(year, month, day, newMeta);
			meta = newMeta;
		}

		uploadPhase = 'idle';
		loadAll();
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
		clearSelection();
		loadAll();
	}

	// --- Note ---
	async function handleNoteSave(text: string) {
		note = text;
		await apiSaveNote(year, month, day, text);
	}

	// --- Reactions ---
	async function handleReactionToggle(filename: string, emoji: string) {
		const current = reactions[filename] ?? [];
		let updated: string[];
		if (current.includes(emoji)) {
			updated = current.filter((e) => e !== emoji);
		} else {
			updated = [...current, emoji];
		}
		reactions = { ...reactions, [filename]: updated };
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

	<!-- Grid -->
	<div class="grid" style="--cols: {columns}">
		{#if items === null}
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
					reactions={reactions[item.name] ?? []}
					selected={selected.has(item.name)}
					{selectionMode}
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
		onFiles={handleUpload}
	/>

	<!-- File Viewer -->
	{#if viewerIndex !== null}
		<FileViewer
			items={viewerItems()}
			initialIndex={viewerIndex}
			{reactions}
			onClose={() => (viewerIndex = null)}
			onReactionToggle={handleReactionToggle}
			onGetUrl={getUrl}
			onShare={handleShare}
			onCopyLink={handleCopyLink}
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

	/* Selection bar */
	.selection-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 16px;
		background: var(--card);
		border-bottom: 1px solid var(--border);
		font-size: 13px;
		flex-shrink: 0;
	}

	.selection-actions {
		display: flex;
		gap: 12px;
		align-items: center;
	}

	.delete-btn {
		color: #ff6b6b;
	}

	/* Grid */
	.grid {
		flex: 1;
		overflow-y: auto;
		padding: 4px;
		display: grid;
		grid-template-columns: repeat(var(--cols), 1fr);
		gap: 4px;
		-webkit-overflow-scrolling: touch;
		padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px) + 72px);
	}

	/* Skeleton */
	.skeleton {
		aspect-ratio: 1;
		background: var(--card);
		border-radius: 8px;
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
