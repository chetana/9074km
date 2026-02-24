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
		onTap: () => void;
		onLongPress: () => void;
	}

	let { name, signedUrl, uploader, reactions, selected, selectionMode, onTap, onLongPress }: Props =
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
	const imgSrc = $derived(isVideo ? videoThumb : ogImageUrl(name, 300));

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
		aspect-ratio: 1;
		background: var(--card);
		border-radius: 8px;
		overflow: hidden;
		cursor: pointer;
		border: 2px solid transparent;
		transition: border-color 0.15s;
	}

	.tile.selected {
		border-color: var(--accent);
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
		font-size: 32px;
		color: var(--muted);
	}

	.play-overlay {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 36px;
		height: 36px;
		background: rgba(0, 0, 0, 0.6);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 14px;
		color: white;
		pointer-events: none;
	}

	.checkbox {
		position: absolute;
		top: 6px;
		right: 6px;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 2px solid white;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 12px;
		color: white;
	}

	.checkbox.checked {
		background: var(--accent);
		border-color: var(--accent);
	}

	.uploader-badge {
		position: absolute;
		bottom: 4px;
		left: 4px;
		font-size: 10px;
		background: rgba(0, 0, 0, 0.6);
		color: white;
		padding: 2px 5px;
		border-radius: 4px;
		max-width: 60%;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.reactions-badge {
		position: absolute;
		bottom: 4px;
		right: 4px;
		font-size: 13px;
		background: rgba(0, 0, 0, 0.5);
		padding: 2px 4px;
		border-radius: 6px;
		letter-spacing: 1px;
	}
</style>
