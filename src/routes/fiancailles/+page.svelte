<script lang="ts">
	import { onMount, onDestroy } from 'svelte'
	import { page } from '$app/stores'
	import { goto } from '$app/navigation'

	// ── Date params (default: 22 mai 2026) ──────────────────────────────
	let Y = $derived($page.url.searchParams.get('y') ?? '2026')
	let M = $derived($page.url.searchParams.get('m') ?? '05')
	let D = $derived($page.url.searchParams.get('d') ?? '22')

	type Quality = '240p' | '480p' | 'hd'

	type Item = {
		path: string
		name: string
		type: 'image' | 'video'
		signedUrl: string | null        // original (VP9 — desktop only)
		signedUrl240p: string | null
		signedUrl480p: string | null
		lowResPath: string | null       // _240p GCS path
		midResPath: string | null       // _480p GCS path
		fetching: boolean
	}

	let items      = $state<Item[]>([])
	let allPhotos  = $state<Item[]>([])
	let allVideos  = $state<Item[]>([])
	let shuffled   = $state(true)
	// iOS/Android : démarre en 240p ; desktop : 480p (le VP9 original est souvent trop lourd)
	const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|Android/i.test(navigator.userAgent)
	let quality    = $state<Quality>(isMobile ? '240p' : '480p')
	let photos     = $derived(shuffled ? items.filter(i => i.type === 'image') : allPhotos)
	let videos     = $derived(shuffled ? items.filter(i => i.type === 'video') : allVideos)
	let sel        = $state(0)
	let vidSel     = $state(0)
	let loading    = $state(true)
	let err        = $state<string | null>(null)

	function vidUrl(item: Item): string | null {
		if (quality === '240p') return item.signedUrl240p ?? item.signedUrl480p ?? item.signedUrl
		if (quality === '480p') return item.signedUrl480p ?? item.signedUrl240p ?? item.signedUrl
		return item.signedUrl ?? item.signedUrl480p ?? item.signedUrl240p
	}

	function cycleQuality() {
		if (isMobile) quality = quality === '240p' ? '480p' : '240p'
		else quality = quality === '480p' ? 'hd' : quality === 'hd' ? '240p' : '480p'
	}

	// ── Slideshow ────────────────────────────────────────────────────────
	let autoplay  = $state(true)
	let autoTimer: ReturnType<typeof setTimeout> | null = null
	const PHOTO_DELAY = 4000

	function clearTimer() { if (autoTimer) { clearTimeout(autoTimer); autoTimer = null } }

	function scheduleNext() {
		clearTimer()
		if (!autoplay || !photos.length) return
		autoTimer = setTimeout(() => {
			sel = (sel + 1) % photos.length  // boucle infinie
			loadAround(sel)
		}, PHOTO_DELAY)
	}

	// ── Video séquentiel ─────────────────────────────────────────────────
	// iOS bloque autoplay avec son sans interaction — on démarre muet
	let videoMuted = $state(true)
	function toggleSound() { videoMuted = !videoMuted }

	function onVideoEnded() {
		vidSel = (vidSel + 1) % videos.length
	}

	$effect(() => {
		sel; autoplay
		if (autoplay) scheduleNext()
		else clearTimer()
		return () => clearTimer()
	})

	function toggleAutoplay() { autoplay = !autoplay }

	function toggleShuffle() {
		shuffled = !shuffled
		sel = 0; vidSel = 0
		if (shuffled) {
			// Re-shuffle à chaque activation
			const sp = shuffle(allPhotos); const sv = shuffle(allVideos)
			items = [...sp, ...sv]
		}
		loadAround(0)
	}

	// ── Shuffle (Fisher-Yates) ───────────────────────────────────────────
	function shuffle<T>(arr: T[]): T[] {
		const a = [...arr]
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]]
		}
		return a
	}

	// ── Load file list ───────────────────────────────────────────────────
	async function loadFiles() {
		loading = true; err = null
		const prefix = `${Y}/${M}/${D}/`
		const res = await fetch(`/api/fiancailles/list?y=${Y}&m=${M}&d=${D}`)
		if (!res.ok) { err = 'Impossible de charger les photos'; loading = false; return }
		const data = await res.json()
		const rawNames = new Set((data.items as any[]).map((i: any) => i.name.split('/').pop() ?? ''))

		const all = (data.items as any[])
			.filter(i => {
				const n = i.name.split('/').pop() ?? ''
				// Exclure les _240p du carousel principal (on les gère en interne)
				if (/_240p\.mp4$/i.test(n)) return false
				return /\.(jpg|jpeg|png|webp|mp4|mov)$/i.test(n)
			})
			.map(i => {
				const name = i.name.split('/').pop() ?? i.name
				const isVid = /\.(mp4|mov)$/i.test(name)
				// Chemin GCS de la version 240p correspondante
				const pfx = `${Y}/${M}/${D}/`
				const base240 = isVid ? name.replace(/\.(mp4|mov)$/i, '_240p.mp4') : null
				const base480 = isVid ? name.replace(/\.(mp4|mov)$/i, '_480p.mp4') : null
				return {
					path: i.name, name,
					type: isVid ? 'video' : 'image' as 'image' | 'video',
					signedUrl: null,
					signedUrl240p: null,
					signedUrl480p: null,
					lowResPath:  (base240 && rawNames.has(base240)) ? `${pfx}${base240}` : null,
					midResPath:  (base480 && rawNames.has(base480)) ? `${pfx}${base480}` : null,
					fetching: false
				}
			})
		allPhotos = all.filter(i => i.type === 'image')
		allVideos = all.filter(i => i.type === 'video')
		// Shuffle par défaut au chargement
		const shuffledPhotos = shuffle(allPhotos)
		const shuffledVideos = shuffle(allVideos)
		items = [...shuffledPhotos, ...shuffledVideos]
		loading = false
		if (items.length) loadAround(0)
	}

	// ── Signed URLs (lazy, ±12 window) ──────────────────────────────────
	async function loadAround(photoIdx: number) {
		// Photos window
		const W = 12
		const photoItems = items.filter(i => i.type === 'image')
		const lo = Math.max(0, photoIdx - W)
		const hi = Math.min(photoItems.length - 1, photoIdx + W)
		for (let i = lo; i <= hi; i++) {
			const item = photoItems[i]
			if (!item || item.signedUrl || item.fetching) continue
			item.fetching = true
			fetch(`/api/fiancailles/sign-download?path=${encodeURIComponent(item.path)}`)
				.then(r => r.json())
				.then(d => { item.signedUrl = d.url; item.fetching = false })
				.catch(() => { item.fetching = false })
		}
		// All videos upfront — HD + 240p si dispo
		for (const vid of items.filter(i => i.type === 'video')) {
			if (!vid.signedUrl && !vid.fetching) {
				vid.fetching = true
				fetch(`/api/fiancailles/sign-download?path=${encodeURIComponent(vid.path)}`)
					.then(r => r.json())
					.then(d => { vid.signedUrl = d.url; vid.fetching = false })
					.catch(() => { vid.fetching = false })
			}
			if (vid.lowResPath && !vid.signedUrl240p) {
				fetch(`/api/fiancailles/sign-download?path=${encodeURIComponent(vid.lowResPath)}`)
					.then(r => r.json()).then(d => { vid.signedUrl240p = d.url }).catch(() => {})
			}
			if (vid.midResPath && !vid.signedUrl480p) {
				fetch(`/api/fiancailles/sign-download?path=${encodeURIComponent(vid.midResPath)}`)
					.then(r => r.json()).then(d => { vid.signedUrl480p = d.url }).catch(() => {})
			}
		}
	}

	// ── Navigation ───────────────────────────────────────────────────────
	function go(dir: 1 | -1) {
		const next = sel + dir
		if (next < 0 || next >= photos.length) return
		sel = next
		loadAround(next)
	}

	// ── Keyboard ─────────────────────────────────────────────────────────
	function onKey(e: KeyboardEvent) {
		if (e.key === 'ArrowRight') go(1)
		else if (e.key === 'ArrowLeft') go(-1)
		else if (e.key === ' ') { e.preventDefault(); toggleAutoplay() }
		else if (e.key === 'Escape') goto('/coffre')
	}

	// ── Touch swipe ──────────────────────────────────────────────────────
	let tx = 0
	function onTouchStart(e: TouchEvent) { tx = e.touches[0].clientX }
	function onTouchEnd(e: TouchEvent) {
		const dx = e.changedTouches[0].clientX - tx
		if (Math.abs(dx) > 50) go(dx > 0 ? -1 : 1)
	}

	// ── Viewport width (pour offset responsive) ──────────────────────────
	let vw = $state(typeof window !== 'undefined' ? window.innerWidth : 800)
	function onResize() { vw = window.innerWidth }

	// ── Wave canvas ──────────────────────────────────────────────────────
	let canvas: HTMLCanvasElement
	let raf: number

	function initWaves() {
		const ctx = canvas.getContext('2d')!
		let t = 0
		function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
		resize()
		window.addEventListener('resize', resize)
		const waves = [
			{ amp: 38, freq: 0.0055, speed: 0.012, y: 0.72, alpha: 0.18, width: 2.5 },
			{ amp: 28, freq: 0.008,  speed: 0.018, y: 0.78, alpha: 0.13, width: 1.8 },
			{ amp: 20, freq: 0.012,  speed: 0.025, y: 0.84, alpha: 0.09, width: 1.2 },
			{ amp: 14, freq: 0.018,  speed: 0.032, y: 0.89, alpha: 0.06, width: 0.9 },
		]
		function draw() {
			const W = canvas.width, H = canvas.height
			ctx.clearRect(0, 0, W, H); t++
			for (const w of waves) {
				ctx.beginPath()
				for (let x = 0; x <= W; x += 2) {
					const y = w.y * H + Math.sin(x * w.freq + t * w.speed) * w.amp
					x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
				}
				ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath()
				ctx.fillStyle = `rgba(160,180,255,${w.alpha})`; ctx.fill()
				ctx.strokeStyle = `rgba(200,220,255,${w.alpha * 1.8})`; ctx.lineWidth = w.width; ctx.stroke()
			}
			const seed = Math.floor(t / 80)
			for (let s = 0; s < 18; s++) {
				const sx = ((seed * 137 + s * 73) % 1000) / 1000 * W
				const sy = ((seed * 241 + s * 53) % 1000) / 1000 * H * 0.75
				const pulse = (Math.sin(t * 0.05 + s) + 1) / 2
				ctx.beginPath(); ctx.arc(sx, sy, 0.8 + pulse * 1.2, 0, Math.PI * 2)
				ctx.fillStyle = `rgba(255,255,255,${0.1 + pulse * 0.3})`; ctx.fill()
			}
			raf = requestAnimationFrame(draw)
		}
		draw()
		return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(raf) }
	}

	// ── Carousel geometry (responsive) ──────────────────────────────────
	function itemStyle(i: number): string {
		const d = i - sel
		const abs = Math.abs(d)
		if (abs > 3) return 'display:none'
		// offset proportionnel à la largeur d'écran — photo principale prend ~92vw sur mobile
		const photoW = Math.min(480, vw * 0.92)
		const offset = d * (photoW * 0.72)
		const scale  = abs === 0 ? 1 : abs === 1 ? 0.74 : abs === 2 ? 0.56 : 0.43
		const op     = abs === 0 ? 1 : abs === 1 ? 0.5 : abs === 2 ? 0.22 : 0.08
		const z      = 10 - abs
		const blur   = abs === 0 ? 0 : abs === 1 ? 1 : 2
		return `transform:translateX(${offset}px) scale(${scale});opacity:${op};z-index:${z};filter:blur(${blur}px) brightness(${abs===0?1:0.5})`
	}

	onMount(() => {
		loadFiles()
		const cleanup = initWaves()
		onDestroy(cleanup)
	})
