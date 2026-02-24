<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fly } from 'svelte/transition';
	import { REACTIONS } from '$lib/i18n';

	interface FileItem {
		name: string;
		signedUrl: string | null;
	}

	interface Props {
		items: FileItem[];
		initialIndex: number;
		reactions: Record<string, string[]>;
		onClose: () => void;
		onReactionToggle: (filename: string, emoji: string) => void;
		onGetUrl: (name: string) => Promise<string>;
		onShare: (filename: string) => void;
		onCopyLink: (filename: string) => void;
	}

	let {
		items,
		initialIndex,
		reactions,
		onClose,
		onReactionToggle,
		onGetUrl,
		onShare,
		onCopyLink
	}: Props = $props();

	let currentIndex = $state(initialIndex);
	let barsVisible = $state(true);
	let toastMsg = $state<string | null>(null);
	let toastTimer: ReturnType<typeof setTimeout> | null = null;

	// Signed URL cache for viewer (load adjacent items too)
	let urlCache = $state<Record<number, string>>({});

	async function loadUrl(idx: number) {
		if (urlCache[idx] || idx < 0 || idx >= items.length) return;
		const item = items[idx];
		if (!item) return;
		if (item.signedUrl) {
			urlCache = { ...urlCache, [idx]: item.signedUrl };
			return;
		}
		const url = await onGetUrl(item.name);
		urlCache = { ...urlCache, [idx]: url };
	}

	// Load current + adjacent on index change
	$effect(() => {
		const i = currentIndex;
		loadUrl(i);
		loadUrl(i + 1);
		loadUrl(i - 1);
	});

	function toggleBars() {
		barsVisible = !barsVisible;
	}

	function showToast(msg: string) {
		toastMsg = msg;
		if (toastTimer) clearTimeout(toastTimer);
		toastTimer = setTimeout(() => {
			toastMsg = null;
		}, 2000);
	}

	function handleCopyLink() {
		onCopyLink(items[currentIndex].name);
		showToast('Copié · ចម្លង');
	}

	function handleShare() {
		onShare(items[currentIndex].name);
	}

	function isVideo(name: string) {
		return /\.(mp4|mov|webm|avi|mkv)$/i.test(name);
	}

	// Swipe / touch navigation
	let touchStartX = 0;
	let touchStartY = 0;
	let isDragging = false;
	let dragDelta = $state(0);

	function onTouchStart(e: TouchEvent) {
		touchStartX = e.touches[0].clientX;
		touchStartY = e.touches[0].clientY;
		isDragging = true;
		dragDelta = 0;
	}

	function onTouchMove(e: TouchEvent) {
		if (!isDragging) return;
		const dx = e.touches[0].clientX - touchStartX;
		const dy = Math.abs(e.touches[0].clientY - touchStartY);
		if (dy > 30 && Math.abs(dx) < dy) {
			// Vertical scroll — cancel drag
			isDragging = false;
			dragDelta = 0;
			return;
		}
		dragDelta = dx;
	}

	function onTouchEnd() {
		if (!isDragging) return;
		isDragging = false;
		if (dragDelta < -60 && currentIndex < items.length - 1) {
			currentIndex++;
		} else if (dragDelta > 60 && currentIndex > 0) {
			currentIndex--;
		}
		dragDelta = 0;
	}

	// Keyboard navigation
	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
		if (e.key === 'ArrowRight' && currentIndex < items.length - 1) currentIndex++;
		if (e.key === 'ArrowLeft' && currentIndex > 0) currentIndex--;
	}

	onMount(() => {
		window.addEventListener('keydown', onKeyDown);
		// Prevent body scroll
		document.body.style.overflow = 'hidden';
	});

	onDestroy(() => {
		window.removeEventListener('keydown', onKeyDown);
		document.body.style.overflow = '';
		if (toastTimer) clearTimeout(toastTimer);
	});

	const currentItem = $derived(items[currentIndex]);
	const currentUrl = $derived(urlCache[currentIndex] ?? null);
	const currentReactions = $derived(reactions[currentItem?.name] ?? []);

	// Slide transform with drag feedback
	const slideStyle = $derived(
		isDragging ? `transform: translateX(${dragDelta}px)` : 'transform: translateX(0)'
	);
</script>

<!-- Backdrop -->
<div
	class="viewer-backdrop"
	role="dialog"
	aria-modal="true"
	ontouchstart={onTouchStart}
	ontouchmove={onTouchMove}
	ontouchend={onTouchEnd}
