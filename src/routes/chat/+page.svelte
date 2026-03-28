<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { auth, userStore, authReadyStore } from '$lib/auth';
	import {
		fetchMessages, sendMessage, suggestMessage, deleteMessage, transcribeAudio,
		signUpload, uploadFile, signDownload, invalidateListCache,
		fetchLessons, type ChatMessage, type GeminiSuggestion, type LessonEntry, type LessonItem
	} from '$lib/api';
	import FlashcardGame from '$lib/FlashcardGame.svelte';
	import { getLevel, getAvatar, xpProgressPct } from '$lib/flashcard-levels';

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
	let showFlashcards = $state(false);
	let chatXp = $state(0);
	let lessons = $state<LessonEntry[]>([]);
	let lessonsLoading = $state(false);
	let pendingLessons = $state<LessonItem[]>([]);

	const user = userStore;
	const authReady = authReadyStore;

	// Action Svelte : rend le bouton Google natif (fiable, pas soumis aux suppressions FedCM)
	function googleSignInBtn(node: HTMLElement) {
		auth.renderSignInButton(node);
	}

	// Vérifie si un prénom correspond à Chet (Chet, Chetana, Chétana, etc.)
	function isChet(name: string): boolean {
		const n = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
		return n === 'chet' || n === 'chetana';
	}
	// $user est réactif (store Svelte 4), contrairement à auth.getFirstName() qui utilise get()
	const firstName = $derived($user?.name.split(' ')[0] ?? '');
	// Détermine la langue de l'utilisateur connecté : Chet → fr, tout autre → kh par défaut
	const userLang = $derived<'fr' | 'kh'>(isChet(firstName) ? 'fr' : 'kh');
	const chatLevel  = $derived(getLevel(chatXp));
	const chatAvatar = $derived(getAvatar(chatXp, userLang));
	const chatLvlPct = $derived(xpProgressPct(chatXp));

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
			void loadChatXp();
		} else if (!$user) {
			chatInitialized = false;
		}
	});

	async function loadChatXp() {
		const token = await auth.getToken();
		if (!token) return;
		try {
			const res = await fetch('/api/flashcards/progress', { headers: { Authorization: `Bearer ${token}` } });
			if (res.ok) { const p = await res.json(); chatXp = p.xp ?? 0; }
		} catch { /* silencieux */ }
	}

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
		pendingLessons = [];
		clearTimeout(debounceTimer);
		const text = inputText.trim();
		if (text.length < 10 || text === lastSuggestedText) return;
		// Attend la fin d'un mot (dernier char = espace) ou une vraie pause
		const endsWord = text.endsWith(' ');
		debounceTimer = setTimeout(async () => {
			// Re-vérif : si le texte a changé pendant le délai, on annule
			if (inputText.trim() !== text) return;
			suggestionLoading = true;
			try {
				suggestion = await suggestMessage(text);
				lastSuggestedText = text;
			} catch {
				suggestion = null;
			} finally {
				suggestionLoading = false;
			}
		}, endsWord ? 1800 : 2500);
	}

	function acceptSuggestion() {
		if (!suggestion) return;
		inputText = suggestion.corrected;
		pendingLessons = suggestion.lessons ?? [];
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

	async function selectMsg(id: string) {
		selectedMsg = selectedMsg === id ? null : id;
		if (selectedMsg) {
			await tick();
			scrollToBottom();
		}
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
			// Langue partenaire : FR↔KH uniquement (pas d'anglais dans le copier)
			if (aLang === 'kh') {
				if (msg.fr) parts.push('🇫🇷 ' + msg.fr);
			} else {
				if (msg.kh) parts.push('🇰🇭 ' + msg.kh);
			}
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
			...(suggestion?.lessons?.length ? { lessons: suggestion.lessons } : pendingLessons.length ? { lessons: pendingLessons } : {}),
		};
		sending = true;
		suggestion = null;
		pendingLessons = [];
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

	// Période Nouvel An Khmer (1–20 avril)
	const isKhmerNewYear = $derived(() => {
		const m = today.getMonth(); // 0-indexed
		const d = today.getDate();
		return m === 3 && d >= 1 && d <= 20;
	});

	// ── Emoji picker ──────────────────────────────────────────────────────
	let showEmojis = $state(false);
	const EMOJIS = [
		'❤️','🩷','💕','💞','💓','💗','💖','💝','🥰','😍',
		'😘','🥺','😊','🤗','😂','😅','😭','🥹','😌','🙏',
		'✨','🌸','🌺','🌷','🌹','💐','🌙','⭐','☀️','🎉',
		'👍','🙌','💪','🤍','🕊️','🦋','🐱','🐶','🐰','🍀',
	];

	function insertEmoji(emoji: string) {
		inputText += emoji;
		onInput();
	}
</script>

<svelte:head>
	<title>Chet & Lys · Chat</title>
</svelte:head>

<div class="page">

	{#if !$authReady}
		<div class="auth-gate auth-loading">
			<span class="auth-lotus">🪷</span>
			<div class="auth-spinner"></div>
		</div>
	{:else if !$user}
		<div class="auth-gate">
			<span class="auth-lotus">🪷</span>
			{#if isKhmerNewYear()}
				<p class="auth-festival">សួស្តីឆ្នាំថ្មី ✨</p>
			{/if}
			<p class="auth-msg">{ui.authMsg}</p>
			<div use:googleSignInBtn></div>
		</div>
	{:else}
		<!-- ── Bannière offline ── -->
		{#if !isOnline}
			<div class="offline-banner">📡 {userLang === 'kh' ? 'គ្មានការតភ្ជាប់' : 'Hors ligne'}</div>
		{/if}

		<!-- ── Header ── -->
		<header class="chat-header">
			<button class="avatar-btn" onclick={() => auth.signOut()} title="Déconnexion">
				{#if $user?.picture}
					<img src={$user.picture} alt={$user.name} class="header-avatar" />
				{:else}
					<span class="avatar-placeholder">👤</span>
				{/if}
			</button>
			<div class="date-center">
				<button class="date-btn" onclick={prevDay} aria-label="Jour précédent">‹</button>
				<span class="date-label">{dayLabelStr}</span>
				<button class="date-btn" onclick={nextDay} disabled={isToday} aria-label="Jour suivant">›</button>
			</div>
			<button class="fc-badge-btn" onclick={() => showFlashcards = true} aria-label="Flashcards" title="Flashcards · Nv.{chatLevel.level}">
				<div class="fc-badge-icon-wrap">
					<span class="fc-badge-icon">🎴</span>
					<span class="fc-badge-lvl">{chatLevel.level}</span>
				</div>
				<span class="fc-badge-avatar">{chatAvatar}</span>
				<div class="fc-badge-bar" style="--pct:{chatLvlPct}%"></div>
			</button>
		</header>

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

			<!-- ── Actions (copier / supprimer / écouter) — inline dans la liste ── -->
			{#if selectedMsg}
				{@const selMsg = messages.find(m => m.id === selectedMsg)}
				<div class="action-bar">
					<button class="action-btn copy" onclick={copySelected}>
						{userLang === 'kh' ? '📋 ចម្លង' : '📋 Copier'}
					</button>
					<div class="action-row-icons">
						<button class="action-icon listen" onclick={() => speakSelected('fr')} aria-label="Écouter FR">🔊🇫🇷</button>
						<button class="action-icon listen" onclick={() => speakSelected('en')} aria-label="Écouter EN">🔊🇬🇧</button>
						<button class="action-icon listen" onclick={() => speakSelected('kh')} aria-label="Écouter KH">🔊🇰🇭</button>
						{#if selMsg?.author === firstName}
							<span class="action-sep"></span>
							<button class="action-icon delete" onclick={deleteSelected} aria-label="Supprimer">🗑</button>
						{/if}
						<span class="action-sep"></span>
						<button class="action-icon close" onclick={() => selectedMsg = null} aria-label="Fermer">✕</button>
					</div>
				</div>
			{/if}
		</div>

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

		<!-- ── Flashcards ── -->
		{#if showFlashcards}
			<FlashcardGame {userLang} userName={firstName} onClose={() => { showFlashcards = false; void loadChatXp(); }} />
		{/if}

		<!-- ── Zone de saisie ── -->
		<input
			bind:this={imageInput}
			type="file"
			accept="image/*"
			class="image-input-hidden"
			onchange={onImageSelected}
		/>
		<!-- ── Emoji panel ── -->
		{#if showEmojis}
			<div class="emoji-bar">
				{#each EMOJIS as e}
					<button class="emoji-btn" onclick={() => insertEmoji(e)}>{e}</button>
				{/each}
			</div>
		{/if}
		<div class="input-bar">
			<button
				class="emoji-toggle"
				class:active={showEmojis}
				onclick={() => showEmojis = !showEmojis}
				aria-label="Emojis"
			>😊</button>
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
			radial-gradient(ellipse 80% 30% at 50% 0%, color-mix(in srgb, var(--accent) 8%, transparent) 0%, transparent 70%);
		position: relative;
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

	/* ── Chat header (glassmorphism) ── */
	.chat-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.45rem var(--space-4);
		flex-shrink: 0;
		position: relative;
		z-index: 2;
		backdrop-filter: blur(20px) saturate(1.4);
		-webkit-backdrop-filter: blur(20px) saturate(1.4);
		background:
			linear-gradient(180deg,
				color-mix(in srgb, var(--accent) 8%, var(--bg)) 0%,
				transparent 100%),
			color-mix(in srgb, var(--card) 70%, transparent);
		border-bottom: 1px solid color-mix(in srgb, var(--accent) 18%, transparent);
		box-shadow: 0 1px 12px rgba(0, 0, 0, 0.12);
	}

	.avatar-btn {
		width: 2.1rem;
		height: 2.1rem;
		border-radius: var(--radius-full);
		overflow: hidden;
		padding: 0;
		border: 2px solid color-mix(in srgb, var(--accent) 40%, transparent);
		transition: transform 0.15s, border-color 0.2s;
		flex-shrink: 0;
	}

	.avatar-btn:hover {
		border-color: var(--accent);
		transform: scale(1.07);
	}

	.header-avatar {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.avatar-placeholder {
		font-size: 1rem;
		line-height: 2.1rem;
	}

	.date-center {
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 0.25rem;
		background: color-mix(in srgb, var(--accent) 10%, var(--card));
		border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent);
		border-radius: 2rem;
		padding: 0.2rem 0.35rem;
	}

	.date-label {
		font-size: var(--fs-sm);
		color: var(--accent);
		font-weight: 600;
		min-width: 8rem;
		text-align: center;
		text-transform: capitalize;
		letter-spacing: 0.3px;
	}

	.date-btn {
		width: 1.9rem;
		height: 1.9rem;
		border-radius: var(--radius-full);
		background: color-mix(in srgb, var(--accent) 8%, var(--card));
		border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
		font-size: 1rem;
		color: var(--accent);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: opacity 0.15s, transform 0.12s, background 0.15s;
	}

	.date-btn:not(:disabled):hover {
		background: color-mix(in srgb, var(--accent) 16%, var(--card));
	}

	.date-btn:not(:disabled):active {
		transform: scale(0.9);
	}

	.date-btn:disabled {
		opacity: 0.35;
		color: var(--muted);
		background: transparent;
		border-color: transparent;
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
		position: relative;
		z-index: 1;
	}

	.auth-lotus {
		font-size: 4rem;
		animation: lotus-breathe 3s ease-in-out infinite;
		filter: drop-shadow(0 0 20px color-mix(in srgb, var(--accent) 30%, transparent));
	}

	@keyframes lotus-breathe {
		0%, 100% { transform: scale(1); opacity: 0.9; }
		50% { transform: scale(1.08); opacity: 1; }
	}

	.auth-festival {
		font-size: var(--fs-xl);
		color: var(--accent);
		font-weight: 600;
		letter-spacing: 0.5px;
	}

	.auth-msg {
		font-size: var(--fs-lg);
		color: var(--muted);
		text-align: center;
	}

	.auth-spinner {
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		border: 2px solid color-mix(in srgb, var(--accent) 20%, transparent);
		border-top-color: var(--accent);
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }

	/* ── Messages ── */
	.message-list {
		flex: 1;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
		padding: var(--space-4) var(--space-4) var(--space-2);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		position: relative;
		z-index: 1;
	}

	.message-list::-webkit-scrollbar { width: 4px; }
	.message-list::-webkit-scrollbar-track { background: transparent; }
	.message-list::-webkit-scrollbar-thumb {
		background: color-mix(in srgb, var(--accent) 30%, transparent);
		border-radius: 2px;
	}
	.message-list::-webkit-scrollbar-thumb:hover {
		background: color-mix(in srgb, var(--accent) 50%, transparent);
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
		animation: msg-in-left 0.32s cubic-bezier(0.34, 1.4, 0.64, 1);
	}

	@keyframes msg-in-left {
		from { opacity: 0; transform: translateX(-14px) translateY(8px) scale(0.97); }
		to   { opacity: 1; transform: none; }
	}

	@keyframes msg-in-right {
		from { opacity: 0; transform: translateX(14px) translateY(8px) scale(0.97); }
		to   { opacity: 1; transform: none; }
	}

	.bubble-row.mine {
		animation: msg-in-right 0.32s cubic-bezier(0.34, 1.4, 0.64, 1);
		align-self: flex-end;
		align-items: flex-end;
	}

	.author-label {
		font-size: var(--fs-xs);
		color: var(--muted);
		padding-left: var(--space-2);
	}

	.bubble {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-2xl);
		border-bottom-left-radius: 4px;   /* queue bulle gauche */
		padding: var(--space-3) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		position: relative;
		box-shadow: 0 2px 8px rgba(0,0,0,0.22);
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
		background: color-mix(in srgb, var(--accent) 14%, var(--surface));
		border-color: color-mix(in srgb, var(--accent) 30%, transparent);
		border-bottom-left-radius: var(--radius-2xl);
		border-bottom-right-radius: 4px;   /* queue bulle droite */
		box-shadow:
			0 2px 12px color-mix(in srgb, var(--accent) 14%, transparent),
			0 0 0 1px color-mix(in srgb, var(--accent) 8%, transparent);
	}

	.bubble-text {
		font-size: var(--fs-md);   /* 14px — message original plus lisible */
		font-weight: 500;
		color: var(--text);
		line-height: 1.55;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.bubble-translations {
		margin-top: var(--space-2);
		padding-top: var(--space-2);
		border-top: 1px solid color-mix(in srgb, var(--accent) 12%, transparent);
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	/* Message original — toujours le premier enfant */
	.bubble-translation:first-child {
		font-size: var(--fs-md);   /* 14px — bien lisible */
		font-weight: 500;
		color: var(--text);
		font-style: normal;
		line-height: 1.55;
		padding-bottom: var(--space-2);
		border-bottom: 1px solid color-mix(in srgb, var(--accent) 12%, transparent);
		margin-bottom: 2px;
		display: flex;
		align-items: baseline;
		gap: var(--space-1);
	}

	/* Traductions — discrètes */
	.bubble-translation {
		font-size: var(--fs-xs);   /* 11px */
		color: var(--muted);
		font-style: italic;
		line-height: 1.4;
		display: flex;
		align-items: baseline;
		gap: var(--space-1);
	}

	.transl-flag {
		font-style: normal;
		flex-shrink: 0;
		font-size: 0.75em;
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
		background: color-mix(in srgb, var(--accent) 6%, var(--card));
		border: none;
		border-left: 3px solid var(--accent);
		border-radius: 0 var(--radius-xl) var(--radius-xl) 0;
		padding: var(--space-3) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		box-shadow:
			0 2px 12px color-mix(in srgb, var(--accent) 10%, transparent),
			0 0 0 1px color-mix(in srgb, var(--accent) 8%, transparent);
		position: relative;
		z-index: 1;
		animation: suggest-in 0.3s cubic-bezier(0.34, 1.4, 0.64, 1);
	}

	@keyframes suggest-in {
		from { opacity: 0; transform: translateY(10px) scale(0.97); }
		to   { opacity: 1; transform: none; }
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
		border-radius: var(--radius-full);
		padding: var(--space-1) var(--space-4);
		transition: transform 0.1s;
	}

	.suggestion-btn:active {
		transform: scale(0.95);
	}

	.suggestion-btn.accept {
		background: linear-gradient(135deg, var(--accent), var(--accent-warm));
		color: var(--on-accent);
		box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 25%, transparent);
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

	/* ── Emoji bar ── */
	.emoji-bar {
		display: grid;
		grid-template-rows: 1fr 1fr;
		grid-auto-flow: column;
		overflow-x: auto;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3);
		background: color-mix(in srgb, var(--card) 90%, transparent);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border-top: 1px solid color-mix(in srgb, var(--accent) 10%, transparent);
		flex-shrink: 0;
		scrollbar-width: none;
	}

	.emoji-bar::-webkit-scrollbar { display: none; }

	.emoji-btn {
		font-size: 1.5rem;
		line-height: 1;
		width: 2.5rem;
		height: 2.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-sm);
		transition: transform 0.12s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.15s;
	}

	.emoji-btn:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }
	.emoji-btn:active { transform: scale(0.82); }

	.emoji-toggle {
		width: 2.75rem;
		height: 2.75rem;
		border-radius: var(--radius-full);
		background: color-mix(in srgb, var(--accent) 8%, var(--card));
		border: 1px solid var(--border);
		font-size: var(--fs-xl);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: opacity 0.15s, transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s, box-shadow 0.2s;
	}

	.emoji-toggle:hover {
		background: color-mix(in srgb, var(--accent) 15%, var(--card));
		border-color: color-mix(in srgb, var(--accent) 35%, transparent);
		box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 18%, transparent);
	}
	.emoji-toggle:active { transform: scale(0.9); }
	.emoji-toggle.active {
		background: color-mix(in srgb, var(--accent) 20%, var(--card));
		border-color: color-mix(in srgb, var(--accent) 50%, transparent);
		box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 22%, transparent);
	}

	/* ── Input ── */
	.input-bar {
		display: flex;
		align-items: flex-end;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
		background: color-mix(in srgb, var(--card) 85%, transparent);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border-top: 1px solid color-mix(in srgb, var(--accent) 12%, transparent);
		flex-shrink: 0;
		position: relative;
		z-index: 1;
	}

	.input {
		flex: 1;
		background: color-mix(in srgb, var(--accent) 6%, var(--raised));
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		padding: var(--space-3) var(--space-4);
		font-size: 1rem;  /* 16px min — évite le zoom auto iOS */
		color: var(--text);
		font-family: inherit;
		resize: none;
		min-height: 2.5rem;
		max-height: 8rem;
		overflow-y: auto;
		line-height: 1.5;
	}

	.input::placeholder { color: var(--muted); opacity: 0.6; }

	.input:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent);
		transition: border-color 0.2s, box-shadow 0.2s;
	}

	.send-btn {
		width: 2.75rem;   /* légèrement plus grand que les autres */
		height: 2.75rem;
		border-radius: var(--radius-full);
		background: linear-gradient(135deg, var(--accent), var(--accent-warm));
		color: var(--on-accent);
		font-size: var(--fs-lg);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: opacity 0.15s, transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s;
		box-shadow:
			0 4px 16px color-mix(in srgb, var(--accent) 35%, transparent),
			0 1px 4px color-mix(in srgb, var(--accent) 20%, transparent);
	}

	.send-btn:not(:disabled):hover {
		transform: scale(1.07);
		box-shadow:
			0 6px 24px color-mix(in srgb, var(--accent) 50%, transparent),
			0 2px 8px color-mix(in srgb, var(--accent) 25%, transparent);
	}

	.send-btn:not(:disabled):active {
		transform: scale(0.89);
		box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 20%, transparent);
	}

	.send-btn:disabled {
		opacity: 0.35;
		box-shadow: none;
	}

	/* ── Actions (copier / supprimer / écouter) ── */
	.bubble-row {
		cursor: pointer;
	}

	.bubble-row.selected > .bubble {
		outline: 2px solid color-mix(in srgb, var(--accent) 50%, transparent);
		outline-offset: 2px;
	}

	.action-bar {
		background: color-mix(in srgb, var(--card) 95%, transparent);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		padding: var(--space-2) var(--space-3);
		animation: slide-up 0.2s ease;
		position: sticky;
		bottom: 0;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	@keyframes slide-up {
		from { opacity: 0; transform: translateY(6px); }
		to   { opacity: 1; transform: translateY(0); }
	}

	/* Ligne 1 : Copier pleine largeur */
	.action-btn.copy {
		width: 100%;
		font-size: var(--fs-sm);
		font-weight: 600;
		border-radius: var(--radius-full);
		padding: var(--space-2) var(--space-4);
		background: color-mix(in srgb, var(--accent) 15%, var(--card));
		color: var(--accent);
		border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
		transition: transform 0.1s;
	}

	.action-btn.copy:active {
		transform: scale(0.97);
	}

	/* Ligne 2 : icônes compactes */
	.action-row-icons {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
	}

	.action-sep {
		width: 1px;
		height: 1.2rem;
		background: var(--border);
		flex-shrink: 0;
	}

	.action-icon {
		width: 2.25rem;
		height: 2.25rem;
		border-radius: var(--radius-full);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.95rem;
		flex-shrink: 0;
		transition: transform 0.1s, background 0.15s;
	}

	.action-icon:active {
		transform: scale(0.9);
	}

	.action-icon.listen {
		background: color-mix(in srgb, #42a5f5 10%, var(--card));
		color: #42a5f5;
	}

	.action-icon.delete {
		background: color-mix(in srgb, #e53935 10%, var(--card));
		color: #e53935;
	}

	.action-icon.close {
		background: color-mix(in srgb, var(--muted) 10%, transparent);
		color: var(--muted);
		font-size: var(--fs-sm);
	}

	/* ── Toast copie ── */
	.copy-toast {
		position: fixed;
		bottom: 6rem;
		left: 50%;
		transform: translateX(-50%);
		background: linear-gradient(135deg, var(--accent), var(--accent-warm));
		color: var(--on-accent);
		font-size: var(--fs-sm);
		font-weight: 600;
		padding: var(--space-2) var(--space-5);
		border-radius: var(--radius-full);
		pointer-events: none;
		animation: fade-toast 2s ease forwards;
		box-shadow: 0 4px 16px color-mix(in srgb, var(--accent) 30%, transparent);
		z-index: 10;
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

	/* Style commun boutons action input (img + mic + emoji) */
	.img-btn,
	.mic-btn,
	.emoji-toggle {
		width: 2.625rem;    /* 42px — cohérent */
		height: 2.625rem;
		border-radius: var(--radius-full);
		background: var(--raised);
		border: 1px solid color-mix(in srgb, var(--accent) 18%, transparent);
		font-size: 1.15rem;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: opacity 0.15s, transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s, box-shadow 0.2s;
	}

	.img-btn {
		/* garde les props communes, surchargées ici si besoin */
	}

	.img-btn:not(:disabled):hover {
		background: color-mix(in srgb, var(--accent) 15%, var(--raised));
		border-color: color-mix(in srgb, var(--accent) 35%, transparent);
		box-shadow: 0 0 12px var(--accent-glow);
	}

	.img-btn:not(:disabled):active {
		transform: scale(0.9);
	}

	.img-btn:disabled {
		opacity: 0.35;
	}

	.mic-btn {
		/* styles d'état écrasent le background commun */
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

	/* ── Bouton flashcard niveau (game HUD) ── */
	.fc-badge-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1px;
		padding: 0.22rem 0.4rem 0.18rem;
		border-radius: 0.6rem;
		background:
			linear-gradient(135deg,
				color-mix(in srgb, var(--accent) 18%, var(--card)) 0%,
				color-mix(in srgb, var(--accent-warm, #D4956A) 12%, var(--card)) 100%);
		border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
		box-shadow:
			0 0 6px color-mix(in srgb, var(--accent) 20%, transparent),
			inset 0 1px 0 rgba(255,255,255,0.08);
		transition: transform 0.12s, box-shadow 0.2s;
		position: relative;
		overflow: visible;
	}
	.fc-badge-btn:hover {
		box-shadow: 0 0 14px color-mix(in srgb, var(--accent) 45%, transparent);
		transform: translateY(-1px);
	}
	.fc-badge-btn:active { transform: scale(0.92); }

	.fc-badge-icon-wrap {
		position: relative;
		perspective: 400px;
	}
	.fc-badge-icon {
		font-size: 1rem;
		display: block;
		animation: fc-card-flip 5s ease-in-out infinite;
	}
	@keyframes fc-card-flip {
		0%, 70%, 100% { transform: rotateY(0deg); }
		80%            { transform: rotateY(180deg); }
	}
	.fc-badge-lvl {
		position: absolute;
		top: -5px;
		right: -7px;
		background: var(--accent);
		color: #fff;
		font-size: 0.5rem;
		font-weight: 800;
		line-height: 1;
		padding: 1px 3px;
		border-radius: 999px;
		min-width: 13px;
		text-align: center;
		box-shadow: 0 0 4px color-mix(in srgb, var(--accent) 60%, transparent);
	}
	.fc-badge-avatar {
		font-size: 0.72rem;
		line-height: 1;
	}
	.fc-badge-bar {
		width: 100%;
		height: 2px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--accent) 20%, transparent);
		position: relative;
		overflow: hidden;
	}
	.fc-badge-bar::after {
		content: '';
		position: absolute;
		inset-block: 0;
		left: 0;
		width: var(--pct, 0%);
		border-radius: 999px;
		background: linear-gradient(90deg, var(--accent), var(--accent-warm, #D4956A));
		transition: width 0.6s ease;
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
