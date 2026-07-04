<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { getAudioCache, setAudioCache } from '$lib/audioCache';
	import {
		type Lesson, type Exercise, sameSentence, normalizeAnswer, shuffle,
	} from '$lib/exercises';

	interface DoneResult { stars: number; xp: number }
	let {
		unitId, unitTitle, level, levelColor, l1 = 'kh', onClose, onComplete,
	}: {
		unitId: string; unitTitle: string; level: string; levelColor: string;
		l1: 'fr' | 'kh'; onClose: () => void; onComplete: (r: DoneResult) => void;
	} = $props();

	function t(fr: string, kh: string) { return l1 === 'kh' ? kh : fr; }

	// ── State ────────────────────────────────────────────────────────────────
	let phase = $state<'loading' | 'intro' | 'play' | 'done' | 'error'>('loading');
	let lesson = $state<Lesson | null>(null);
	let idx = $state(0);
	let correctCount = $state(0);
	let errorMsg = $state('');

	// Réponse de l'exercice en cours
	let picked = $state<number | null>(null);     // mcq/listen/fill
	let revealed = $state(false);                  // a-t-on validé ?
	let lastCorrect = $state(false);
	let lastExplain = $state('');
	let orderPicks = $state<number[]>([]);         // ordre : indices choisis
	let orderTokens = $state<string[]>([]);        // tokens mélangés (stable)
	let translateText = $state('');                // production écrite
	let grading = $state(false);

	const ex = $derived<Exercise | null>(lesson?.exercises[idx] ?? null);
	const total = $derived(lesson?.exercises.length ?? 0);
	const playPct = $derived(total > 0 ? (idx / total) * 100 : 0);

	// ── Audio (PCM 24kHz, identique au chat) ──────────────────────────────────
	let audioCtx: AudioContext | null = null;
	let playing = $state(false);
	function ensureAudioCtx() {
		if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
		if (audioCtx.state === 'suspended') audioCtx.resume();
		// iOS 17+ : route l'audio Web Audio sur le canal "média" et non "sonnerie",
		// sinon le bouton silence physique de l'iPhone coupe TOUT le son sans erreur.
		try {
			const ns = navigator as any;
			if (ns.audioSession && ns.audioSession.type !== 'playback') ns.audioSession.type = 'playback';
		} catch { /* API expérimentale, absente ailleurs */ }
	}
	// iOS Safari : débloque l'AudioContext dans le contexte d'un geste utilisateur en
	// jouant un buffer silencieux. Sans ça, toute lecture hors-geste (auto-play) est bloquée.
	function unlockAudio() {
		ensureAudioCtx();
		const ctx = audioCtx;
		if (!ctx) return;
		try {
			const buf = ctx.createBuffer(1, 1, 22050);
			const src = ctx.createBufferSource();
			src.buffer = buf;
			src.connect(ctx.destination);
			src.start(0);
		} catch { /* ignore */ }
	}
	function playBase64Pcm(b64: string): Promise<void> {
		ensureAudioCtx();
		const ctx = audioCtx!;
		const raw = atob(b64);
		const samples = Math.floor(raw.length / 2);
		const buffer = ctx.createBuffer(1, samples, 24000);
		const ch = buffer.getChannelData(0);
		for (let i = 0; i < samples; i++) {
			let v = raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8);
			if (v >= 32768) v -= 65536;
			ch[i] = v / 32768;
		}
		return new Promise((res) => {
			const src = ctx.createBufferSource();
			src.buffer = buffer;
			src.connect(ctx.destination);
			src.onended = () => res();
			src.start(0);
		});
	}
	async function speakFr(text: string) {
		if (!text || playing) return;
		ensureAudioCtx();
		playing = true;
		try {
			const cached = getAudioCache(text, 'fr');
			if (cached) { await playBase64Pcm(cached).catch(() => {}); return; }
			const res = await fetch('/api/chat/speak', {
				method: 'POST', credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text, lang: 'fr' }),
			});
			if (!res.ok) throw new Error('TTS failed');
			const { audio } = await res.json() as { audio: string };
			if (audio) { setAudioCache(text, 'fr', audio); await playBase64Pcm(audio).catch(() => {}); }
		} catch { /* silencieux */ }
		finally { playing = false; }
	}

	// ── Chargement ─────────────────────────────────────────────────────────────
	onMount(async () => {
		try {
			const res = await fetch(`/api/apprendre/lesson?unitId=${unitId}&l1=${l1}`, { credentials: 'include' });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			lesson = await res.json() as Lesson;
			if (!lesson.exercises?.length) throw new Error('empty');
			phase = 'intro';
		} catch (e: any) {
			errorMsg = e?.message ?? 'erreur';
			phase = 'error';
		}
	});

	function startPlay() {
		unlockAudio();   // geste utilisateur "Commencer" → débloque l'audio iOS pour toute la leçon
		phase = 'play';
		idx = 0;
		prepareExercise();
	}

	function prepareExercise() {
		picked = null; revealed = false; lastCorrect = false; lastExplain = '';
		orderPicks = []; translateText = ''; grading = false;
		if (ex?.type === 'order') {
			// Mélange stable des tokens pour cet exercice
			const indexed = ex.tokens.map((tok, i) => ({ tok, i }));
			orderTokens = shuffle(indexed).map(o => o.tok);
		} else {
			orderTokens = [];
		}
		// Auto-lecture pour l'écoute — seulement si le contexte audio est déjà débloqué
		// (sinon iOS bloque ; l'utilisateur peut toujours taper le bouton 🔊).
		if (ex?.type === 'listen') {
			setTimeout(() => {
				if (ex && audioCtx?.state === 'running') speakFr((ex as any).audio);
			}, 350);
		}
	}

	// ── Validation par type ──────────────────────────────────────────────────
	function pickOption(i: number) {
		if (revealed || !ex) return;
		picked = i;
		const answer = (ex as any).answer as number;
		lastCorrect = i === answer;
		lastExplain = (ex as any).explain ?? '';
		commit(lastCorrect);
	}

	function checkOrder() {
		if (revealed || ex?.type !== 'order') return;
		const built = orderPicks.map(i => orderTokens[i]).join(' ');
		lastCorrect = sameSentence(built, ex.answer);
		lastExplain = ex.hint;
		commit(lastCorrect);
	}

	async function checkTranslate() {
		if (revealed || ex?.type !== 'translate' || grading) return;
		grading = true;
		try {
			const res = await fetch('/api/apprendre/grade', {
				method: 'POST', credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ prompt: ex.prompt, expected: ex.expected, answer: translateText, l1 }),
			});
			const r = await res.json() as { correct: boolean; feedback: string; corrected: string };
			lastCorrect = r.correct;
			lastExplain = `${r.feedback}${r.corrected ? `\n✅ ${r.corrected}` : ''}`;
		} catch {
			// Repli : comparaison locale tolérante
			lastCorrect = sameSentence(translateText, ex.expected);
			lastExplain = `✅ ${ex.expected}`;
		}
		grading = false;
		commit(lastCorrect);
	}

	function commit(ok: boolean) {
		revealed = true;
		if (ok) correctCount++;
	}

	function next() {
		if (idx + 1 >= total) { finish(); return; }
		idx++;
		prepareExercise();
	}

	// ── Fin ────────────────────────────────────────────────────────────────────
	let stars = $state(0);
	let xpGained = $state(0);
	let saving = $state(false);
	async function finish() {
		const ratio = total > 0 ? correctCount / total : 0;
		stars = ratio >= 0.9 ? 3 : ratio >= 0.7 ? 2 : ratio >= 0.5 ? 1 : 0;
		xpGained = 15 + correctCount * 5 + stars * 5;
		phase = 'done';
		saving = true;
		try {
			await fetch('/api/apprendre/progress', {
				method: 'POST', credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ unitId, stars, xp_gained: xpGained }),
			});
		} catch { /* ignore */ }
		saving = false;
		onComplete({ stars, xp: xpGained });
	}

	// ── Order helpers ──────────────────────────────────────────────────────────
	function addToken(i: number) { if (!revealed && !orderPicks.includes(i)) orderPicks = [...orderPicks, i]; }
	function removeToken(pos: number) { if (!revealed) orderPicks = orderPicks.filter((_, p) => p !== pos); }
	const orderRemaining = $derived(orderTokens.map((_, i) => i).filter(i => !orderPicks.includes(i)));
