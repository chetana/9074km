<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { userStore as user } from '$lib/auth';
	import {
		CURRICULUM, LEVEL_META, levelMeta, currentUnitId, isUnlocked, progressPct,
		type Unit, type CefrLevel,
	} from '$lib/curriculum';
	import { getAvatar, getLevel, getLevelTitle } from '$lib/flashcard-levels';
	import LessonPlayer from '$lib/LessonPlayer.svelte';

	function isChet(name: string): boolean {
		const n = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
		return n === 'chet' || n === 'chetana';
	}
	const firstName = $derived($user?.name.split(' ')[0] ?? '');
	const userLang = $derived<'fr' | 'kh'>(isChet(firstName) ? 'fr' : 'kh');

	// ── State ──────────────────────────────────────────────────────────────
	let completed = $state<string[]>([]);
	let stars = $state<Record<string, number>>({});
	let xp = $state(0);
	let loading = $state(true);
	let selected = $state<Unit | null>(null);

	const curId      = $derived(currentUnitId(completed));
	const pct        = $derived(progressPct(completed));
	const avatar     = $derived(getAvatar(xp, userLang));
	const levelTitle = $derived(getLevelTitle(xp, userLang));
	const flLevel    = $derived(getLevel(xp));

	// Grouper les unités par palier pour l'affichage
	const sections = $derived(
		LEVEL_META.map(meta => ({
			meta,
			units: CURRICULUM.filter(u => u.level === meta.level),
		}))
	);

	function t(fr: string, kh: string) { return userLang === 'kh' ? kh : fr; }

	function unitState(u: Unit): 'done' | 'current' | 'locked' {
		if (completed.includes(u.id)) return 'done';
		if (u.id === curId) return 'current';
		return 'locked';
	}

	onMount(async () => {
		try {
			const res = await fetch('/api/apprendre/progress', { credentials: 'include' });
			const data = await res.json();
			completed = data.completed ?? [];
			stars = data.stars ?? {};
			xp = data.xp ?? 0;
		} catch { /* offline → carte vierge */ }
		loading = false;
	});

	function openUnit(u: Unit) {
		if (unitState(u) === 'locked') return;
		selected = u;
	}
	function closeSheet() { selected = null; }

	// Lance la leçon interactive (exercices générés par Gemini).
	let playing = $state<Unit | null>(null);
	function startUnit(u: Unit) {
		selected = null;
		playing = u;
	}

	// À la fin d'une leçon : recharge la progression depuis le serveur (déjà persistée par le player).
	async function onLessonComplete() {
		try {
			const res = await fetch('/api/apprendre/progress', { credentials: 'include' });
			const data = await res.json();
			completed = data.completed ?? completed;
			stars = data.stars ?? stars;
			xp = data.xp ?? xp;
		} catch { /* ignore */ }
	}
	function closePlayer() { playing = null; }
</script>