</script>

<svelte:window onkeydown={onKey} onresize={onResize} />

<div
	class="ps3"
	ontouchstart={onTouchStart}
	ontouchend={onTouchEnd}
	role="presentation"
>
	<!-- Wave background -->
	<canvas bind:this={canvas} class="waves"></canvas>

	<!-- Top bar -->
	<div class="top-bar">
		<a href="/coffre?y={Y}&m={M}&d={D}" class="back">← Coffre</a>
		<span class="date-label">
			{new Date(`${Y}-${M}-${D}`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
		</span>
		<div class="top-right">
			{#if photos.length}
				{#if videos.some(v => v.lowResPath || v.midResPath)}
				<button class="play-btn" onclick={cycleQuality} title="Changer la qualité vidéo">
					<span style="font-size:0.6rem;letter-spacing:-0.02em;font-weight:700;line-height:1">
						{quality === 'hd' ? 'HD' : quality}
					</span>
				</button>
			{/if}
			<button class="play-btn" onclick={toggleShuffle} title={shuffled ? 'Ordre chronologique' : 'Ordre aléatoire'}>
					{#if shuffled}
						<!-- shuffle icon -->
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
							<polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
							<line x1="4" y1="4" x2="9" y2="9"/>
						</svg>
					{:else}
						<!-- list icon -->
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
							<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
							<line x1="8" y1="18" x2="21" y2="18"/>
							<line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
						</svg>
					{/if}
				</button>
				<button class="play-btn" onclick={toggleAutoplay} title="Lecture auto (Espace)">
					{#if autoplay}
						<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
					{:else}
						<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
					{/if}
				</button>
				<span class="counter">{sel + 1} / {photos.length}</span>
			{/if}
		</div>
	</div>

	{#if loading}
		<div class="center-msg"><div class="spinner"></div></div>
	{:else if err}
		<div class="center-msg err">{err}</div>
	{:else if items.length === 0}
		<div class="center-msg">Aucune photo ce jour.</div>
	{:else}

		<!-- ── LEVEL 1 : Photos carousel ── -->
		<div class="photos-section">
			<div class="carousel">
				{#each photos as photo, i}
					<button
						class="slide"
						style={itemStyle(i)}
						onclick={() => { sel = i; loadAround(i) }}
						tabindex={i === sel ? 0 : -1}
						aria-label={photo.name}
					>
						{#if photo.signedUrl}
							<img src={photo.signedUrl} alt={photo.name} class="media" loading="lazy" />
							<!-- Reflection -->
							<div class="reflection">
								<img src={photo.signedUrl} alt="" class="media" aria-hidden="true" />
							</div>
						{:else}
							<div class="placeholder">
								{#if photo.fetching}<div class="spinner-sm"></div>{:else}📷{/if}
							</div>
						{/if}
					</button>
				{/each}
			</div>

			<!-- Nav arrows -->
			<button class="arrow left" onclick={() => go(-1)} disabled={sel === 0} aria-label="Précédent">‹</button>
			<button class="arrow right" onclick={() => go(1)} disabled={sel === photos.length - 1} aria-label="Suivant">›</button>

			<!-- Progress -->
			{#if photos.length > 1}
				<div class="progress-track">
					<div class="progress-fill" style="width:{((sel + 1) / photos.length) * 100}%"></div>
				</div>
			{/if}
		</div>

		<!-- ── LEVEL 2 : Vidéo courante (séquentielle, avec son) ── -->
		{#if videos.length > 0}
			{@const vid = videos[vidSel]}
			<div class="videos-section">
				<div class="vid-tile">
					{#if vidUrl(vid)}
						{@const src = vidUrl(vid)!}
						{#key src}
							<!-- svelte-ignore a11y-media-has-caption -->
							<video
								{src}
								class="vid-media"
								autoplay
								playsinline
								muted={videoMuted}
								onended={onVideoEnded}
							></video>
						{/key}
						<div class="vid-reflection">
							<!-- svelte-ignore a11y-media-has-caption -->
							<video {src} class="vid-media" muted loop autoplay playsinline></video>
						</div>
						<button class="sound-btn" onclick={toggleSound} title={videoMuted ? 'Activer le son' : 'Couper le son'}>
							{#if videoMuted}🔇{:else}🔊{/if}
						</button>
					{:else}
						<div class="vid-placeholder">
							{#if vid?.fetching}<div class="spinner-sm"></div>{:else}🎬{/if}
						</div>
					{/if}
				</div>
				<span class="vid-counter">{vidSel + 1} / {videos.length}</span>
			</div>
		{/if}

	{/if}
</div>

<style>
	.ps3 {
		position: fixed; inset: 0;
		background: radial-gradient(ellipse at 30% 40%, #0d1b3e 0%, #070a14 60%, #020308 100%);
		display: flex; flex-direction: column; align-items: center;
		overflow: hidden; user-select: none;
	}

	.waves {
		position: absolute; inset: 0; pointer-events: none; z-index: 0;
	}

	/* ── Top bar ── */
	.top-bar {
		position: relative; z-index: 20;
		width: 100%; display: flex; justify-content: space-between; align-items: center;
		padding: 1rem 2rem; flex-shrink: 0;
	}
	.back {
		color: rgba(255,255,255,0.45); text-decoration: none; font-size: 0.82rem;
		letter-spacing: 0.05em; transition: color 0.2s;
	}
	.back:hover { color: rgba(255,255,255,0.9); }
	.date-label {
		color: rgba(255,255,255,0.65); font-size: 0.85rem; letter-spacing: 0.12em;
		text-transform: uppercase; font-weight: 300;
	}
	.top-right {
		display: flex; align-items: center; gap: 0.65rem; min-width: 6rem; justify-content: flex-end;
	}
	.counter { color: rgba(255,255,255,0.38); font-size: 0.78rem; }
	.play-btn {
		background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.18);
		color: rgba(255,255,255,0.8); border-radius: 50%;
		width: 1.9rem; height: 1.9rem; display: flex; align-items: center; justify-content: center;
		cursor: pointer; transition: all 0.2s; padding: 0;
	}
	.play-btn:hover { background: rgba(255,255,255,0.22); color: #fff; }
	.play-btn:active { transform: scale(0.9); }

	/* ── Level 1 : Photos ── */
	.photos-section {
		position: relative; z-index: 10;
		flex: 1; min-height: 0;
		display: flex; flex-direction: column; align-items: center; justify-content: center;
		width: 100%;
	}

	.carousel {
		position: relative; width: 100%; flex: 1; min-height: 0;
		display: flex; align-items: center; justify-content: center;
	}

	.slide {
		position: absolute; background: none; border: none; padding: 0; cursor: pointer;
		transition: transform 0.4s cubic-bezier(0.25,0.46,0.45,0.94),
		            opacity 0.4s ease, filter 0.4s ease;
		will-change: transform, opacity;
		display: flex; flex-direction: column; align-items: center;
	}

	.media {
		display: block;
		width: min(480px, 92vw);
		aspect-ratio: 4/3;
		object-fit: cover;
		object-position: center 20%; /* favorise le haut — évite de couper les têtes */
		border-radius: 4px;
		box-shadow: 0 8px 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06);
	}

	.reflection {
		width: min(480px, 92vw);
		height: calc(min(480px, 92vw) * 0.22);
		overflow: hidden; transform: scaleY(-1);
		mask-image: linear-gradient(to bottom, rgba(0,0,0,0.32) 0%, transparent 100%);
		-webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,0.32) 0%, transparent 100%);
		pointer-events: none;
	}
	.reflection .media { box-shadow: none; border-radius: 0; aspect-ratio: unset; height: 100%; }

	/* Arrows */
	.arrow {
		position: absolute; z-index: 20; top: 45%; transform: translateY(-50%);
		background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
		color: rgba(255,255,255,0.7); font-size: 2.2rem; line-height: 1;
		width: 2.8rem; height: 2.8rem; border-radius: 50%;
		display: flex; align-items: center; justify-content: center;
		cursor: pointer; transition: all 0.2s; padding: 0;
	}
	.arrow:hover:not(:disabled) { background: rgba(255,255,255,0.15); color: #fff; }
	.arrow:disabled { opacity: 0.12; cursor: default; }
	.left  { left: 1rem; }
	.right { right: 1rem; }

	/* Progress */
	.progress-track {
		width: 160px; height: 2px; margin: 0.5rem auto 0;
		background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden; flex-shrink: 0;
	}
	.progress-fill {
		height: 100%; background: rgba(255,255,255,0.65); border-radius: 2px;
		transition: width 0.4s cubic-bezier(0.25,0.46,0.45,0.94);
	}

	/* ── Level 2 : Vidéo courante ── */
	.videos-section {
		position: relative; z-index: 10; width: 100%; flex-shrink: 0;
		display: flex; flex-direction: column; align-items: center;
		padding: 0.25rem 0 0.5rem; gap: 0.2rem;
	}

	.vid-tile {
		display: flex; flex-direction: column; align-items: center;
	}

	.vid-media {
		display: block;
		width: min(420px, 88vw); height: auto; aspect-ratio: 16/9;
		object-fit: cover; border-radius: 4px;
		box-shadow: 0 6px 28px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.07);
	}

	.vid-reflection {
		width: min(420px, 88vw);
		height: calc(min(420px, 88vw) * 9 / 16 * 0.3);
		overflow: hidden; transform: scaleY(-1);
		mask-image: linear-gradient(to bottom, rgba(0,0,0,0.28) 0%, transparent 100%);
		-webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,0.28) 0%, transparent 100%);
		pointer-events: none;
	}
	.vid-reflection .vid-media { box-shadow: none; }

	.vid-counter {
		color: rgba(255,255,255,0.28); font-size: 0.7rem; letter-spacing: 0.08em;
		margin-top: 0.15rem;
	}
	.sound-btn {
		position: absolute; bottom: 6px; right: 6px;
		background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.15);
		border-radius: 50%; width: 2rem; height: 2rem;
		display: flex; align-items: center; justify-content: center;
		font-size: 0.9rem; cursor: pointer; transition: background 0.2s; z-index: 5;
	}
	.sound-btn:hover { background: rgba(0,0,0,0.7); }
	.vid-tile { position: relative; }

	.vid-placeholder {
		width: min(420px, 88vw); aspect-ratio: 16/9;
		display: flex; align-items: center; justify-content: center;
		background: rgba(255,255,255,0.04); border-radius: 4px; font-size: 2rem;
	}

	/* ── States ── */
	.center-msg {
		color: rgba(255,255,255,0.5); font-size: 1rem;
		display: flex; align-items: center; justify-content: center;
		flex: 1; z-index: 10;
	}
	.center-msg.err { color: #ff6b6b; }
	.placeholder {
		width: min(480px, 92vw); aspect-ratio: 4/3;
		display: flex; align-items: center; justify-content: center;
		background: rgba(255,255,255,0.04); border-radius: 4px; font-size: 2.5rem;
	}

	/* Spinners */
	.spinner, .spinner-sm {
		border: 2px solid rgba(255,255,255,0.1);
		border-top-color: rgba(255,255,255,0.6);
		border-radius: 50%; animation: spin 0.8s linear infinite;
	}
	.spinner { width: 32px; height: 32px; }
	.spinner-sm { width: 20px; height: 20px; }
	@keyframes spin { to { transform: rotate(360deg); } }

	/* Mobile */
	@media (max-width: 600px) {
		.arrow { display: none; }
		.top-bar { padding: 0.75rem 1rem; }
		.videos-strip { justify-content: flex-start; }
	}
</style>
