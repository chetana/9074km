<script lang="ts">
	import { ogImageUrl } from '$lib/api';
	import { generateVideoThumbnail } from '$lib/thumbnailer';

	interface Props {
		name: string;
		signedUrl: string | null;
		uploader: string | null;
		reactions: string[];
		selected: boolean;
		selectionMode: boolean;
		thumbWidth: number;
		onTap: () => void;
		onLongPress: () => void;
	}

	let { name, signedUrl, uploader, reactions, selected, selectionMode, thumbWidth, onTap, onLongPress }: Props =
		$props();

	const isVideo = $derived(
		/\.(mp4|mov|webm|avi|mkv)$/i.test(name)
	);

	// Video thumbnail
	let videoThumb = $state<string | null>(null);
	$effect(() => {
		if (isVideo && signedUrl && !videoThumb) {
			generateVideoThumbnail(signedUrl).then((blob) => {
				if (blob) videoThumb = URL.createObjectURL(blob);
			});
		}
	});

	// Long-press detection
	let pressTimer: ReturnType<typeof setTimeout> | null = null;
	let pressStartX = 0;
	let pressStartY = 0;

	function onPointerDown(e: PointerEvent) {
		pressStartX = e.clientX;
		pressStartY = e.clientY;
		pressTimer = setTimeout(() => {
			pressTimer = null;
			onLongPress();
		}, 500);
	}

	function onPointerMove(e: PointerEvent) {
		if (pressTimer) {
			const dx = Math.abs(e.clientX - pressStartX);
			const dy = Math.abs(e.clientY - pressStartY);
			if (dx > 10 || dy > 10) {
				clearTimeout(pressTimer);
				pressTimer = null;
			}
		}
	}

	function onPointerUp() {
		if (pressTimer) {
			clearTimeout(pressTimer);
			pressTimer = null;
		}
	}

	function handleTap() {
		if (selectionMode) {
			onLongPress(); // toggle selection
		} else {
			onTap();
		}
	}

	// Image src: use og-image proxy for images, videoThumb for videos
	const imgSrc = $derived(isVideo ? videoThumb : ogImageUrl(name, thumbWidth));

	// Show up to 3 reaction emojis
	const reactionDisplay = $derived(reactions.slice(0, 3));
</script>

<div
	class="tile"
	class:selected
	role="button"
	tabindex="0"
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerUp}
	onclick={handleTap}
	onkeydown={(e) => e.key === 'Enter' && handleTap()}
>
	<!-- Media -->
	{#if imgSrc}
		<img src={imgSrc} alt={name} loading="lazy" />
	{:else}
		<div class="placeholder">
			{#if isVideo}🎥{:else}🖼{/if}
		</div>
	{/if}

	<!-- Video play overlay -->
	{#if isVideo}
		<div class="play-overlay">▶</div>
	{/if}

	<!-- Selection checkbox -->
	{#if selectionMode}
		<div class="checkbox" class:checked={selected}>
			{#if selected}✓{/if}
		</div>
	{/if}

	<!-- Uploader badge -->
	{#if uploader}
		<div class="uploader-badge">{uploader}</div>
	{/if}

	<!-- Reactions badge -->
	{#if reactionDisplay.length > 0}
		<div class="reactions-badge">{reactionDisplay.join('')}</div>
	{/if}
</div>

<style>
	.tile {
		position: relative;
		width: 100%;
		height: 100%;
		background: var(--surface);
		border-radius: var(--radius-sm);
		overflow: hidden;
		cursor: pointer;
		border: 2px solid transparent;
		transition: border-color 0.15s, transform 0.18s cubic-bezier(0.34, 1.3, 0.64, 1), box-shadow 0.18s ease;
	}

	/* Gradient de lisibilité permanent (bas de la vignette) */
	.tile::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(
			to top,
			rgba(0,0,0,0.45) 0%,
			rgba(0,0,0,0.15) 35%,
			transparent 60%
		);
		pointer-events: none;
		border-radius: inherit;
		opacity: 0.6;
		transition: opacity 0.2s;
	}

	.tile:hover {
		transform: scale(1.04);
		box-shadow: 0 6px 20px rgba(0,0,0,0.4), 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent);
	}

	.tile:hover::after {
		opacity: 0.8;
	}

	.tile.selected {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent);
	}

	.tile img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 2rem;
		color: var(--muted);
	}

	.play-overlay {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 2.25rem;
		height: 2.25rem;
		background: rgba(0, 0, 0, 0.6);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: var(--fs-md);
		color: white;
		pointer-events: none;
	}

	.checkbox {
		position: absolute;
		top: var(--space-1);
		right: var(--space-1);
		width: 1.375rem;
		height: 1.375rem;
		border-radius: 50%;
		border: 2px solid white;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: var(--fs-sm);
		color: white;
	}

	.checkbox.checked {
		background: var(--accent);
		border-color: var(--accent);
	}

	.uploader-badge {
		position: absolute;
		bottom: var(--space-1);
		left: var(--space-1);
		font-size: var(--fs-xs);
		background: rgba(0, 0, 0, 0.65);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		color: rgba(255,255,255,0.9);
		padding: 2px 7px;
		border-radius: var(--radius-full);
		max-width: 60%;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		z-index: 1;
	}

	.reactions-badge {
		position: absolute;
		bottom: var(--space-1);
		right: var(--space-1);
		font-size: 0.9rem;
		background: rgba(0, 0, 0, 0.55);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		padding: 2px 6px;
		border-radius: var(--radius-full);
		letter-spacing: 1px;
		z-index: 1;
	}
</style>