>
	<!-- Top bar -->
	{#if barsVisible}
		<div class="top-bar" transition:fly={{ y: -48, duration: 200 }}>
			<button class="bar-btn" onclick={onClose} aria-label="Fermer">✕</button>
			<span class="filename">{currentItem?.name?.split('/').pop() ?? ''}</span>
			<div class="bar-actions">
				<button class="bar-btn" onclick={handleCopyLink} aria-label="Copier le lien">🔗</button>
				<button class="bar-btn" onclick={handleShare} aria-label="Partager">⬆</button>
			</div>
		</div>
	{/if}

	<!-- Media area -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="media-area" onclick={toggleBars} style={slideStyle}>
		{#if currentUrl}
			{#if isVideo(currentItem.name)}
				<video
					src={currentUrl}
					controls
					playsinline
					class="media-video"
					onclick={(e) => e.stopPropagation()}
				></video>
			{:else}
				<img src={currentUrl} alt={currentItem?.name} class="media-img" />
			{/if}
		{:else}
			<div class="media-loading">⏳</div>
		{/if}
	</div>

	<!-- Navigation arrows (desktop) -->
	{#if currentIndex > 0}
		<button
			class="nav-arrow nav-prev"
			onclick={() => currentIndex--}
			aria-label="Précédent"
		>‹</button>
	{/if}
	{#if currentIndex < items.length - 1}
		<button
			class="nav-arrow nav-next"
			onclick={() => currentIndex++}
			aria-label="Suivant"
		>›</button>
	{/if}

	<!-- Bottom bar -->
	{#if barsVisible}
		<div class="bottom-bar" transition:fly={{ y: 80, duration: 200 }}>
			<!-- Reactions -->
			<div class="reactions-row">
				{#each REACTIONS as emoji}
					{@const active = currentReactions.includes(emoji)}
					<button
						class="reaction-btn"
						class:active
						onclick={() => onReactionToggle(currentItem.name, emoji)}
					>
						{emoji}
					</button>
				{/each}
			</div>
			<!-- Index indicator -->
			<div class="index-indicator">{currentIndex + 1} / {items.length}</div>
		</div>
	{/if}

	<!-- Toast -->
	{#if toastMsg}
		<div class="toast" transition:fly={{ y: 20, duration: 200 }}>
			{toastMsg}
		</div>
	{/if}
</div>

<style>
	.viewer-backdrop {
		position: fixed;
		inset: 0;
		background: #000;
		z-index: 200;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	/* Top bar */
	.top-bar {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		display: flex;
		align-items: center;
		padding: 12px 8px;
		padding-top: calc(12px + env(safe-area-inset-top, 0px));
		background: linear-gradient(to bottom, rgba(0, 0, 0, 0.7), transparent);
		z-index: 10;
		gap: 8px;
	}

	.filename {
		flex: 1;
		font-size: 13px;
		color: rgba(255, 255, 255, 0.85);
		text-align: center;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.bar-actions {
		display: flex;
		gap: 4px;
	}

	.bar-btn {
		color: white;
		font-size: 18px;
		padding: 6px 8px;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.1);
		flex-shrink: 0;
	}

	/* Media */
	.media-area {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: transform 0.08s linear;
	}

	.media-img {
		max-width: 100%;
		max-height: 100vh;
		object-fit: contain;
		display: block;
		user-select: none;
		-webkit-user-drag: none;
	}

	.media-video {
		max-width: 100%;
		max-height: 100vh;
	}

	.media-loading {
		font-size: 48px;
		animation: pulse 1.2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 0.5; }
		50% { opacity: 1; }
	}

	/* Nav arrows */
	.nav-arrow {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		font-size: 40px;
		color: rgba(255, 255, 255, 0.7);
		padding: 8px 12px;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 8px;
		z-index: 10;
		transition: background 0.15s;
	}

	.nav-arrow:hover {
		background: rgba(0, 0, 0, 0.6);
	}

	.nav-prev { left: 8px; }
	.nav-next { right: 8px; }

	/* Bottom bar */
	.bottom-bar {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		padding: 16px 12px;
		padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
		background: linear-gradient(to top, rgba(0, 0, 0, 0.7), transparent);
		z-index: 10;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}

	.reactions-row {
		display: flex;
		gap: 8px;
	}

	.reaction-btn {
		font-size: 24px;
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.1);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: transform 0.15s, background 0.15s;
	}

	.reaction-btn.active {
		background: var(--accent);
		transform: scale(1.2);
	}

	.index-indicator {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.5);
	}

	/* Toast */
	.toast {
		position: absolute;
		bottom: calc(100px + env(safe-area-inset-bottom, 0px));
		left: 50%;
		transform: translateX(-50%);
		background: rgba(232, 164, 184, 0.9);
		color: #0f0f1a;
		padding: 8px 20px;
		border-radius: 20px;
		font-size: 13px;
		font-weight: 600;
		white-space: nowrap;
		z-index: 20;
	}
</style>
