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
		hasPrevDay: boolean;
		hasNextDay: boolean;
		onClose: () => void;
		onReactionToggle: (filename: string, emoji: string) => void;
		onGetUrl: (name: string) => Promise<string>;
		onShare: (filename: string) => void;
		onCopyLink: (filename: string) => void;
		onPrevDay: () => void;
		onNextDay: () => void;
	}

	let {
		items,
		initialIndex,
		reactions,
		hasPrevDay,
		hasNextDay,
		onClose,
		onReactionToggle,
		onGetUrl,
		onShare,
		onCopyLink,
		onPrevDay,
		onNextDay
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
	let isAnimating = $state(false);

	function onTouchStart(e: TouchEvent) {
		if (isAnimating) return;
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
			isDragging = false;
			dragDelta = 0;
			return;
		}
		e.preventDefault();
		dragDelta = dx;
	}

	function onTouchEnd() {
		if (!isDragging) return;
		isDragging = false;
		const threshold = window.innerWidth * 0.25;
		if (dragDelta < -threshold) {
			if (currentIndex < items.length - 1) {
				currentIndex++;
			} else if (hasNextDay) {
				onNextDay();
			}
		} else if (dragDelta > threshold) {
			if (currentIndex > 0) {
				currentIndex--;
			} else if (hasPrevDay) {
				onPrevDay();
			}
		}
		dragDelta = 0;
	}

	// Keyboard navigation
	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
		if (e.key === 'ArrowRight') {
			if (currentIndex < items.length - 1) currentIndex++;
			else if (hasNextDay) onNextDay();
		}
		if (e.key === 'ArrowLeft') {
			if (currentIndex > 0) currentIndex--;
			else if (hasPrevDay) onPrevDay();
		}
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
	const currentReactions = $derived(reactions[currentItem?.name?.split('/').pop() ?? ''] ?? []);

	// Le strip se décale de (slideWidth + gap) par index, puis recalé de +peek pour centrer
	// Tout est exprimé via les variables CSS --peek et --gap — aucun px hardcodé ici
	const stripStyle = $derived(
		`transform: translateX(calc(${-currentIndex} * (var(--slide-w) + var(--gap)) + var(--peek) + ${dragDelta}px)); transition: ${isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)'}`
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

	<!-- Media strip (peek effect: all items side by side) -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="media-strip-wrapper" onclick={toggleBars}>
		<div class="media-strip" style={stripStyle}>
			{#each items as item, i}
				{@const url = urlCache[i] ?? null}
				<div class="media-slide">
					{#if url}
						{#if isVideo(item.name)}
							<video
								src={url}
								controls
								playsinline
								class="media-video"
								onclick={(e) => e.stopPropagation()}
							></video>
						{:else}
							<img src={url} alt={item.name} class="media-img" />
						{/if}
					{:else if i === currentIndex}
						<div class="media-loading">⏳</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>

	<!-- Navigation arrows (desktop) -->
	{#if currentIndex > 0 || hasPrevDay}
		<button
			class="nav-arrow nav-prev"
			class:cross-day={currentIndex === 0 && hasPrevDay}
			onclick={() => currentIndex > 0 ? currentIndex-- : onPrevDay()}
			aria-label="Précédent"
		>‹</button>
	{/if}
	{#if currentIndex < items.length - 1 || hasNextDay}
		<button
			class="nav-arrow nav-next"
			class:cross-day={currentIndex === items.length - 1 && hasNextDay}
			onclick={() => currentIndex < items.length - 1 ? currentIndex++ : onNextDay()}
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
		overflow: hidden;
		animation: viewer-open 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
	}

	@keyframes viewer-open {
		from { opacity: 0; transform: scale(0.96); }
		to   { opacity: 1; transform: scale(1); }
	}

	/* Top bar */
	.top-bar {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		display: flex;
		align-items: center;
		padding: var(--space-3) var(--space-2);
		padding-top: calc(var(--space-3) + env(safe-area-inset-top, 0px));
		background: linear-gradient(to bottom, rgba(0, 0, 0, 0.7), transparent);
		z-index: 10;
		gap: var(--space-2);
	}

	.filename {
		flex: 1;
		font-size: var(--fs-base);
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
		font-size: var(--fs-xl);
		padding: var(--space-2) var(--space-2);
		border-radius: var(--radius-sm);
		background: rgba(255, 255, 255, 0.1);
		flex-shrink: 0;
	}

	/* Media strip (peek effect) */
	.media-strip-wrapper {
		position: absolute;
		inset: 0;
		overflow: hidden;
		--peek: 20px;
		--gap: 8px;
		--slide-w: calc(100% - 2 * var(--peek));
	}

	.media-strip {
		display: flex;
		width: 100%;
		height: 100%;
		will-change: transform;
		gap: var(--gap);
	}

	.media-slide {
		flex: 0 0 var(--slide-w);
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-md);
		overflow: hidden;
		background: #111;
	}

	.media-img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		display: block;
		user-select: none;
		-webkit-user-drag: none;
	}

	.media-video {
		max-width: 100%;
		max-height: 100%;
	}

	.media-loading {
		font-size: 3rem;
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
		font-size: var(--fs-3xl);
		color: rgba(255, 255, 255, 0.7);
		padding: var(--space-2) var(--space-3);
		background: rgba(0, 0, 0, 0.3);
		border-radius: var(--radius-sm);
		z-index: 10;
		transition: background 0.15s;
	}

	.nav-arrow:hover {
		background: rgba(0, 0, 0, 0.6);
	}

	.nav-prev { left: var(--space-2); }
	.nav-next { right: var(--space-2); }

	.nav-arrow.cross-day {
		opacity: 0.5;
		border: 1px solid rgba(232, 164, 184, 0.4);
	}

	/* Bottom bar */
	.bottom-bar {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		padding: var(--space-4) var(--space-3);
		padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom, 0px));
		background: linear-gradient(to top, rgba(0, 0, 0, 0.7), transparent);
		z-index: 10;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
	}

	.reactions-row {
		display: flex;
		gap: var(--space-2);
	}

	.reaction-btn {
		font-size: var(--fs-2xl);
		width: var(--btn-tap);
		height: var(--btn-tap);
		border-radius: var(--radius-full);
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
		font-size: var(--fs-sm);
		color: rgba(255, 255, 255, 0.5);
	}

	/* Toast */
	.toast {
		position: absolute;
		bottom: calc(6.25rem + env(safe-area-inset-bottom, 0px));
		left: 50%;
		transform: translateX(-50%);
		background: color-mix(in srgb, var(--accent) 90%, transparent);
		color: var(--on-accent);
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-2xl);
		font-size: var(--fs-base);
		font-weight: 600;
		white-space: nowrap;
		z-index: 20;
	}
</style>
