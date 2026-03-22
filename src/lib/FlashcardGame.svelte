<script lang="ts">
	import { onMount } from 'svelte';
	import { tokenStore } from '$lib/auth';
	import { LEVELS, getLevel, getAvatar as _getAvatar, getLevelTitle as _getLevelTitle, xpForNextLevel, xpProgressPct } from '$lib/flashcard-levels';

	interface Card { id: string; fr: string; kh: string; en?: string; phonetic_kh?: string; phonetic_fr?: string }
	interface Progress { name: string; xp: number; sessions: { date: string; correct: number; approx: number; wrong: number; xp_gained: number }[] }

	let { onClose, userLang = 'fr', userName = '' }: { onClose: () => void; userLang: 'fr' | 'kh'; userName: string } = $props();

	function getAvatar(xp: number) { return _getAvatar(xp, userLang) }
	function getLevelTitle(xp: number) { return _getLevelTitle(xp, userLang) }

	// ── State ──────────────────────────────────────────────────────────────
	let cards = $state<Card[]>([]);
	let idx = $state(0);
	let flipped = $state(false);
	let animating = $state(false);
	let exitClass = $state('');
	let phase = $state<'loading' | 'play' | 'done'>('loading');
	let score = $state({ correct: 0, approx: 0, wrong: 0 });
	let combo = $state(0);
	let maxCombo = $state(0);
	let progress = $state<Progress>({ name: userName, xp: 0, sessions: [] });
	let xpGained = $state(0);
	let leveledUp = $state(false);
	let oldLevel = $state(1);
	let showConfetti = $state(false);
	let saving = $state(false);

	const card      = $derived(cards[idx] ?? null);
	const total     = $derived(cards.length);
	const playPct   = $derived(total > 0 ? (idx / total) * 100 : 0);
	const curXp     = $derived(progress.xp);
	const curLevel  = $derived(getLevel(curXp));
	const avatar    = $derived(getAvatar(curXp));
	const lvlTitle  = $derived(getLevelTitle(curXp));
	const lvlPct    = $derived(xpProgressPct(curXp));
	const nextLvlXp = $derived(xpForNextLevel(curXp));

	// Chet apprend KH (voit KH, répond FR) — Lys apprend FR (voit FR, répond KH)
	const frontText     = $derived(card ? (userLang === 'fr' ? card.kh        : card.fr)          : '');
	const backText      = $derived(card ? (userLang === 'fr' ? card.fr        : card.kh)          : '');
	const frontPhonetic = $derived(card ? (userLang === 'fr' ? card.phonetic_kh : card.phonetic_fr) : '');
	const backPhonetic  = $derived(card ? (userLang === 'fr' ? card.phonetic_fr : card.phonetic_kh) : '');
	const frontFlag     = $derived(userLang === 'fr' ? '🇰🇭' : '🇫🇷');
	const backFlag      = $derived(userLang === 'fr' ? '🇫🇷' : '🇰🇭');

	// ── Mount ──────────────────────────────────────────────────────────────
	onMount(async () => {
		const token = $tokenStore;
		const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
		try {
			const [cardsRes, progRes] = await Promise.all([
				fetch('/api/flashcards', { headers }),
				fetch('/api/flashcards/progress', { headers }),
			]);
			cards    = shuffle(await cardsRes.json() as Card[]);
			progress = await progRes.json() as Progress;
		} catch {
			cards = shuffle(SEED_CARDS);
		}
		oldLevel = getLevel(progress.xp).level;
		phase = 'play';
	});

	function shuffle<T>(arr: T[]): T[] { return [...arr].sort(() => Math.random() - 0.5) }

	// ── Flip ───────────────────────────────────────────────────────────────
	function flip() {
		if (animating || flipped) return;
		flipped = true;
	}

	// ── Rate ───────────────────────────────────────────────────────────────
	async function rate(result: 'correct' | 'approx' | 'wrong') {
		if (animating) return;
		animating = true;

		const xp = result === 'correct' ? 10 : result === 'approx' ? 5 : 1;
		const comboBonus = result === 'correct' && combo >= 2 ? 5 : 0;
		xpGained += xp + comboBonus;

		if (result === 'correct') { score.correct++; combo++; maxCombo = Math.max(maxCombo, combo); }
		else if (result === 'approx') { score.approx++; combo = 0; }
		else { score.wrong++; combo = 0; }

		exitClass = result === 'correct' ? 'exit-correct' : result === 'approx' ? 'exit-approx' : 'exit-wrong';
		await wait(500);
		exitClass = '';
		flipped = false;

		if (idx + 1 >= total) {
			await endSession();
		} else {
			idx++;
			animating = false;
		}
	}

	async function endSession() {
		phase = 'done';
		saving = true;
		try {
			const token = $tokenStore;
			const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
			const res = await fetch('/api/flashcards/progress', {
				method: 'POST', headers,
				body: JSON.stringify({ correct: score.correct, approx: score.approx, wrong: score.wrong, xp_gained: xpGained }),
			});
			const updated = await res.json() as Progress;
			const newLvl = getLevel(updated.xp).level;
			if (newLvl > oldLevel) leveledUp = true;
			progress = updated;
		} catch {}
		saving = false;
		animating = false;

		if (score.correct >= total * 0.6 || leveledUp) {
			showConfetti = true;
			setTimeout(() => (showConfetti = false), 3500);
		}
	}

	function restart() {
		cards = shuffle(cards);
		idx = 0; flipped = false; animating = false;
		score = { correct: 0, approx: 0, wrong: 0 };
		combo = 0; maxCombo = 0; xpGained = 0;
		leveledUp = false; showConfetti = false;
		oldLevel = getLevel(progress.xp).level;
		phase = 'play';
	}

	function wait(ms: number) { return new Promise(r => setTimeout(r, ms)) }

	// ── Seed (fallback offline) ────────────────────────────────────────────
	const SEED_CARDS: Card[] = [
		{ id: '1', fr: "Je t'aime",      kh: 'ខ្ញុំស្រឡាញ់អ្នក', phonetic_kh: 'khnhom srolanh neak',  phonetic_fr: 'jeu tem'        },
		{ id: '2', fr: 'Tu me manques',   kh: 'ខ្ញុំនឹកអ្នក',      phonetic_kh: 'khnhom neuk neak',     phonetic_fr: 'tu meu mank'    },
		{ id: '3', fr: 'Bonne nuit',      kh: 'រាត្រីសួស្តី',      phonetic_kh: 'reatrei suostei',      phonetic_fr: 'bon nwi'        },
		{ id: '4', fr: 'Bonjour',         kh: 'អរុណសួស្តី',        phonetic_kh: 'arun suostei',         phonetic_fr: 'bon-jour'       },
		{ id: '5', fr: 'Comment tu vas ?',kh: 'អ្នកសុខសប្បាយទេ?',  phonetic_kh: 'neak sok sabay te?',   phonetic_fr: 'ko-man tu va'   },
	];