<div class="ap-root">
	<!-- ── En-tête : avatar + progression globale ── -->
	<header class="ap-header">
		<div class="ap-hero">
			<span class="ap-avatar">{avatar}</span>
			<div class="ap-hero-txt">
				<h1 class="ap-title">{t('Apprendre le français', 'រៀនភាសាបារាំង')}</h1>
				<span class="ap-badge">{levelTitle} · {xp} XP</span>
			</div>
		</div>
		<div class="ap-progress">
			<div class="ap-progress-head">
				<span class="ap-progress-label">{t('Progression', 'វឌ្ឍនភាព')}</span>
				<span class="ap-progress-txt">{completed.length} / {CURRICULUM.length} · {pct}%</span>
			</div>
			<div class="ap-progress-bar"><div class="ap-progress-fill" style="width:{pct}%"></div></div>
		</div>
	</header>

	{#if loading}
		<div class="ap-center"><span class="ap-spinner"></span></div>
	{:else}
		<!-- ── Le parcours ── -->
		<div class="ap-path">
			{#each sections as section (section.meta.level)}
				<!-- Bannière de palier -->
				<div class="ap-band" style="--lvl-color:{section.meta.color}">
					<span class="ap-band-level">{section.meta.level}</span>
					<div class="ap-band-txt">
						<span class="ap-band-label">{t(section.meta.label_fr, section.meta.label_kh)}</span>
						<span class="ap-band-sub">{section.meta.subtitle_fr}</span>
					</div>
				</div>

				<!-- Nœuds de l'unité, en zigzag -->
				<div class="ap-nodes">
					{#each section.units as u, i (u.id)}
						{@const st = unitState(u)}
						<div class="ap-node-row" class:right={i % 2 === 1}>
							<button
								class="ap-node {st}"
								style="--lvl-color:{section.meta.color}"
								onclick={() => openUnit(u)}
								disabled={st === 'locked'}
								aria-label={t(u.title_fr, u.title_kh)}
							>
								{#if st === 'locked'}
									<span class="ap-node-icon">🔒</span>
								{:else}
									<span class="ap-node-icon">{u.icon}</span>
								{/if}
								{#if st === 'current'}<span class="ap-node-pulse"></span>{/if}
								{#if st === 'done'}
									<span class="ap-node-stars">
										{#each Array(3) as _, s}<span class:lit={(stars[u.id] ?? 0) > s}>★</span>{/each}
									</span>
								{/if}
							</button>
							<div class="ap-node-label">
								<span class="ap-node-title">{t(u.title_fr, u.title_kh)}</span>
								<span class="ap-node-order">{t('Leçon', 'មេរៀន')} {u.order}</span>
							</div>
							{#if st === 'current'}
								<span class="ap-here">{avatar}</span>
							{/if}
						</div>
					{/each}
				</div>
			{/each}

			<!-- Drapeau d'arrivée -->
			<div class="ap-finish">
				<span class="ap-finish-flag">🏁</span>
				<span class="ap-finish-txt">{t('Niveau B1 atteint !', 'កម្រិត B1 សម្រេច!')}</span>
			</div>
		</div>
	{/if}
</div>

<!-- ── Panneau détail d'unité ── -->
{#if selected}
	<div class="ap-overlay" onclick={closeSheet} role="button" tabindex="-1" transition:fade={{ duration: 180 }}>
		<div class="ap-sheet" onclick={(e) => e.stopPropagation()} role="dialog" transition:fly={{ y: 300, duration: 280 }}>
			<div class="ap-sheet-grip"></div>
			<div class="ap-sheet-head">
				<span class="ap-sheet-icon" style="--lvl-color:{levelMeta(selected.level).color}">{selected.icon}</span>
				<div>
					<span class="ap-sheet-level">{selected.level} · {t('Leçon', 'មេរៀន')} {selected.order}</span>
					<h2 class="ap-sheet-title">{t(selected.title_fr, selected.title_kh)}</h2>
				</div>
			</div>

			<div class="ap-cando">
				<span class="ap-cando-icon">🎯</span>
				<p>{t(selected.canDo_fr, selected.canDo_kh)}</p>
			</div>

			<div class="ap-meta-grid">
				<div class="ap-meta">
					<span class="ap-meta-k">{t('Grammaire', 'វេយ្យាករណ៍')}</span>
					<span class="ap-meta-v">{selected.grammar}</span>
				</div>
				<div class="ap-meta">
					<span class="ap-meta-k">{t('Thème', 'ប្រធានបទ')}</span>
					<span class="ap-meta-v">{selected.theme}</span>
				</div>
			</div>

			<div class="ap-vocab">
				<span class="ap-meta-k">{t('Vocabulaire', 'វាក្យសព្ទ')}</span>
				<div class="ap-vocab-chips">
					{#each selected.seedVocab as w}<span class="ap-chip">{w}</span>{/each}
				</div>
			</div>

			<button class="ap-start" onclick={() => selected && startUnit(selected)}>
				{#if completed.includes(selected.id)}
					{t('Réviser', 'ពិនិត្យឡើងវិញ')} ↻
				{:else}
					{t('Commencer la leçon', 'ចាប់ផ្តើមមេរៀន')} →
				{/if}
			</button>
		</div>
	</div>
{/if}

<!-- ── Lecteur d'exercices ── -->
{#if playing}
	<LessonPlayer
		unitId={playing.id}
		unitTitle={t(playing.title_fr, playing.title_kh)}
		level={playing.level}
		levelColor={levelMeta(playing.level).color}
		l1={userLang}
		onComplete={onLessonComplete}
		onClose={closePlayer}
	/>
{/if}

<style>
	.ap-root {
		flex: 1; min-height: 0; overflow-y: auto;
		display: flex; flex-direction: column;
		padding: 0 0 2rem;
		/* Section "mode étude" : surface sombre + texte clair FORCÉ, indépendamment
		   du mode clair/sombre du téléphone (sinon --text sombre devient illisible). */
		background: #0B1A28;
		--text: #EAF4F8;
		--muted: #8FB2C4;
		color: #EAF4F8;
		-webkit-overflow-scrolling: touch;
	}

	/* ── Header ── */
	.ap-header {
		position: sticky; top: 0; z-index: 5;
		padding: max(env(safe-area-inset-top), 0.75rem) 1.1rem 0.75rem;
		background: #0B1A28;   /* fond plein opaque (header sticky) */
		border-bottom: 1px solid color-mix(in srgb, var(--accent) 18%, transparent);
		display: flex; flex-direction: column; gap: 0.55rem;
	}
	.ap-hero { display: flex; align-items: center; gap: 0.7rem; }
	.ap-avatar {
		font-size: 2.1rem; line-height: 1;
		filter: drop-shadow(0 2px 6px color-mix(in srgb, var(--accent) 40%, transparent));
	}
	.ap-hero-txt { display: flex; flex-direction: column; gap: 0.25rem; align-items: flex-start; }
	.ap-title { font-size: 1.05rem; font-weight: 800; color: var(--text); line-height: 1.1; }
	.ap-badge {
		font-size: 0.72rem; font-weight: 700; color: #fff;
		background: linear-gradient(90deg, #58C4DC, #4DBFD8);
		padding: 0.15rem 0.6rem; border-radius: 99px;
		box-shadow: 0 2px 8px rgba(77, 191, 216, 0.35);
	}
	.ap-progress {
		display: flex; flex-direction: column; gap: 0.4rem;
		padding: 0.6rem 0.75rem; border-radius: 0.9rem;
		background: color-mix(in srgb, #1a3a52 70%, transparent);
		border: 1px solid color-mix(in srgb, var(--accent) 28%, transparent);
	}
	.ap-progress-head { display: flex; align-items: center; justify-content: space-between; }
	.ap-progress-label { font-size: 0.66rem; font-weight: 700; color: var(--text); text-transform: uppercase; letter-spacing: 0.05em; }
	.ap-progress-bar {
		height: 9px; border-radius: 99px; overflow: hidden;
		background: rgba(0, 0, 0, 0.28);
	}
	.ap-progress-fill {
		height: 100%; border-radius: 99px;
		background: linear-gradient(90deg, #58C4DC, #7BC86C, #F2A0B8);
		transition: width 0.6s cubic-bezier(0.34, 1.2, 0.64, 1);
	}
	.ap-progress-txt { font-size: 0.68rem; color: var(--text); font-weight: 700; white-space: nowrap; }

	/* ── Path ── */
	.ap-path { display: flex; flex-direction: column; padding: 0.5rem 0 0; }

	.ap-band {
		display: flex; align-items: center; gap: 0.7rem;
		margin: 1.4rem 1.1rem 0.6rem; padding: 0.6rem 0.85rem;
		border-radius: 1rem;
		background: color-mix(in srgb, var(--lvl-color) 14%, var(--card));
		border: 1px solid color-mix(in srgb, var(--lvl-color) 30%, transparent);
	}
	.ap-band-level {
		font-size: 1rem; font-weight: 900; color: #fff;
		background: var(--lvl-color); border-radius: 0.6rem;
		padding: 0.25rem 0.55rem; letter-spacing: 0.03em;
	}
	.ap-band-txt { display: flex; flex-direction: column; }
	.ap-band-label { font-size: 0.92rem; font-weight: 800; color: var(--text); }
	.ap-band-sub { font-size: 0.66rem; color: var(--muted); }

	.ap-nodes { display: flex; flex-direction: column; gap: 0.35rem; padding: 0.3rem 0; }

	.ap-node-row {
		display: flex; align-items: center; gap: 0.85rem;
		padding: 0.35rem 1.4rem; position: relative;
	}
	.ap-node-row.right { flex-direction: row-reverse; }
	.ap-node-row.right .ap-node-label { text-align: right; }

	.ap-node {
		position: relative; flex-shrink: 0;
		width: 3.4rem; height: 3.4rem; border-radius: 50%;
		display: flex; align-items: center; justify-content: center;
		font-size: 1.5rem;
		transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
	}
	.ap-node:active:not(:disabled) { transform: scale(0.9); }

	.ap-node.done {
		background: color-mix(in srgb, var(--lvl-color) 88%, #fff);
		box-shadow: 0 4px 14px color-mix(in srgb, var(--lvl-color) 45%, transparent);
		border: 2px solid #fff;
	}
	.ap-node.current {
		background: linear-gradient(145deg, var(--lvl-color), color-mix(in srgb, var(--lvl-color) 70%, #fff));
		box-shadow: 0 0 0 4px color-mix(in srgb, var(--lvl-color) 25%, transparent), 0 6px 18px color-mix(in srgb, var(--lvl-color) 50%, transparent);
		border: 2px solid #fff;
	}
	.ap-node.locked {
		background: color-mix(in srgb, var(--muted) 18%, var(--card));
		border: 2px solid color-mix(in srgb, var(--muted) 20%, transparent);
		opacity: 0.6; filter: grayscale(0.6);
	}
	.ap-node-icon { line-height: 1; }

	.ap-node-pulse {
		position: absolute; inset: -2px; border-radius: 50%;
		border: 2px solid var(--lvl-color);
		animation: node-pulse 1.8s ease-out infinite;
	}
	@keyframes node-pulse {
		0%   { transform: scale(1);   opacity: 0.8; }
		100% { transform: scale(1.5); opacity: 0; }
	}

	.ap-node-stars {
		position: absolute; bottom: -7px; left: 50%; transform: translateX(-50%);
		display: flex; gap: 1px; font-size: 0.5rem;
	}
	.ap-node-stars span { color: color-mix(in srgb, var(--muted) 50%, transparent); }
	.ap-node-stars span.lit { color: #fbbf24; filter: drop-shadow(0 0 2px rgba(251,191,36,0.6)); }

	.ap-node-label { display: flex; flex-direction: column; gap: 0.05rem; min-width: 0; }
	.ap-node-title { font-size: 0.82rem; font-weight: 700; color: var(--text); line-height: 1.15; }
	.ap-node-order { font-size: 0.6rem; color: var(--muted); }

	.ap-here {
		font-size: 1.5rem; margin-left: auto;
		animation: here-bob 1.6s ease-in-out infinite;
		filter: drop-shadow(0 3px 5px rgba(0,0,0,0.25));
	}
	.ap-node-row.right .ap-here { margin-left: 0; margin-right: auto; }
	@keyframes here-bob {
		0%, 100% { transform: translateY(0); }
		50%      { transform: translateY(-5px); }
	}

	.ap-finish {
		display: flex; flex-direction: column; align-items: center; gap: 0.3rem;
		margin: 1.6rem auto 0; opacity: 0.7;
	}
	.ap-finish-flag { font-size: 1.8rem; }
	.ap-finish-txt { font-size: 0.72rem; font-weight: 700; color: var(--muted); }

	/* ── Loading ── */
	.ap-center { display: flex; justify-content: center; padding: 4rem 0; }
	.ap-spinner {
		width: 1.6rem; height: 1.6rem;
		border: 2px solid color-mix(in srgb, var(--accent) 22%, transparent);
		border-top-color: var(--accent); border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }

	/* ── Sheet ── */
	.ap-overlay {
		position: fixed; inset: 0; z-index: 60;
		background: rgba(0,0,0,0.55); backdrop-filter: blur(6px);
		display: flex; align-items: flex-end; justify-content: center;
	}
	.ap-sheet {
		width: 100%; max-width: 30rem;
		background: var(--card);
		border-radius: 1.6rem 1.6rem 0 0;
		border-top: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
		padding: 0.6rem 1.25rem calc(1.5rem + env(safe-area-inset-bottom, 0px));
		display: flex; flex-direction: column; gap: 0.85rem;
		box-shadow: 0 -20px 60px rgba(0,0,0,0.5);
		max-height: 88dvh; overflow-y: auto;
	}
	.ap-sheet-grip {
		width: 2.6rem; height: 4px; border-radius: 99px;
		background: color-mix(in srgb, var(--muted) 40%, transparent);
		margin: 0.1rem auto 0.4rem;
	}
	.ap-sheet-head { display: flex; align-items: center; gap: 0.8rem; }
	.ap-sheet-icon {
		font-size: 1.8rem; flex-shrink: 0;
		width: 3.2rem; height: 3.2rem; border-radius: 1rem;
		display: flex; align-items: center; justify-content: center;
		background: color-mix(in srgb, var(--lvl-color) 18%, var(--card));
		border: 1px solid color-mix(in srgb, var(--lvl-color) 35%, transparent);
	}
	.ap-sheet-level { font-size: 0.66rem; font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.05em; }
	.ap-sheet-title { font-size: 1.2rem; font-weight: 800; color: var(--text); line-height: 1.15; }

	.ap-cando {
		display: flex; align-items: center; gap: 0.6rem;
		padding: 0.7rem 0.85rem; border-radius: 0.9rem;
		background: color-mix(in srgb, var(--accent) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
	}
	.ap-cando-icon { font-size: 1.1rem; }
	.ap-cando p { font-size: 0.85rem; font-weight: 600; color: var(--text); line-height: 1.3; }

	.ap-meta-grid { display: flex; flex-direction: column; gap: 0.6rem; }
	.ap-meta { display: flex; flex-direction: column; gap: 0.15rem; }
	.ap-meta-k { font-size: 0.62rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
	.ap-meta-v { font-size: 0.85rem; color: var(--text); line-height: 1.3; }

	.ap-vocab { display: flex; flex-direction: column; gap: 0.4rem; }
	.ap-vocab-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
	.ap-chip {
		font-size: 0.74rem; padding: 0.25rem 0.6rem; border-radius: 99px;
		background: color-mix(in srgb, var(--accent) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent);
		color: var(--text);
	}

	.ap-start {
		margin-top: 0.4rem; padding: 0.85rem; border-radius: 1rem;
		background: var(--accent); color: #fff;
		font-size: 0.95rem; font-weight: 800;
		transition: transform 0.12s, opacity 0.15s;
	}
	.ap-start:active { transform: scale(0.97); }
	.ap-start:disabled { opacity: 0.55; }
	.ap-soon { font-size: 0.62rem; color: var(--muted); text-align: center; }
</style>
