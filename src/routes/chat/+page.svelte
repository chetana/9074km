<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { auth, userStore } from '$lib/auth';
	import {
		fetchMessages, sendMessage, suggestMessage, deleteMessage, transcribeAudio,
		signUpload, uploadFile, signDownload, invalidateListCache,
		fetchLessons, type ChatMessage, type GeminiSuggestion, type LessonEntry, type LessonItem
	} from '$lib/api';

	// ── Date du jour (pour GCS — envoi toujours vers aujourd'hui) ────────
	const today = new Date();
	const Y = String(today.getFullYear());
	const M = String(today.getMonth() + 1).padStart(2, '0');
	const D = String(today.getDate()).padStart(2, '0');

	// ── État ─────────────────────────────────────────────────────────────
	let messages = $state<ChatMessage[]>([]);
	let inputText = $state('');
	let sending = $state(false);
	let suggestion = $state<GeminiSuggestion | null>(null);
	let suggestionLoading = $state(false);
	let lastSuggestedText = '';
	let listEl = $state<HTMLElement | null>(null);
	let imageUrls = $state<Record<string, string>>({});
	let imageInput: HTMLInputElement | undefined;
	let vadLoading = $state(false);   // init ONNX en cours
	let recording = $state(false);    // VAD prêt, écoute active
	let speaking = $state(false);     // voix détectée en cours
	let transcribing = $state(false);
	let vad: { start(): void; destroy(): void } | null = null;
	let selectedMsg = $state<string | null>(null);
	let viewOffset = $state(0);       // 0 = aujourd'hui, -1 = hier, etc.
	let isOnline = $state(true);
	let loadingMessages = $state(false);
	let showLessons = $state(false);
	let lessons = $state<LessonEntry[]>([]);
	let lessonsLoading = $state(false);

	const user = userStore;
	// Vérifie si un prénom correspond à Chet (Chet, Chetana, Chétana, etc.)
	function isChet(name: string): boolean {
		const n = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
		return n === 'chet' || n === 'chetana';
	}
	// $user est réactif (store Svelte 4), contrairement à auth.getFirstName() qui utilise get()
	const firstName = $derived($user?.name.split(' ')[0] ?? '');
	// Détermine la langue de l'utilisateur connecté : Chet → fr, tout autre → kh par défaut
	const userLang = $derived<'fr' | 'kh'>(isChet(firstName) ? 'fr' : 'kh');

	// ── Date de navigation ────────────────────────────────────────────────
	const viewDate = $derived(new Date(today.getFullYear(), today.getMonth(), today.getDate() + viewOffset));
	const vY = $derived(String(viewDate.getFullYear()));
	const vM = $derived(String(viewDate.getMonth() + 1).padStart(2, '0'));
	const vD = $derived(String(viewDate.getDate()).padStart(2, '0'));
	const isToday = $derived(viewOffset === 0);
	const dayLabelStr = $derived(
		viewOffset === 0 ? (userLang === 'kh' ? 'ថ្ងៃនេះ' : 'Aujourd\'hui') :
		viewOffset === -1 ? (userLang === 'kh' ? 'ម្សិលមិញ' : 'Hier') :
		viewDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
	);

	// ── Chargement & polling ──────────────────────────────────────────────
	async function loadMessages() {
		// Polling léger : ne remplace que si nouveaux messages (aujourd'hui uniquement)
		const fresh = await fetchMessages(vY, vM, vD);
		if (fresh.length !== messages.length) {
			messages = fresh;
			await tick();
			scrollToBottom();
		}
	}

	async function loadDate() {
		// Chargement complet (navigation) : remplace toujours
		loadingMessages = true;
		messages = [];
		try {
			const fresh = await fetchMessages(vY, vM, vD);
			messages = fresh;
			await tick();
			scrollToBottom();
		} finally {
			loadingMessages = false;
		}
	}

	function prevDay() { viewOffset--; void loadDate(); }
	function nextDay() { if (!isToday) { viewOffset++; void loadDate(); } }

	function scrollToBottom() {
		if (listEl) listEl.scrollTop = listEl.scrollHeight;
	}

	let pollInterval: ReturnType<typeof setInterval>;

	// Déclenche le premier chargement dès que l'auth est prête (évite la race condition
	// entre auth.init() dans le layout et loadDate() qui appelle auth.getToken())
	let chatInitialized = false;
	$effect(() => {
		if ($user && !chatInitialized) {
			chatInitialized = true;
			void loadDate();
		} else if (!$user) {
			chatInitialized = false; // reset si déconnexion
		}
	});

	onMount(() => {
		isOnline = navigator.onLine;
		window.addEventListener('online', () => { isOnline = true; });
		window.addEventListener('offline', () => { isOnline = false; });
		pollInterval = setInterval(() => { if (isToday) void loadMessages(); }, 8000);
	});
	onDestroy(() => { clearInterval(pollInterval); stopRecording(); });

	// ── Suggestion Gemini (debounce 1s) ───────────────────────────────────
	let debounceTimer: ReturnType<typeof setTimeout>;

	function onInput() {
		suggestion = null;
		clearTimeout(debounceTimer);
		const text = inputText.trim();
		if (text.length < 3 || text === lastSuggestedText) return;
		debounceTimer = setTimeout(async () => {
			suggestionLoading = true;
			try {
				suggestion = await suggestMessage(text);
				lastSuggestedText = text;
			} catch {
				suggestion = null;
			} finally {
				suggestionLoading = false;
			}
		}, 1000);
	}

	function acceptSuggestion() {
		if (!suggestion) return;
		inputText = suggestion.corrected;
		suggestion = null;
	}

	function dismissSuggestion() {
		suggestion = null;
	}

	// ── Images ──────────────────────────────────────────────────────────────
	$effect(() => {
		for (const msg of messages) {
			if (msg.image && !imageUrls[msg.image]) loadImageUrl(msg.image);
		}
	});

	async function loadImageUrl(path: string) {
		try {
			const url = await signDownload(path);
			imageUrls = { ...imageUrls, [path]: url };
		} catch { /* ignore */ }
	}

	async function compressImage(file: File): Promise<{ bytes: Uint8Array; contentType: string; ext: string }> {
		const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
			(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
		const mimeType = isIOS ? 'image/jpeg' : 'image/webp';
		const ext = isIOS ? 'jpg' : 'webp';

		const img = new Image();
		const objectUrl = URL.createObjectURL(file);
		img.src = objectUrl;
		await new Promise<void>(resolve => { img.onload = () => resolve(); });

		const MAX = 1200;
		let w = img.naturalWidth, h = img.naturalHeight;
		if (w > MAX || h > MAX) {
			if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
			else { w = Math.round(w * MAX / h); h = MAX; }
		}
		const canvas = document.createElement('canvas');
		canvas.width = w; canvas.height = h;
		canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
		URL.revokeObjectURL(objectUrl);

		const blob = await new Promise<Blob>((resolve, reject) =>
			canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), mimeType, 0.85)
		);
		return { bytes: new Uint8Array(await blob.arrayBuffer()), contentType: mimeType, ext };
	}

	async function pickAndSendImage() {
		if (!imageInput || !firstName || sending) return;
		imageInput.value = '';
		imageInput.click();
	}

	async function onImageSelected() {
		const file = imageInput?.files?.[0];
		if (!file || !firstName) return;
		sending = true;
		try {
			const { bytes, contentType, ext } = await compressImage(file);
			const filename = Date.now() + '-' + Math.random().toString(36).slice(2, 7) + '.' + ext;
			const path = Y + '/' + M + '/' + D + '/' + filename;
			const signedUrl = await signUpload(path, contentType);
			await uploadFile(signedUrl, bytes, contentType);
			invalidateListCache(Y + '/' + M + '/' + D + '/');
			const msg = await sendMessage(Y, M, D, firstName, '', { fr: '', en: '', kh: '' }, path);
			messages = [...messages, msg];
			await tick();
			scrollToBottom();
		} catch {
			showError(userLang === 'kh' ? '❌ បរាជ័យក្នុងការផ្ញើរូប' : '❌ Échec de l\'envoi de l\'image');
		} finally {
			sending = false;
		}
	}

	function selectMsg(id: string) {
		selectedMsg = selectedMsg === id ? null : id;
	}

	async function deleteSelected() {
		if (!selectedMsg) return;
		const id = selectedMsg;
		selectedMsg = null;
		try {
			await deleteMessage(Y, M, D, id);
			messages = messages.filter(m => m.id !== id);
		} catch {
			selectedMsg = id; // restaure si erreur
		}
	}

	let copyToast = $state(false);
	let errorToast = $state<string | null>(null);
	let errorToastTimer: ReturnType<typeof setTimeout>;

	function showError(msg: string) {
		clearTimeout(errorToastTimer);
		errorToast = msg;
		errorToastTimer = setTimeout(() => { errorToast = null; }, 3000);
	}

	function speakSelected(lang: 'fr' | 'en' | 'kh') {
		const msg = messages.find(m => m.id === selectedMsg);
		if (!msg || !('speechSynthesis' in window)) return;
		const textMap = { fr: msg.fr || msg.text, en: msg.en || msg.text, kh: msg.kh || msg.text };
		const localeMap = { fr: 'fr-FR', en: 'en-US', kh: 'km-KH' };
		const text = textMap[lang];
		if (!text) return;
		speechSynthesis.cancel();
		const utt = new SpeechSynthesisUtterance(text);
		utt.lang = localeMap[lang];
		speechSynthesis.speak(utt);
		selectedMsg = null;
	}

	async function copySelected() {
		const msg = messages.find(m => m.id === selectedMsg);
		if (!msg) return;
		const parts: string[] = [];
		if (msg.fr || msg.en || msg.kh) {
			const aLang = (msg.lang as 'fr' | 'en' | 'kh' | undefined) ?? (isChet(msg.author) ? 'fr' : 'kh');
			const flagMap: Record<string, string> = { fr: '🇫🇷 ', en: '🇬🇧 ', kh: '🇰🇭 ' };
			parts.push((flagMap[aLang] ?? '') + msg.text);
			if (aLang !== 'fr' && msg.fr) parts.push('🇫🇷 ' + msg.fr);
			if (aLang !== 'en' && msg.en) parts.push('🇬🇧 ' + msg.en);
			if (aLang !== 'kh' && msg.kh) parts.push('🇰🇭 ' + msg.kh);
		} else if (msg.text) {
			parts.push(msg.text);
		}
		try {
			await navigator.clipboard.writeText(parts.join('\n'));
			selectedMsg = null;
			copyToast = true;
			setTimeout(() => { copyToast = false; }, 2000);
		} catch { /* ignore */ }
	}

	// ── Audio (VAD — Silero + noiseSuppression) ────────────────────────────
	// Float32 PCM 16kHz → WAV (format accepté par Gemini)
	function float32ToWav(samples: Float32Array, sampleRate = 16000): Blob {
		const len = samples.length;
		const buf = new ArrayBuffer(44 + len * 2);
		const view = new DataView(buf);
		const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
		w(0, 'RIFF'); view.setUint32(4, 36 + len * 2, true);
		w(8, 'WAVE'); w(12, 'fmt ');
		view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
		view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
		view.setUint16(32, 2, true); view.setUint16(34, 16, true);
		w(36, 'data'); view.setUint32(40, len * 2, true);
		for (let i = 0; i < len; i++) {
			const s = Math.max(-1, Math.min(1, samples[i]));
			view.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true);
		}
		return new Blob([buf], { type: 'audio/wav' });
	}

	function arrayBufferToBase64(buf: ArrayBuffer): string {
		const bytes = new Uint8Array(buf);
		let binary = '';
		for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
		return btoa(binary);
	}

	async function processAudio(samples: Float32Array) {
		if (!firstName) return;
		if (samples.length < 16000 * 0.8) return; // < 0.8s → bruit court, ignorer
		transcribing = true;
		try {
			const wav = float32ToWav(samples);
			const base64 = arrayBufferToBase64(await wav.arrayBuffer());
			const result = await transcribeAudio(base64, 'audio/wav');
			if (!result.text.trim()) return;
			const msg = await sendMessage(Y, M, D, firstName, result.text, { fr: result.fr, en: result.en, kh: result.kh }, undefined, 'audio');
			messages = [...messages, msg];
			await tick();
			scrollToBottom();
		} catch {
			showError(userLang === 'kh' ? '❌ ការចំលងសម្លេងបានបរាជ័យ' : '❌ Échec de la transcription');
		} finally {
			transcribing = false;
		}
	}

	async function startRecording() {
		if (vad || vadLoading) return;
		vadLoading = true;
		try {
			// Import dynamique (SSR-safe) — charge le modèle Silero + ONNX
			const { MicVAD } = await import('@ricky0123/vad-web');
			const micVad = await MicVAD.new({
				workletURL: '/vad.worklet.bundle.min.js',
				modelURL: '/silero_vad_v5.onnx',
				ortConfig: (ort: any) => { ort.env.wasm.wasmPaths = '/'; },
				additionalAudioConstraints: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
				onSpeechStart: () => { speaking = true; },
				onSpeechEnd: (audio: Float32Array) => {
					speaking = false;
					if (!transcribing) void processAudio(audio);
				},
			});
			vad = micVad;
			vad.start();
			vadLoading = false;
			recording = true;
		} catch (e) {
			console.error('VAD init failed:', e);
			vadLoading = false;
		}
	}

	function stopRecording() {
		vad?.destroy();
		vad = null;
		vadLoading = false;
		recording = false;
		speaking = false;
	}

	async function toggleRecording() {
		if (vadLoading || recording) stopRecording();
		else await startRecording();
	}

	// ── Envoi ─────────────────────────────────────────────────────────────
	async function send() {
		const text = inputText.trim();
		if (!text || sending || !firstName) return;

		// Utilise les traductions de la suggestion si dispo, sinon le backend traduira
		const translations = {
			fr: suggestion?.fr ?? '',
			en: suggestion?.en ?? '',
			kh: suggestion?.kh ?? '',
			lang: suggestion?.lang ?? '',
			...(suggestion?.lessons?.length ? { lessons: suggestion.lessons } : {}),
		};
		sending = true;
		suggestion = null;
		inputText = '';
		lastSuggestedText = '';
		clearTimeout(debounceTimer);

		try {
			const msg = await sendMessage(Y, M, D, firstName, text, translations);
			messages = [...messages, msg];
			await tick();
			scrollToBottom();
		} catch {
			inputText = text; // restaure si erreur
			showError(userLang === 'kh' ? '❌ បរាជ័យក្នុងការផ្ញើសារ' : '❌ Échec de l\'envoi');
		} finally {
			sending = false;
		}
	}

	async function loadLessons() {
		showLessons = true;
		lessonsLoading = true;
		try { lessons = await fetchLessons(); } finally { lessonsLoading = false; }
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			send();
		}
	}

	// ── Formatage heure ───────────────────────────────────────────────────
	function fmtTime(ts: string) {
		return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
	}

	function fmtTimeKH(ts: string) {
		return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Phnom_Penh' });
	}

	// ── UI bilingue selon l'utilisateur ──────────────────────────────────
	const ui = $derived(userLang === 'kh' ? {
		thinking:    'ការស្នើ …',
		placeholder: 'សរសេរសារ…',
		yes:         '✓ បាទ/ចាស',
		no:          '✗ ទេ',
		empty:       'មិនទាន់មានសារនៅថ្ងៃនោះទេ',
		emptySub:    'ចាប់ផ្តើមមុននៅថ្ងៃនេះ ♡',
		authMsg:     'ចូលគណនីដើម្បីប្រើ Chat 💬',
		authBtn:     'ចូលជាមួយ Google',
		lessonsTitle: 'មេរៀនរបស់ខ្ញុំ',
		lessonsEmpty: 'មិនទាន់មានការកែប្រែ',
	} : {
		thinking:    'proposition en cours…',
		placeholder: 'Écris un message…',
		yes:         '✓ Oui',
		no:          '✗ Non',
		empty:       'Pas encore de messages ce jour-là',
		emptySub:    'Commence la conversation ♡',
		authMsg:     'Connecte-toi pour accéder au chat 💬',
		authBtn:     'Se connecter avec Google',
		lessonsTitle: 'Mes leçons',
		lessonsEmpty: 'Aucune leçon pour l\'instant',
	});