</script>

<!-- ── Overlay ─────────────────────────────────────────────────────────── -->
<div class="fg-overlay" onclick={onClose} role="button" tabindex="-1" aria-label="Fermer">
<div class="fg-panel" onclick={(e) => e.stopPropagation()} role="dialog">

	<!-- Header -->
	<div class="fg-header">
		<div class="fg-avatar-row">
			<span class="fg-avatar" class:level-up-anim={leveledUp}>{avatar}</span>
			<div class="fg-level-info">
				<span class="fg-level-title">{lvlTitle} · Nv{curLevel.level}</span>
				<div class="fg-xp-bar">
					<div class="fg-xp-fill" style="width:{lvlPct}%"></div>
				</div>
				<span class="fg-xp-txt">{curXp} XP{nextLvlXp ? ` · ${nextLvlXp - curXp} jusqu'au Nv${curLevel.level + 1}` : ' · MAX'}</span>
			</div>
		</div>
		<button class="fg-close" onclick={onClose}>✕</button>
	</div>

	<!-- Play progress bar -->
	{#if phase === 'play'}
		<div class="fg-progress-bar">
			<div class="fg-progress-fill" style="width:{playPct}%"></div>
		</div>
		<div class="fg-counter-row">
			<span class="fg-counter">{idx + 1} / {total}</span>
			{#if combo >= 2}<span class="fg-combo">🔥 x{combo}</span>{/if}
		</div>
	{/if}

	<!-- Loading -->
	{#if phase === 'loading'}
		<div class="fg-center"><span class="fg-spinner"></span></div>

	<!-- Play -->
	{:else if phase === 'play' && card}
		<div class="fg-scene">
			<div class="fg-card {exitClass}" class:flipped onclick={flip}>
				<!-- Front -->
				<div class="fg-front">
					<span class="fg-flag">{frontFlag}</span>
					<p class="fg-word">{frontText}</p>
					{#if frontPhonetic}
						<p class="fg-phonetic">{frontPhonetic}</p>
					{/if}
					{#if !flipped}
						<p class="fg-hint">{userLang === 'fr' ? 'Tap pour révéler' : 'ចុចដើម្បីបង្ហាញ'}</p>
					{/if}
				</div>
				<!-- Back -->
				<div class="fg-back">
					<span class="fg-flag">{backFlag}</span>
					<p class="fg-word">{backText}</p>
					{#if backPhonetic}
						<p class="fg-phonetic">{backPhonetic}</p>
					{/if}
					{#if card.en}
						<p class="fg-sub">{card.en}</p>
					{/if}
				</div>
			</div>
		</div>

		{#if flipped}
			<div class="fg-buttons">
				<button class="fg-btn fg-wrong"   onclick={() => rate('wrong')}  >❌</button>
				<button class="fg-btn fg-approx"  onclick={() => rate('approx')} >😅</button>
				<button class="fg-btn fg-correct" onclick={() => rate('correct')}>✅</button>
			</div>
			<div class="fg-btn-labels">
				<span>{userLang === 'fr' ? 'Raté' : 'ខុស'}</span>
				<span>{userLang === 'fr' ? 'Approx' : 'ប្រហែល'}</span>
				<span>{userLang === 'fr' ? 'Parfait' : 'ល្អ'}</span>
			</div>
		{/if}

	<!-- Done -->
	{:else if phase === 'done'}
		<div class="fg-done">
			{#if showConfetti}
				<div class="fg-confetti" aria-hidden="true">
					{#each Array(14) as _, i}
						<span class="fg-cp" style="--i:{i}">{['🎉','✨','🎊','💫','⭐','🏆'][i % 6]}</span>
					{/each}
				</div>
			{/if}

			<!-- Avatar + niveau -->
			<div class="fg-done-avatar" class:level-up-anim={leveledUp}>{avatar}</div>
			{#if leveledUp}
				<p class="fg-levelup-badge">⬆️ Niveau supérieur !</p>
			{/if}
			<p class="fg-done-title">{lvlTitle} · Nv{curLevel.level}</p>

			<!-- XP gagnée cette session -->
			<div class="fg-xp-gained">
				+{xpGained} XP
				{#if maxCombo >= 3}<span class="fg-combo-badge">🔥 Combo x{maxCombo}</span>{/if}
			</div>

			<!-- Barre XP totale -->
			<div class="fg-xp-bar-done">
				<div class="fg-xp-fill" style="width:{lvlPct}%"></div>
			</div>
			<span class="fg-xp-txt">{curXp} XP{nextLvlXp ? ` · encore ${nextLvlXp - curXp} pour Nv${curLevel.level + 1}` : ''}</span>

			<!-- Score -->
			<div class="fg-score-row">
				<div class="fg-score-item correct"><span>✅</span>{score.correct}</div>
				<div class="fg-score-item approx"><span>😅</span>{score.approx}</div>
				<div class="fg-score-item wrong"><span>❌</span>{score.wrong}</div>
			</div>

			<button class="fg-restart" onclick={restart} disabled={saving}>
				{saving ? '💾 …' : (userLang === 'fr' ? '🔄 Recommencer' : '🔄 ចាប់ផ្តើមម្តងទៀត')}
			</button>
		</div>
	{/if}

</div>
</div>

<style>
	.fg-overlay {
		position: fixed; inset: 0; z-index: 100;
		background: rgba(0,0,0,0.7);
		backdrop-filter: blur(10px);
		display: flex; align-items: center; justify-content: center;
		padding: 1rem;
	}

	.fg-panel {
		width: 100%; max-width: 420px;
		background: color-mix(in srgb, var(--card) 94%, transparent);
		border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
		border-radius: 2rem;
		padding: 1.25rem 1.25rem 1.5rem;
		display: flex; flex-direction: column; gap: 0.6rem;
		box-shadow: 0 28px 72px rgba(0,0,0,0.55);
		animation: panel-in 0.38s cubic-bezier(0.34, 1.3, 0.64, 1);
		max-height: 92dvh; overflow-y: auto;
	}

	@keyframes panel-in {
		from { transform: scale(0.88) translateY(28px); opacity: 0; }
		to   { transform: scale(1)    translateY(0);    opacity: 1; }
	}

	/* ── Header ── */
	.fg-header {
		display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem;
	}

	.fg-avatar-row { display: flex; align-items: center; gap: 0.6rem; }

	.fg-avatar {
		font-size: 2.4rem; line-height: 1;
		transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes level-up {
		0%   { transform: scale(1); }
		30%  { transform: scale(1.5) rotate(-10deg); }
		60%  { transform: scale(1.3) rotate(8deg); }
		100% { transform: scale(1)   rotate(0deg); }
	}

	.level-up-anim { animation: level-up 0.8s cubic-bezier(0.34, 1.56, 0.64, 1); }

	.fg-level-info { display: flex; flex-direction: column; gap: 0.2rem; }

	.fg-level-title { font-size: 0.78rem; font-weight: 700; color: var(--accent); }

	.fg-xp-bar, .fg-xp-bar-done {
		height: 5px; background: color-mix(in srgb, var(--accent) 15%, transparent);
		border-radius: 99px; overflow: hidden; width: 120px;
	}
	.fg-xp-bar-done { width: 100%; height: 6px; }

	.fg-xp-fill {
		height: 100%; background: var(--accent); border-radius: 99px;
		transition: width 0.6s ease;
	}

	.fg-xp-txt { font-size: 0.6rem; color: var(--muted); }

	.fg-close {
		width: 1.8rem; height: 1.8rem; border-radius: var(--radius-full);
		background: color-mix(in srgb, var(--accent) 10%, transparent);
		color: var(--muted); font-size: 0.75rem;
		display: flex; align-items: center; justify-content: center;
		transition: background 0.15s; flex-shrink: 0;
	}
	.fg-close:hover { background: color-mix(in srgb, var(--accent) 22%, transparent); color: var(--text); }

	/* ── Progress ── */
	.fg-progress-bar {
		height: 3px; background: color-mix(in srgb, var(--accent) 12%, transparent);
		border-radius: 99px; overflow: hidden;
	}
	.fg-progress-fill { height: 100%; background: var(--accent); border-radius: 99px; transition: width 0.4s ease; }

	.fg-counter-row { display: flex; align-items: center; justify-content: space-between; }
	.fg-counter { font-size: 0.7rem; color: var(--muted); }
	.fg-combo {
		font-size: 0.72rem; font-weight: 700; color: #f97316;
		animation: combo-pulse 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
	}
	@keyframes combo-pulse {
		from { transform: scale(0.7); opacity: 0; }
		to   { transform: scale(1);   opacity: 1; }
	}

	/* ── 3D Scene ── */
	.fg-scene { perspective: 900px; height: 200px; display: flex; align-items: center; justify-content: center; }

	.fg-card {
		width: 100%; max-width: 340px; height: 185px;
		position: relative; transform-style: preserve-3d;
		transition: transform 0.55s cubic-bezier(0.34, 1.2, 0.64, 1);
		cursor: pointer;
		animation: card-enter 0.45s cubic-bezier(0.34, 1.2, 0.64, 1);
	}

	@keyframes card-enter {
		from { transform: translateZ(-130px) scale(0.82); opacity: 0; }
		to   { transform: translateZ(0)       scale(1);   opacity: 1; }
	}

	.fg-card.flipped { transform: rotateY(180deg); cursor: default; }
	.fg-card.exit-correct { animation: exit-correct 0.45s ease-in forwards; }
	.fg-card.exit-approx  { animation: exit-approx  0.45s ease-in forwards; }
	.fg-card.exit-wrong   { animation: exit-wrong   0.45s ease-in forwards; }

	@keyframes exit-correct {
		0%   { transform: rotateY(180deg) scale(1);    opacity: 1; }
		100% { transform: rotateY(180deg) translateY(-70px) scale(0.75); opacity: 0; }
	}
	@keyframes exit-approx {
		0%   { transform: rotateY(180deg) scale(1);    opacity: 1; }
		100% { transform: rotateY(180deg) translateX(90px) scale(0.8); opacity: 0; }
	}
	@keyframes exit-wrong {
		0%,20%,40%,60%,80%,100% { transform: rotateY(180deg); }
		10%,30%,50%,70%,90%     { transform: rotateY(180deg) translateX(-9px); }
		20%,40%,60%,80%         { transform: rotateY(180deg) translateX(9px); }
		100% { transform: rotateY(180deg) translateX(-70px) scale(0.8); opacity: 0; }
	}

	/* ── Card faces ── */
	.fg-front, .fg-back {
		position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden;
		border-radius: 1.5rem; display: flex; flex-direction: column;
		align-items: center; justify-content: center; gap: 0.35rem; padding: 1.25rem;
		border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent);
		box-shadow: 0 8px 32px rgba(0,0,0,0.28);
	}
	.fg-front { background: linear-gradient(145deg, color-mix(in srgb, var(--accent) 14%, var(--card)), color-mix(in srgb, var(--accent) 6%, var(--card))); }
	.fg-back  { background: linear-gradient(145deg, color-mix(in srgb, var(--accent) 22%, var(--card)), color-mix(in srgb, var(--accent) 10%, var(--card))); transform: rotateY(180deg); }

	.fg-flag  { font-size: 1.4rem; }
	.fg-word  { font-size: 1.4rem; font-weight: 700; color: var(--text); text-align: center; line-height: 1.3; }
	.fg-phonetic { font-size: 0.72rem; color: var(--accent); font-style: italic; opacity: 0.8; text-align: center; }
	.fg-sub   { font-size: 0.68rem; color: var(--muted); font-style: italic; }
	.fg-hint  { font-size: 0.65rem; color: var(--muted); margin-top: 0.15rem; }

	/* ── Rating buttons ── */
	.fg-buttons { display: flex; justify-content: center; gap: 1.25rem; }

	.fg-btn {
		width: 3.1rem; height: 3.1rem; border-radius: var(--radius-full); font-size: 1.35rem;
		display: flex; align-items: center; justify-content: center;
		transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.15s;
		box-shadow: 0 4px 14px rgba(0,0,0,0.22);
		animation: btn-appear 0.3s cubic-bezier(0.34, 1.5, 0.64, 1) both;
	}
	.fg-btn:nth-child(1) { animation-delay: 0ms; }
	.fg-btn:nth-child(2) { animation-delay: 55ms; }
	.fg-btn:nth-child(3) { animation-delay: 110ms; }
	@keyframes btn-appear {
		from { transform: scale(0) translateY(10px); opacity: 0; }
		to   { transform: scale(1) translateY(0);    opacity: 1; }
	}
	.fg-btn:active { transform: scale(0.88); }
	.fg-wrong   { background: rgba(239,68,68,0.14);  border: 1px solid rgba(239,68,68,0.28); }
	.fg-approx  { background: rgba(234,179,8,0.14);  border: 1px solid rgba(234,179,8,0.28); }
	.fg-correct { background: rgba(34,197,94,0.14);  border: 1px solid rgba(34,197,94,0.28); }
	.fg-wrong:hover   { background: rgba(239,68,68,0.26); }
	.fg-approx:hover  { background: rgba(234,179,8,0.26); }
	.fg-correct:hover { background: rgba(34,197,94,0.26); }

	.fg-btn-labels { display: flex; justify-content: center; gap: 2rem; font-size: 0.58rem; color: var(--muted); }
	.fg-btn-labels span { width: 3.1rem; text-align: center; }

	/* ── Done ── */
	.fg-done { display: flex; flex-direction: column; align-items: center; gap: 0.65rem; padding: 0.5rem 0; position: relative; }

	.fg-done-avatar { font-size: 3.2rem; line-height: 1; animation: bounce-in 0.5s cubic-bezier(0.34, 1.6, 0.64, 1); }
	@keyframes bounce-in { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }

	.fg-levelup-badge {
		font-size: 0.8rem; font-weight: 700; color: #fbbf24;
		background: rgba(251,191,36,0.12); border: 1px solid rgba(251,191,36,0.3);
		padding: 0.2rem 0.75rem; border-radius: 99px;
		animation: level-up 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.fg-done-title { font-size: 1.1rem; font-weight: 700; color: var(--accent); }

	.fg-xp-gained {
		font-size: 1.5rem; font-weight: 800; color: var(--accent);
		display: flex; align-items: center; gap: 0.5rem;
		animation: bounce-in 0.45s 0.1s cubic-bezier(0.34, 1.5, 0.64, 1) both;
	}

	.fg-combo-badge {
		font-size: 0.75rem; font-weight: 700; color: #f97316;
		background: rgba(249,115,22,0.12); border: 1px solid rgba(249,115,22,0.3);
		padding: 0.15rem 0.6rem; border-radius: 99px;
	}

	.fg-score-row { display: flex; gap: 1.5rem; }
	.fg-score-item { display: flex; flex-direction: column; align-items: center; gap: 0.15rem; font-size: 1.35rem; font-weight: 700; }
	.fg-score-item span { font-size: 1.1rem; }
	.fg-score-item.correct { color: #22c55e; }
	.fg-score-item.approx  { color: #eab308; }
	.fg-score-item.wrong   { color: #ef4444; }

	.fg-restart {
		margin-top: 0.25rem; padding: 0.55rem 1.4rem;
		background: color-mix(in srgb, var(--accent) 15%, transparent);
		border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
		border-radius: 2rem; color: var(--accent); font-weight: 600; font-size: 0.88rem;
		transition: background 0.15s, transform 0.12s;
	}
	.fg-restart:hover  { background: color-mix(in srgb, var(--accent) 25%, transparent); }
	.fg-restart:active { transform: scale(0.96); }
	.fg-restart:disabled { opacity: 0.5; }

	/* ── Confetti ── */
	.fg-confetti { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
	.fg-cp {
		position: absolute; top: 40%; left: 50%; font-size: 1.3rem;
		animation: confetti-fly 1.2s ease-out both;
		animation-delay: calc(var(--i) * 55ms);
	}
	@keyframes confetti-fly {
		0%   { transform: translate(0,0) scale(1); opacity: 1; }
		100% {
			transform:
				translate(
					calc(cos(calc(var(--i) * 26deg)) * 130px),
					calc(sin(calc(var(--i) * 26deg)) * 110px - 50px)
				) scale(0);
			opacity: 0;
		}
	}

	/* ── Loading ── */
	.fg-center { display: flex; justify-content: center; padding: 3rem 0; }
	.fg-spinner {
		width: 1.5rem; height: 1.5rem;
		border: 2px solid color-mix(in srgb, var(--accent) 22%, transparent);
		border-top-color: var(--accent); border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }
</style>