</script>

<div class="lp-overlay" transition:fade={{ duration: 180 }}>
	<div class="lp-panel" style="--lvl-color:{levelColor}" transition:fly={{ y: 30, duration: 280 }}>
		<!-- En-tête -->
		<div class="lp-top">
			<button class="lp-close" onclick={onClose} aria-label="Fermer">✕</button>
			{#if phase === 'play'}
				<div class="lp-bar"><div class="lp-bar-fill" style="width:{playPct}%"></div></div>
				<span class="lp-count">{idx + 1}/{total}</span>
			{:else}
				<span class="lp-unit">{level} · {unitTitle}</span>
				<span class="lp-spacer"></span>
			{/if}
		</div>

		<!-- Loading -->
		{#if phase === 'loading'}
			<div class="lp-center">
				<span class="lp-spinner"></span>
				<p class="lp-muted">{t('Préparation de la leçon…', 'កំពុងរៀបចំមេរៀន…')}</p>
			</div>

		<!-- Erreur -->
		{:else if phase === 'error'}
			<div class="lp-center">
				<p class="lp-err">😕 {t('Impossible de générer la leçon.', 'មិនអាចបង្កើតមេរៀនបានទេ។')}</p>
				<button class="lp-btn" onclick={onClose}>{t('Retour', 'ត្រឡប់')}</button>
			</div>

		<!-- Intro -->
		{:else if phase === 'intro' && lesson}
			<div class="lp-body lp-intro" in:fade>
				<div class="lp-intro-icon" style="background:color-mix(in srgb, var(--lvl-color) 18%, var(--card))">💡</div>
				<h2 class="lp-intro-title">{unitTitle}</h2>
				<p class="lp-intro-txt">{lesson.intro}</p>
				<button class="lp-btn lp-btn-primary" onclick={startPlay}>{t('Commencer', 'ចាប់ផ្តើម')} →</button>
			</div>

		<!-- Play -->
		{:else if phase === 'play' && ex}
			<div class="lp-body" in:fly={{ x: 24, duration: 220 }}>
				{#if ex.type === 'mcq'}
					<p class="lp-q">{ex.q}</p>
					<div class="lp-options">
						{#each ex.options as opt, i}
							<button class="lp-opt"
								class:picked={picked === i}
								class:correct={revealed && i === ex.answer}
								class:wrong={revealed && picked === i && i !== ex.answer}
								disabled={revealed}
								onclick={() => pickOption(i)}>{opt}</button>
						{/each}
					</div>

				{:else if ex.type === 'listen'}
					<p class="lp-instr">{t('Écoute et choisis le bon sens', 'ស្តាប់ ហើយជ្រើសរើសអត្ថន័យត្រឹមត្រូវ')}</p>
					<button class="lp-audio" class:playing onclick={() => speakFr(ex.audio)} aria-label="Écouter">
						<span class="lp-audio-ico">🔊</span>
						<span class="lp-audio-wave"></span>
					</button>
					<p class="lp-audio-hint">{t('Pas de son ? Vérifie le bouton silence 🔕', 'គ្មានសំឡេង? ពិនិត្យប៊ូតុងស្ងាត់ 🔕')}</p>
					<div class="lp-options">
						{#each ex.options as opt, i}
							<button class="lp-opt"
								class:picked={picked === i}
								class:correct={revealed && i === ex.answer}
								class:wrong={revealed && picked === i && i !== ex.answer}
								disabled={revealed}
								onclick={() => pickOption(i)}>{opt}</button>
						{/each}
					</div>

				{:else if ex.type === 'fill'}
					<p class="lp-instr">{t('Complète la phrase', 'បំពេញប្រយោគ')}</p>
					<p class="lp-fill">
						{ex.before}<span class="lp-blank">{picked !== null ? ex.options[picked] : '____'}</span>{ex.after}
						<button class="lp-mini-audio" onclick={() => ex.type === 'fill' && speakFr(`${ex.before} ${ex.options[ex.answer]} ${ex.after}`)} aria-label="Écouter">🔊</button>
					</p>
					<div class="lp-options lp-options-row">
						{#each ex.options as opt, i}
							<button class="lp-opt"
								class:picked={picked === i}
								class:correct={revealed && i === ex.answer}
								class:wrong={revealed && picked === i && i !== ex.answer}
								disabled={revealed}
								onclick={() => pickOption(i)}>{opt}</button>
						{/each}
					</div>

				{:else if ex.type === 'order'}
					<p class="lp-instr">{t('Remets les mots dans l\'ordre', 'រៀបពាក្យឱ្យត្រឹមត្រូវ')}</p>
					<p class="lp-hint">{ex.hint}</p>
					<div class="lp-build" class:empty={orderPicks.length === 0}>
						{#each orderPicks as pi, pos}
							<button class="lp-tok built" disabled={revealed} onclick={() => removeToken(pos)}>{orderTokens[pi]}</button>
						{/each}
					</div>
					<div class="lp-bank">
						{#each orderRemaining as i}
							<button class="lp-tok" disabled={revealed} onclick={() => addToken(i)}>{orderTokens[i]}</button>
						{/each}
					</div>

				{:else if ex.type === 'translate'}
					<p class="lp-instr">{t('Traduis en français', 'បកប្រែជាភាសាបារាំង')}</p>
					<p class="lp-q lp-q-l1">{ex.prompt}</p>
					<textarea class="lp-textarea" bind:value={translateText} disabled={revealed}
						placeholder={t('Écris ta réponse…', 'សរសេរចម្លើយរបស់អ្នក…')} rows="2"></textarea>
				{/if}

				<!-- Feedback -->
				{#if revealed}
					<div class="lp-feedback" class:ok={lastCorrect} class:ko={!lastCorrect} in:fly={{ y: 16, duration: 200 }}>
						<span class="lp-fb-head">{lastCorrect ? t('Bravo !', 'ល្អណាស់!') : t('Pas tout à fait', 'មិនទាន់ត្រឹមត្រូវ')}</span>
						{#if lastExplain}<span class="lp-fb-txt">{lastExplain}</span>{/if}
					</div>
				{/if}
			</div>

			<!-- Actions -->
			<div class="lp-actions">
				{#if !revealed}
					{#if ex.type === 'order'}
						<button class="lp-btn lp-btn-primary" disabled={orderPicks.length === 0} onclick={checkOrder}>{t('Vérifier', 'ពិនិត្យ')}</button>
					{:else if ex.type === 'translate'}
						<button class="lp-btn lp-btn-primary" disabled={!translateText.trim() || grading} onclick={checkTranslate}>
							{grading ? '…' : t('Vérifier', 'ពិនិត្យ')}
						</button>
					{/if}
				{:else}
					<button class="lp-btn lp-btn-primary" onclick={next}>
						{idx + 1 >= total ? t('Terminer', 'បញ្ចប់') : t('Continuer', 'បន្ត')} →
					</button>
				{/if}
			</div>

		<!-- Done -->
		{:else if phase === 'done'}
			<div class="lp-body lp-done" in:fade>
				<div class="lp-done-stars">
					{#each Array(3) as _, i}<span class="lp-star" class:lit={i < stars} style="--d:{i * 0.12}s">★</span>{/each}
				</div>
				<p class="lp-done-title">{stars >= 2 ? t('Excellent !', 'ល្អឥតខ្ចោះ!') : stars === 1 ? t('Bien joué !', 'ល្អ!') : t('Continue à t\'entraîner', 'បន្តហ្វឹកហាត់')}</p>
				<div class="lp-done-score">{correctCount}/{total} · +{xpGained} XP</div>
				<button class="lp-btn lp-btn-primary" onclick={onClose} disabled={saving}>
					{saving ? '💾 …' : t('Retour au parcours', 'ត្រឡប់ទៅផែនទី')}
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.lp-overlay {
		position: fixed; inset: 0; z-index: 80;
		background: rgba(2,4,10,0.78); backdrop-filter: blur(10px);
		display: flex; align-items: stretch; justify-content: center;
	}
	.lp-panel {
		width: 100%; max-width: 32rem; display: flex; flex-direction: column;
		/* Surface sombre + texte clair forcé (lisible quel que soit le mode du téléphone). */
		background: #0B1A28;
		--text: #EAF4F8;
		--muted: #8FB2C4;
		--card: #14283A;
		color: #EAF4F8;
		padding: max(env(safe-area-inset-top), 0.6rem) 1.1rem calc(1rem + env(safe-area-inset-bottom, 0px));
	}

	.lp-top { display: flex; align-items: center; gap: 0.7rem; padding-bottom: 0.7rem; }
	.lp-close {
		width: 2rem; height: 2rem; border-radius: 50%; flex-shrink: 0;
		background: color-mix(in srgb, var(--muted) 16%, transparent);
		color: var(--text); font-size: 0.8rem;
		display: flex; align-items: center; justify-content: center;
	}
	.lp-bar { flex: 1; height: 8px; border-radius: 99px; background: color-mix(in srgb, var(--muted) 18%, transparent); overflow: hidden; }
	.lp-bar-fill { height: 100%; border-radius: 99px; background: var(--lvl-color); transition: width 0.4s cubic-bezier(0.34,1.2,0.64,1); }
	.lp-count { font-size: 0.72rem; color: var(--muted); font-weight: 700; }
	.lp-unit { flex: 1; font-size: 0.8rem; font-weight: 700; color: var(--text); }
	.lp-spacer { width: 2rem; }

	.lp-body { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem; padding: 0.5rem 0; }

	.lp-center { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.8rem; }
	.lp-spinner { width: 1.8rem; height: 1.8rem; border: 2px solid color-mix(in srgb, var(--lvl-color) 25%, transparent); border-top-color: var(--lvl-color); border-radius: 50%; animation: spin 0.7s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }
	.lp-muted { font-size: 0.8rem; color: var(--muted); }
	.lp-err { font-size: 0.9rem; color: var(--text); text-align: center; }

	/* Intro */
	.lp-intro { align-items: center; text-align: center; justify-content: center; gap: 1.1rem; padding: 1rem; }
	.lp-intro-icon { width: 4rem; height: 4rem; border-radius: 1.4rem; display: flex; align-items: center; justify-content: center; font-size: 2rem; }
	.lp-intro-title { font-size: 1.3rem; font-weight: 800; color: var(--text); }
	.lp-intro-txt { font-size: 0.95rem; line-height: 1.5; color: var(--text); opacity: 0.85; }

	/* Questions */
	.lp-q { font-size: 1.15rem; font-weight: 700; color: var(--text); line-height: 1.35; }
	.lp-q-l1 { font-size: 1.25rem; }
	.lp-instr { font-size: 0.72rem; font-weight: 700; color: var(--lvl-color); text-transform: uppercase; letter-spacing: 0.05em; }
	.lp-hint { font-size: 0.95rem; color: var(--muted); font-style: italic; }

	.lp-options { display: flex; flex-direction: column; gap: 0.55rem; }
	.lp-options-row { flex-direction: row; flex-wrap: wrap; }
	.lp-options-row .lp-opt { flex: 1; min-width: 30%; text-align: center; }
	.lp-opt {
		padding: 0.85rem 1rem; border-radius: 1rem; text-align: left;
		background: var(--card); border: 1.5px solid color-mix(in srgb, var(--muted) 22%, transparent);
		color: var(--text); font-size: 0.98rem; font-weight: 600;
		transition: transform 0.12s, border-color 0.15s, background 0.15s;
	}
	.lp-opt:active:not(:disabled) { transform: scale(0.98); }
	.lp-opt.picked { border-color: var(--lvl-color); background: color-mix(in srgb, var(--lvl-color) 10%, var(--card)); }
	.lp-opt.correct { border-color: #22c55e; background: rgba(34,197,94,0.14); }
	.lp-opt.wrong { border-color: #ef4444; background: rgba(239,68,68,0.14); }

	/* Audio */
	.lp-audio {
		align-self: center; width: 5rem; height: 5rem; border-radius: 50%;
		background: color-mix(in srgb, var(--lvl-color) 18%, var(--card));
		border: 2px solid color-mix(in srgb, var(--lvl-color) 45%, transparent);
		display: flex; align-items: center; justify-content: center; font-size: 2rem;
		transition: transform 0.15s;
	}
	.lp-audio:active { transform: scale(0.92); }
	.lp-audio.playing { animation: audio-pulse 1s ease-in-out infinite; }
	@keyframes audio-pulse { 0%,100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--lvl-color) 40%, transparent); } 50% { box-shadow: 0 0 0 12px transparent; } }
	.lp-audio-wave { display: none; }
	.lp-audio-hint { font-size: 0.66rem; color: var(--muted); text-align: center; }
	.lp-mini-audio { font-size: 1rem; margin-left: 0.4rem; opacity: 0.7; }

	/* Fill */
	.lp-fill { font-size: 1.15rem; line-height: 1.6; color: var(--text); }
	.lp-blank { display: inline-block; min-width: 3rem; padding: 0 0.4rem; border-bottom: 2px solid var(--lvl-color); color: var(--lvl-color); font-weight: 700; text-align: center; }

	/* Order */
	.lp-build {
		display: flex; flex-wrap: wrap; gap: 0.4rem; min-height: 3rem; padding: 0.6rem;
		border-radius: 0.9rem; border: 1.5px dashed color-mix(in srgb, var(--lvl-color) 40%, transparent);
		background: color-mix(in srgb, var(--lvl-color) 6%, transparent);
	}
	.lp-build.empty::before { content: ''; }
	.lp-bank { display: flex; flex-wrap: wrap; gap: 0.4rem; }
	.lp-tok {
		padding: 0.55rem 0.85rem; border-radius: 0.7rem; font-size: 0.98rem; font-weight: 600;
		background: var(--card); border: 1.5px solid color-mix(in srgb, var(--muted) 25%, transparent); color: var(--text);
		transition: transform 0.1s;
	}
	.lp-tok:active:not(:disabled) { transform: scale(0.94); }
	.lp-tok.built { background: color-mix(in srgb, var(--lvl-color) 14%, var(--card)); border-color: var(--lvl-color); }

	/* Translate */
	.lp-textarea {
		width: 100%; padding: 0.85rem; border-radius: 1rem; resize: none;
		background: var(--card); border: 1.5px solid color-mix(in srgb, var(--muted) 22%, transparent);
		color: var(--text); font-size: 1.05rem; font-family: inherit; line-height: 1.4;
	}
	.lp-textarea:focus { outline: none; border-color: var(--lvl-color); }

	/* Feedback */
	.lp-feedback { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.8rem 1rem; border-radius: 1rem; }
	.lp-feedback.ok { background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.3); }
	.lp-feedback.ko { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.28); }
	.lp-fb-head { font-size: 0.95rem; font-weight: 800; }
	.lp-feedback.ok .lp-fb-head { color: #16a34a; }
	.lp-feedback.ko .lp-fb-head { color: #dc2626; }
	.lp-fb-txt { font-size: 0.88rem; color: var(--text); line-height: 1.4; white-space: pre-line; }

	/* Actions */
	.lp-actions { padding-top: 0.6rem; }
	.lp-btn {
		width: 100%; padding: 0.9rem; border-radius: 1rem; font-size: 0.98rem; font-weight: 800;
		background: color-mix(in srgb, var(--muted) 16%, transparent); color: var(--text);
		transition: transform 0.12s, opacity 0.15s;
	}
	.lp-btn:active:not(:disabled) { transform: scale(0.98); }
	.lp-btn:disabled { opacity: 0.45; }
	.lp-btn-primary { background: var(--lvl-color); color: #fff; }

	/* Done */
	.lp-done { align-items: center; justify-content: center; text-align: center; gap: 1.1rem; }
	.lp-done-stars { display: flex; gap: 0.5rem; }
	.lp-star { font-size: 2.6rem; color: color-mix(in srgb, var(--muted) 35%, transparent); }
	.lp-star.lit { color: #fbbf24; filter: drop-shadow(0 0 8px rgba(251,191,36,0.6)); animation: star-pop 0.5s var(--d) cubic-bezier(0.34,1.6,0.64,1) both; }
	@keyframes star-pop { from { transform: scale(0) rotate(-30deg); } to { transform: scale(1) rotate(0); } }
	.lp-done-title { font-size: 1.4rem; font-weight: 800; color: var(--text); }
	.lp-done-score { font-size: 1.05rem; font-weight: 700; color: var(--lvl-color); }
</style>