</script>

<svelte:head>
	<title>Chet & Lys · Chat</title>
</svelte:head>

<div class="page">

	{#if !$user}
		<!-- Auth gate identique au coffre -->
		<div class="auth-gate">
			<p class="auth-msg">{ui.authMsg}</p>
			<button class="sign-in-btn" onclick={() => auth.signIn()}>
				{ui.authBtn}
			</button>
		</div>
	{:else}
		<!-- ── Bannière offline ── -->
		{#if !isOnline}
			<div class="offline-banner">📡 {userLang === 'kh' ? 'គ្មានការតភ្ជាប់' : 'Hors ligne'}</div>
		{/if}

		<!-- ── Navigation date ── -->
		<div class="date-nav">
			<button class="date-btn" onclick={prevDay} aria-label="Jour précédent">‹</button>
			<span class="date-label">{dayLabelStr}</span>
			<button class="date-btn" onclick={nextDay} disabled={isToday} aria-label="Jour suivant">›</button>
			<button class="lessons-btn" onclick={loadLessons} aria-label="Leçons">📖</button>
		</div>

		<!-- ── Liste des messages ── -->
		<div class="message-list" bind:this={listEl}>
			{#if loadingMessages}
				<div class="empty">
					<span class="loading-spinner"></span>
				</div>
			{:else if messages.length === 0}
				<div class="empty">
					<span class="empty-icon">💬</span>
					<p>{ui.empty}</p>
					<p class="empty-sub">{ui.emptySub}</p>
				</div>
			{/if}

			{#each messages as msg (msg.id)}
				{@const isMine = msg.author === firstName}
				{@const legacy = (msg as unknown as { translation?: string }).translation}
				{@const aLang = (msg.lang as 'fr' | 'en' | 'kh' | undefined) ?? (isChet(msg.author) ? 'fr' : 'kh')}
				<div class="bubble-row" class:mine={isMine} class:selected={selectedMsg === msg.id} onclick={() => selectMsg(msg.id)} role="button" tabindex="0">
					{#if !isMine}
						<span class="author-label">{msg.author}</span>
					{/if}
					<div class="bubble" class:mine={isMine}>
						{#if msg.source === 'audio'}<span class="source-badge">🎤</span>{/if}
						{#if msg.image}
							{#if imageUrls[msg.image]}
								<img class="bubble-img" src={imageUrls[msg.image]} alt="" loading="lazy" />
							{:else}
								<div class="bubble-img-loading">⏳</div>
							{/if}
						{/if}
						{#if msg.fr || msg.en || msg.kh}
							<div class="bubble-translations">
								<p class="bubble-translation"><span class="transl-flag">{aLang === 'fr' ? '🇫🇷' : aLang === 'en' ? '🇬🇧' : '🇰🇭'}</span>{msg.text}</p>
								{#if aLang !== 'fr' && msg.fr}<p class="bubble-translation"><span class="transl-flag">🇫🇷</span>{msg.fr}</p>{/if}
								{#if aLang !== 'en' && msg.en}<p class="bubble-translation"><span class="transl-flag">🇬🇧</span>{msg.en}</p>{/if}
								{#if aLang !== 'kh' && msg.kh}<p class="bubble-translation"><span class="transl-flag">🇰🇭</span>{msg.kh}</p>{/if}
							</div>
						{:else}
							<p class="bubble-text">{msg.text}</p>
							{#if legacy}
								<div class="bubble-translations">
													<p class="bubble-translation">{legacy}</p>
								</div>
							{/if}
						{/if}
						<span class="bubble-time">🇫🇷 {fmtTime(msg.ts)} · 🇰🇭 {fmtTimeKH(msg.ts)}</span>
					</div>
				</div>
			{/each}
		</div>

		<!-- ── Popup actions (copier / supprimer / écouter) ── -->
		{#if selectedMsg}
			{@const selMsg = messages.find(m => m.id === selectedMsg)}
			<div class="action-bar">
				<div class="action-row">
					<button class="action-btn copy" onclick={copySelected}>
						{userLang === 'kh' ? '📋 ចម្លង' : '📋 Copier'}
					</button>
					{#if selMsg?.author === firstName}
						<button class="action-btn delete" onclick={deleteSelected}>
							{userLang === 'kh' ? '🗑 លុប' : '🗑 Supprimer'}
						</button>
					{/if}
					<button class="action-btn cancel" onclick={() => selectedMsg = null}>{ui.no}</button>
				</div>
				<div class="action-row">
					<button class="action-btn listen" onclick={() => speakSelected('fr')}>🔊🇫🇷</button>
					<button class="action-btn listen" onclick={() => speakSelected('en')}>🔊🇬🇧</button>
					<button class="action-btn listen" onclick={() => speakSelected('kh')}>🔊🇰🇭</button>
				</div>
			</div>
		{/if}

		<!-- ── Toast copie ── -->
		{#if copyToast}
			<div class="copy-toast">{userLang === 'kh' ? '✓ បានចម្លង' : '✓ Copié !'}</div>
		{/if}

		<!-- ── Toast erreur ── -->
		{#if errorToast}
			<div class="error-toast">{errorToast}</div>
		{/if}

		<!-- ── Suggestion Gemini ── -->
		{#if suggestionLoading}
			<div class="suggestion suggestion-loading">
				<span class="suggestion-dots">{ui.thinking}</span>
			</div>
		{:else if suggestion}
			<div class="suggestion">
				<p class="suggestion-question">{suggestion.question}</p>
				<p class="suggestion-corrected">"{suggestion.corrected}"</p>
				{#if suggestion.fr}<p class="suggestion-translation"><span class="transl-flag">🇫🇷</span>{suggestion.fr}</p>{/if}
				{#if suggestion.en}<p class="suggestion-translation"><span class="transl-flag">🇬🇧</span>{suggestion.en}</p>{/if}
				{#if suggestion.kh}<p class="suggestion-translation"><span class="transl-flag">🇰🇭</span>{suggestion.kh}</p>{/if}
				{#if suggestion.lessons?.length}
					{#each suggestion.lessons as l}
						<p class="suggestion-lesson"><s>{l.original}</s> → <strong>{l.corrected}</strong> — {l.explanation}</p>
					{/each}
				{/if}
				<div class="suggestion-actions">
					<button class="suggestion-btn accept" onclick={acceptSuggestion}>{ui.yes}</button>
					<button class="suggestion-btn dismiss" onclick={dismissSuggestion}>{ui.no}</button>
				</div>
			</div>
		{/if}

		<!-- ── Panel leçons ── -->
		{#if showLessons}
			<div class="lessons-overlay" onclick={() => showLessons = false} role="button" tabindex="-1" aria-label="Fermer">
				<div class="lessons-panel" onclick={(e) => e.stopPropagation()} role="dialog">
					<div class="lessons-header">
						<span class="lessons-title">📖 {ui.lessonsTitle}</span>
						<button class="lessons-close" onclick={() => showLessons = false}>✕</button>
					</div>
					<div class="lessons-body">
						{#if lessonsLoading}
							<div class="lessons-loading"><span class="loading-spinner"></span></div>
						{:else if lessons.length === 0}
							<p class="lessons-empty">{ui.lessonsEmpty}</p>
						{:else}
							{#each lessons as l (l.id)}
								{@const lFlag = l.lang === 'fr' ? '🇫🇷' : l.lang === 'en' ? '🇬🇧' : '🇰🇭'}
								<div class="lesson-card">
									<div class="lesson-meta">
										<span class="lesson-author">{l.author}</span>
										<span class="lesson-flag">{lFlag}</span>
										<span class="lesson-date">{new Date(l.ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
									</div>
									<p class="lesson-original"><s>{l.original}</s> → {l.corrected}</p>
									<p class="lesson-text">📖 {l.lesson}</p>
								</div>
							{/each}
						{/if}
					</div>
				</div>
			</div>
		{/if}

		<!-- ── Zone de saisie ── -->
		<input
			bind:this={imageInput}
			type="file"
			accept="image/*"
			class="image-input-hidden"
			onchange={onImageSelected}
		/>
		<div class="input-bar">
			<button
				class="img-btn"
				onclick={pickAndSendImage}
				disabled={sending || recording || transcribing}
				aria-label="Envoyer une image"
			>📷</button>
			<button
				class="mic-btn"
				class:loading={vadLoading}
				class:recording={recording && !speaking}
				class:speaking
				class:transcribing
				onclick={toggleRecording}
				disabled={sending || transcribing}
				aria-label={vadLoading ? 'Chargement…' : recording ? 'Arrêter' : 'Message vocal'}
			>{transcribing ? '…' : speaking ? '🔊' : vadLoading ? '⏳' : recording ? '⏹' : '🎤'}</button>
			<textarea
				class="input"
				bind:value={inputText}
				oninput={onInput}
				onkeydown={onKeydown}
				placeholder={ui.placeholder}
				rows="1"
				disabled={sending}
			></textarea>
			<button
				class="send-btn"
				onclick={send}
				disabled={!inputText.trim() || sending}
				aria-label="Envoyer"
			>
				{sending ? '…' : '➤'}
			</button>
		</div>
	{/if}

</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
		background:
			radial-gradient(ellipse 80% 30% at 50% 0%, color-mix(in srgb, var(--accent) 6%, transparent) 0%, transparent 70%);
	}

	/* ── Offline banner ── */
	.offline-banner {
		background: color-mix(in srgb, #e65100 15%, var(--card));
		border-bottom: 1px solid color-mix(in srgb, #e65100 40%, transparent);
		color: #e65100;
		font-size: var(--fs-sm);
		font-weight: 600;
		text-align: center;
		padding: var(--space-1) var(--space-4);
		flex-shrink: 0;
	}

	/* ── Date nav ── */
	.date-nav {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-4);
		flex-shrink: 0;
		border-bottom: 1px solid var(--border);
	}

	.date-label {
		font-size: var(--fs-sm);
		color: var(--muted);
		font-weight: 500;
		min-width: 8rem;
		text-align: center;
		text-transform: capitalize;
	}

	.date-btn {
		width: 2rem;
		height: 2rem;
		border-radius: var(--radius-full);
		background: color-mix(in srgb, var(--accent) 10%, var(--card));
		border: 1px solid var(--border);
		font-size: 1.1rem;
		color: var(--text);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: opacity 0.15s;
	}

	.date-btn:disabled {
		opacity: 0.25;
	}

	/* ── Auth gate ── */
	.auth-gate {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-4);
		padding: var(--space-6);
	}

	.auth-msg {
		font-size: var(--fs-lg);
		color: var(--muted);
		text-align: center;
	}

	.sign-in-btn {
		background: var(--accent);
		color: var(--on-accent);
		border-radius: var(--radius-xl);
		padding: var(--space-3) var(--space-6);
		font-size: var(--fs-base);
		font-weight: 600;
	}

	/* ── Messages ── */
	.message-list {
		flex: 1;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
		padding: var(--space-4) var(--space-4) var(--space-2);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		color: var(--muted);
		padding-top: 20vh;
	}

	.empty-icon { font-size: 3rem; }

	.loading-spinner {
		display: block;
		width: 2rem;
		height: 2rem;
		border: 3px solid color-mix(in srgb, var(--accent) 20%, transparent);
		border-top-color: var(--accent);
		border-radius: var(--radius-full);
		animation: spin-slow 0.8s linear infinite;
	}

	.empty-sub {
		font-size: var(--fs-sm);
		opacity: 0.6;
	}

	.bubble-row {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		max-width: 80%;
	}

	.bubble-row.mine {
		align-self: flex-end;
		align-items: flex-end;
	}

	.author-label {
		font-size: var(--fs-xs);
		color: var(--muted);
		padding-left: var(--space-2);
	}

	.bubble {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: var(--radius-2xl);
		border-bottom-left-radius: var(--radius-sm);
		padding: var(--space-3) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		position: relative;
	}

	.source-badge {
		position: absolute;
		top: -0.45rem;
		right: -0.45rem;
		font-size: 0.7rem;
		line-height: 1;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		width: 1.25rem;
		height: 1.25rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.bubble.mine {
		background: color-mix(in srgb, var(--accent) 15%, var(--card));
		border-color: color-mix(in srgb, var(--accent) 30%, transparent);
		border-bottom-left-radius: var(--radius-2xl);
		border-bottom-right-radius: var(--radius-sm);
	}

	.bubble-text {
		font-size: var(--fs-base);
		color: var(--text);
		white-space: pre-wrap;
		word-break: break-word;
	}

	.bubble-translations {
		border-top: 1px solid var(--border);
		padding-top: var(--space-1);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.bubble-translation {
		font-size: var(--fs-sm);
		color: var(--muted);
		font-style: italic;
		display: flex;
		align-items: baseline;
		gap: var(--space-1);
	}

	.transl-flag {
		font-style: normal;
		flex-shrink: 0;
	}

	.bubble-time {
		font-size: var(--fs-xs);
		color: var(--muted);
		opacity: 0.6;
		align-self: flex-end;
	}

	/* ── Suggestion Gemini ── */
	.suggestion {
		margin: 0 var(--space-4) var(--space-2);
		background: color-mix(in srgb, var(--accent) 8%, var(--card));
		border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
		border-radius: var(--radius-xl);
		padding: var(--space-3) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.suggestion-loading {
		color: var(--muted);
		font-size: var(--fs-sm);
	}

	.suggestion-dots {
		font-size: var(--fs-sm);
		color: var(--muted);
	}

	.suggestion-question {
		font-size: var(--fs-sm);
		font-weight: 600;
		color: var(--accent);
	}

	.suggestion-corrected {
		font-size: var(--fs-base);
		color: var(--text);
	}

	.suggestion-translation {
		font-size: var(--fs-sm);
		color: var(--muted);
		font-style: italic;
	}

	.suggestion-actions {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-1);
	}

	.suggestion-btn {
		font-size: var(--fs-sm);
		font-weight: 700;
		border-radius: var(--radius-lg);
		padding: var(--space-1) var(--space-3);
	}

	.suggestion-btn.accept {
		background: var(--accent);
		color: var(--on-accent);
	}

	.suggestion-btn.dismiss {
		background: color-mix(in srgb, var(--muted) 15%, transparent);
		color: var(--muted);
	}

	.suggestion-lesson {
		font-size: var(--fs-sm);
		color: var(--muted);
		background: color-mix(in srgb, var(--accent) 6%, var(--bg));
		border-left: 2px solid var(--accent);
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
		padding: var(--space-1) var(--space-3);
		margin-top: var(--space-1);
		line-height: 1.5;
	}

	/* ── Input ── */
	.input-bar {
		display: flex;
		align-items: flex-end;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
		background: var(--card);
		border-top: 1px solid var(--border);
		flex-shrink: 0;
	}

	.input {
		flex: 1;
		background: color-mix(in srgb, var(--accent) 6%, var(--bg));
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		padding: var(--space-3) var(--space-4);
		font-size: var(--fs-base);
		color: var(--text);
		font-family: inherit;
		resize: none;
		max-height: 8rem;
		overflow-y: auto;
		line-height: 1.4;
	}

	.input::placeholder { color: var(--muted); opacity: 0.6; }

	.input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.send-btn {
		width: 2.75rem;
		height: 2.75rem;
		border-radius: var(--radius-full);
		background: var(--accent);
		color: var(--on-accent);
		font-size: var(--fs-lg);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: opacity 0.15s;
	}

	.send-btn:disabled {
		opacity: 0.35;
	}

	/* ── Actions (copier / supprimer) ── */
	.bubble-row {
		cursor: pointer;
	}

	.bubble-row.selected > .bubble {
		outline: 2px solid color-mix(in srgb, var(--accent) 50%, transparent);
		outline-offset: 2px;
	}

	.action-bar {
		margin: 0 var(--space-4) var(--space-2);
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		padding: var(--space-2) var(--space-3);
		animation: slide-up 0.15s ease;
	}

	.action-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.action-row + .action-row {
		margin-top: var(--space-2);
		padding-top: var(--space-2);
		border-top: 1px solid var(--border);
	}

	@keyframes slide-up {
		from { opacity: 0; transform: translateY(6px); }
		to   { opacity: 1; transform: translateY(0); }
	}

	.action-btn {
		font-size: var(--fs-sm);
		font-weight: 600;
		border-radius: var(--radius-lg);
		padding: var(--space-1) var(--space-3);
		flex-shrink: 0;
	}

	.action-btn.copy {
		background: color-mix(in srgb, var(--accent) 15%, var(--card));
		color: var(--accent);
		border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
		flex: 1;
	}

	.action-btn.delete {
		background: color-mix(in srgb, #e53935 12%, var(--card));
		color: #e53935;
		border: 1px solid color-mix(in srgb, #e53935 30%, transparent);
		flex: 1;
	}

	.action-btn.cancel {
		background: color-mix(in srgb, var(--muted) 12%, transparent);
		color: var(--muted);
	}

	.action-btn.listen {
		background: color-mix(in srgb, #42a5f5 12%, var(--card));
		color: #42a5f5;
		border: 1px solid color-mix(in srgb, #42a5f5 30%, transparent);
		flex: 1;
		font-size: 1rem;
	}

	/* ── Toast copie ── */
	.copy-toast {
		position: fixed;
		bottom: 6rem;
		left: 50%;
		transform: translateX(-50%);
		background: color-mix(in srgb, var(--accent) 90%, transparent);
		color: var(--on-accent);
		font-size: var(--fs-sm);
		font-weight: 600;
		padding: var(--space-2) var(--space-5);
		border-radius: var(--radius-full);
		pointer-events: none;
		animation: fade-toast 2s ease forwards;
	}

	@keyframes fade-toast {
		0%   { opacity: 0; transform: translateX(-50%) translateY(4px); }
		15%  { opacity: 1; transform: translateX(-50%) translateY(0); }
		75%  { opacity: 1; }
		100% { opacity: 0; }
	}

	/* ── Toast erreur ── */
	.error-toast {
		position: fixed;
		bottom: 6rem;
		left: 50%;
		transform: translateX(-50%);
		background: color-mix(in srgb, #e53935 90%, transparent);
		color: #fff;
		font-size: var(--fs-sm);
		font-weight: 600;
		padding: var(--space-2) var(--space-5);
		border-radius: var(--radius-full);
		pointer-events: none;
		animation: fade-toast 3s ease forwards;
		white-space: nowrap;
	}

	/* ── Image ── */
	.image-input-hidden {
		display: none;
	}

	.img-btn {
		width: 2.75rem;
		height: 2.75rem;
		border-radius: var(--radius-full);
		background: color-mix(in srgb, var(--accent) 12%, var(--card));
		border: 1px solid var(--border);
		font-size: 1.2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: opacity 0.15s;
	}

	.img-btn:disabled {
		opacity: 0.35;
	}

	.mic-btn {
		width: 2.75rem;
		height: 2.75rem;
		border-radius: var(--radius-full);
		background: color-mix(in srgb, var(--accent) 12%, var(--card));
		border: 1px solid var(--border);
		font-size: 1.2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: background 0.15s, opacity 0.15s;
	}

	.mic-btn.loading {
		opacity: 0.6;
		animation: spin-slow 1.5s linear infinite;
	}

	.mic-btn.recording {
		background: #e53935;
		color: #fff;
		border-color: #e53935;
		animation: pulse-rec 1.2s ease-in-out infinite;
	}

	.mic-btn.speaking {
		background: #2e7d32;
		color: #fff;
		border-color: #2e7d32;
		animation: pulse-speak 0.6s ease-in-out infinite;
	}

	.mic-btn.transcribing {
		opacity: 0.5;
	}

	.mic-btn:disabled {
		opacity: 0.35;
	}

	@keyframes spin-slow {
		from { transform: rotate(0deg); }
		to   { transform: rotate(360deg); }
	}

	@keyframes pulse-rec {
		0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, #e53935 40%, transparent); }
		50% { box-shadow: 0 0 0 6px color-mix(in srgb, #e53935 0%, transparent); }
	}

	@keyframes pulse-speak {
		0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, #2e7d32 50%, transparent); }
		50% { box-shadow: 0 0 0 8px color-mix(in srgb, #2e7d32 0%, transparent); }
	}

	.bubble-img {
		max-width: 100%;
		max-height: 320px;
		border-radius: var(--radius-xl);
		object-fit: cover;
		display: block;
	}

	.bubble-img-loading {
		width: 200px;
		height: 140px;
		background: color-mix(in srgb, var(--muted) 10%, transparent);
		border-radius: var(--radius-xl);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--muted);
		font-size: var(--fs-sm);
	}

	/* ── Bouton leçons ── */
	.lessons-btn {
		width: 2rem;
		height: 2rem;
		border-radius: var(--radius-full);
		background: color-mix(in srgb, var(--accent) 10%, var(--card));
		border: 1px solid var(--border);
		font-size: 0.95rem;
		color: var(--text);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-left: auto;
	}

	/* ── Panel leçons ── */
	.lessons-overlay {
		position: fixed;
		inset: 0;
		background: color-mix(in srgb, #000 50%, transparent);
		z-index: 50;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		animation: fade-in 0.15s ease;
	}

	@keyframes fade-in {
		from { opacity: 0; }
		to   { opacity: 1; }
	}

	.lessons-panel {
		width: 100%;
		max-width: 640px;
		max-height: 80vh;
		background: var(--card);
		border-radius: var(--radius-2xl) var(--radius-2xl) 0 0;
		display: flex;
		flex-direction: column;
		animation: slide-up 0.2s ease;
		overflow: hidden;
	}

	.lessons-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4) var(--space-5);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.lessons-title {
		font-size: var(--fs-base);
		font-weight: 700;
		color: var(--text);
	}

	.lessons-close {
		width: 2rem;
		height: 2rem;
		border-radius: var(--radius-full);
		background: color-mix(in srgb, var(--muted) 12%, transparent);
		color: var(--muted);
		font-size: var(--fs-sm);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.lessons-body {
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
		padding: var(--space-4) var(--space-5);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.lessons-loading {
		display: flex;
		justify-content: center;
		padding: var(--space-6) 0;
	}

	.lessons-empty {
		text-align: center;
		color: var(--muted);
		font-size: var(--fs-sm);
		padding: var(--space-6) 0;
	}

	.lesson-card {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		padding: var(--space-3) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.lesson-meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.lesson-author {
		font-size: var(--fs-xs);
		font-weight: 600;
		color: var(--accent);
	}

	.lesson-flag {
		font-size: var(--fs-xs);
	}

	.lesson-date {
		font-size: var(--fs-xs);
		color: var(--muted);
		margin-left: auto;
	}

	.lesson-original {
		font-size: var(--fs-sm);
		color: var(--text);
	}

	.lesson-text {
		font-size: var(--fs-sm);
		color: var(--muted);
		background: color-mix(in srgb, var(--accent) 6%, var(--bg));
		border-left: 2px solid var(--accent);
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
		padding: var(--space-1) var(--space-3);
		line-height: 1.5;
	}
</style>
