<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { auth, userStore, authReadyStore } from '$lib/auth';
	import {
		fetchMessages, sendMessage, suggestMessage, deleteMessage, transcribeAudio,
		signUpload, uploadFile, signDownload, invalidateListCache,
		fetchLessons, type ChatMessage, type GeminiSuggestion, type LessonEntry, type LessonItem
	} from '$lib/api';
	import { getAudioCache, setAudioCache } from '$lib/audioCache';
	import { getCachedMessages, getCachedXp, setCachedXp } from '$lib/localCache';
	import { createSWR } from '$lib/swr.svelte';
	import FlashcardGame from '$lib/FlashcardGame.svelte';
	import Flag from '$lib/Flag.svelte';
	import { getLevel, getAvatar, xpProgressPct } from '$lib/flashcard-levels';
	import ChatBubble from './components/ChatBubble.svelte';
	import ChatInput from './components/ChatInput.svelte';
	import SuggestionCard from './components/SuggestionCard.svelte';
	import ChatToast from './components/ChatToast.svelte';

	// ── Date du jour (pour GCS — envoi toujours vers aujourd'hui) ────────
	const today = new Date();
	const Y = String(today.getFullYear());
	const M = String(today.getMonth() + 1).padStart(2, '0');
	const D = String(today.getDate()).padStart(2, '0');

	// ── État ─────────────────────────────────────────────────────────────
	// --- SWR Hooks ---
	const swrMessages = createSWR(
		() => `chat_${vY}_${vM}_${vD}`,
		() => getCachedMessages(vY, vM, vD) as ChatMessage[] | null,
		() => fetchMessages(vY, vM, vD),
		[] as ChatMessage[]
	);

	const swrXp = createSWR(
		() => 'chat_xp',
		() => getCachedXp(),
		async () => {
			const res = await fetch('/api/flashcards/progress', { credentials: 'include' });
			if (res.ok) { const p = await res.json(); setCachedXp(p.xp ?? 0); return p.xp ?? 0; }
			return getCachedXp() ?? 0;
		},
		0
	);

	// --- Public State ---
	let messages = $derived.by(() => swrMessages.data);
	let chatXp = $derived.by(() => swrXp.data);
	let loadingMessages = $derived(swrMessages.loading && messages.length === 0);

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
	let showLessons = $state(false);
	let showFlashcards = $state(false);
	let speakingMsgId = $state<string | null>(null); // suivi du message en cours de lecture
	let audioCtx: AudioContext | null = null;
	let lessons = $state<LessonEntry[]>([]);
	let lessonsLoading = $state(false);
	let pendingLessons = $state<LessonItem[]>([]);

	const user = userStore;
	const authReady = authReadyStore;

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

	// --- Date Navigation ---
	function prevDay() { viewOffset--; }
	function nextDay() { if (!isToday) viewOffset++; }

	function scrollToBottom(behavior: ScrollBehavior = 'auto') {
		if (listEl) {
			listEl.scrollTo({ top: listEl.scrollHeight, behavior });
		}
	}

	// Auto-scroll when messages change or date changes
	$effect(() => {
		const msgCount = messages.length;
		const dateKey = `${vY}_${vM}_${vD}`;
		tick().then(() => {
			scrollToBottom('auto');
			// Re-scroll après un petit délai pour les images
			setTimeout(() => scrollToBottom('auto'), 50);
		});
	});

	// SSE — messages en temps réel pour aujourd'hui
	// Fallback polling 30s si la connexion SSE tombe
	$effect(() => {
		if (!$authReady || !$user || !isToday) return;

		let es: EventSource | null = null;
		let fallback: ReturnType<typeof setInterval> | null = null;
		let sseAlive = false;

		function startSSE() {
			es?.close();
			es = new EventSource(`/api/chat/stream?y=${vY}&m=${vM}&d=${vD}`);

			es.addEventListener('open', () => {
				sseAlive = true;
				if (fallback) { clearInterval(fallback); fallback = null; }
			});

			es.onmessage = (e) => {
				try {
					const data = JSON.parse(e.data);
					if (data.type === 'message') {
						const msg = data.message as ChatMessage;
						if (swrMessages.data?.some(m => m.id === msg.id)) return;
						// Si c'est notre propre message et qu'un temp est en attente, le remplacer
						const myTemp = msg.author === firstName
							? swrMessages.data?.find(m => m.id.startsWith('temp-') && m.author === firstName)
							: null;
						if (myTemp) {
							swrMessages.data = swrMessages.data!.map(m => m.id === myTemp.id ? msg : m);
						} else {
							swrMessages.data = [...(swrMessages.data ?? []), msg];
						}
					}
				} catch {}
			};

			es.onerror = () => {
				sseAlive = false;
				es?.close();
				// Fallback polling si SSE échoue (réseau instable, proxy, etc.)
				if (!fallback) {
					fallback = setInterval(() => { if (!sending) swrMessages.refresh(); }, 30_000);
				}
				// Tentative de reconnexion SSE après 5s
				setTimeout(startSSE, 5_000);
			};
		}

		startSSE();
		return () => {
			es?.close();
			if (fallback) clearInterval(fallback);
		};
	});

	onMount(() => {
		isOnline = navigator.onLine;
		window.addEventListener('online', () => { isOnline = true; });
		window.addEventListener('offline', () => { isOnline = false; });
	});
	onDestroy(() => { stopRecording(); });

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
				const lastMsg = messages.length > 0 ? messages[messages.length - 1].text : undefined;
				suggestion = await suggestMessage(text, lastMsg);
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
			swrMessages.data = [...swrMessages.data, msg];
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
	}

	async function deleteSelected() {
		if (!selectedMsg) return;
		const id = selectedMsg;
		selectedMsg = null;
		try {
			await deleteMessage(Y, M, D, id);
			swrMessages.data = swrMessages.data.filter(m => m.id !== id);
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

	// Web Audio API — déverrouillé une fois par geste utilisateur, fonctionne sur iOS Safari
	// après un await (contrairement à new Audio().play() qui perd le contexte de geste)
	function ensureAudioCtx() {
		if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
		if (audioCtx.state === 'suspended') audioCtx.resume();
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
		return new Promise((res, rej) => {
			const src = ctx.createBufferSource();
			src.buffer = buffer;
			src.connect(ctx.destination);
			src.onended = () => res();
			src.start(0);
		});
	}

	async function speakSelected(lang: 'fr' | 'en' | 'kh') {
		const msg = messages.find(m => m.id === selectedMsg);
		if (!msg) return;
		const textMap = { fr: msg.fr || msg.text, en: msg.en || msg.text, kh: msg.kh || msg.text };
		const text = textMap[lang];
		if (!text) { selectedMsg = null; return; }
		
		const currentId = msg.id;
		selectedMsg = null;

		// Cache hit → lecture instantanée
		const cached = getAudioCache(text, lang);
		if (cached) { await playBase64Pcm(cached).catch(() => {}); return; }

		// Déverrouille l'AudioContext iOS dans le contexte du geste utilisateur (avant le await)
		ensureAudioCtx();

		// Gemini TTS via serveur
		speakingMsgId = currentId;
		try {
			const res = await fetch('/api/chat/speak', {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text, lang }),
			});
			if (!res.ok) throw new Error('TTS failed');
			const { audio } = await res.json() as { audio: string };
			if (!audio) throw new Error('No audio');
			setAudioCache(text, lang, audio);
			await playBase64Pcm(audio).catch(() => {});
		} catch {
			// Fallback voix synthétique du navigateur (FR/EN seulement — pas de voix KH sur iOS)
			if (!('speechSynthesis' in window)) return;
			if (lang === 'kh') {
				showError(userLang === 'kh' ? '🔇 គ្មានសម្លេងខ្មែរនៅលើឧបករណ៍នេះ' : '🔇 Voix khmer indisponible sur cet appareil');
				return;
			}
			speechSynthesis.cancel();
			const utt = new SpeechSynthesisUtterance(text);
			utt.lang = { fr: 'fr-FR', en: 'en-US', kh: 'km-KH' }[lang];
			speechSynthesis.speak(utt);
		} finally {
			speakingMsgId = null;
		}
	}

	function formatMsgForCopy(msg: ChatMessage): string {
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
		return parts.join('\n');
	}

	async function autoCopy(msg: ChatMessage) {
		try {
			await navigator.clipboard.writeText(formatMsgForCopy(msg));
			copyToast = true;
			setTimeout(() => { copyToast = false; }, 2000);
		} catch { /* ignore — pas critique */ }
	}

	async function copySelected() {
		const msg = (swrMessages.data ?? []).find(m => m.id === selectedMsg);
		if (!msg) return;
		try {
			await navigator.clipboard.writeText(formatMsgForCopy(msg));
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

		// --- OPTIMISTIC UI : Ajout immédiat d'une bulle temporaire ---
		const tempId = `temp-${Date.now()}`;
		const tempMsg: ChatMessage = {
			id: tempId,
			author: firstName,
			text: '...',
			fr: '', en: '', kh: '',
			ts: new Date().toISOString(),
			source: 'audio'
		};
		swrMessages.data = [...(swrMessages.data ?? []), tempMsg];
		await tick();
		scrollToBottom();

		try {
			const wav = float32ToWav(samples);
			const base64 = arrayBufferToBase64(await wav.arrayBuffer());
			const lastMsg = messages.length > 0 ? messages[messages.length - 1].text : undefined;
			const result = await transcribeAudio(base64, 'audio/wav', lastMsg);
			if (!result.text.trim()) {
				swrMessages.data = swrMessages.data.filter(m => m.id !== tempId);
				return;
			}
			const msg = await sendMessage(Y, M, D, firstName, result.text, { fr: result.fr, en: result.en, kh: result.kh }, undefined, 'audio');
			// Remplace la bulle temporaire
			swrMessages.data = swrMessages.data.map(m => m.id === tempId ? msg : m);
		} catch {
			swrMessages.data = swrMessages.data.filter(m => m.id !== tempId);
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

		// Optimistic UI : Ajoute une bulle temporaire
		const tempId = 'temp-' + Date.now();
		const tempMsg: ChatMessage = {
			id: tempId,
			author: firstName,
			text,
			fr: suggestion?.fr || '',
			en: suggestion?.en || '',
			kh: suggestion?.kh || '',
			ts: new Date().toISOString()
		};
		swrMessages.data = [...swrMessages.data, tempMsg];
		await tick();
		scrollToBottom();

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
			// Remplace la bulle temporaire — si le polling l'a supprimée, on l'ajoute
			const hasTemp = swrMessages.data.some(m => m.id === tempId);
			if (hasTemp) {
				swrMessages.data = swrMessages.data.map(m => m.id === tempId ? msg : m);
			} else if (!swrMessages.data.some(m => m.id === msg.id)) {
				swrMessages.data = [...swrMessages.data, msg];
			}
			void autoCopy(msg);
		} catch {
			// Supprime la bulle temporaire et restaure l'input
			swrMessages.data = swrMessages.data.filter(m => m.id !== tempId);
			inputText = text;
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
			<button class="auth-btn" onclick={() => auth.signIn()}>Se connecter</button>
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
				<ChatBubble
					{msg}
					isMine={msg.author === firstName}
					isSelected={selectedMsg === msg.id}
					isPending={msg.id.startsWith('temp-')}
					isSpeaking={speakingMsgId === msg.id}
					{userLang}
					imageUrl={msg.image ? imageUrls[msg.image] : undefined}
					onSelect={() => selectMsg(msg.id)}
					onCopy={copySelected}
					onSpeak={speakSelected}
					onDelete={deleteSelected}
					onDeselect={() => selectedMsg = null}
					{fmtTime}
					{fmtTimeKH}
					{isChet}
				/>
			{/each}
		</div>

		<ChatToast {copyToast} {errorToast} copyLabel={userLang === 'kh' ? '✓ បានចម្លង' : '✓ Copié !'} />

		<SuggestionCard
			{suggestion}
			loading={suggestionLoading}
			thinkingText={ui.thinking}
			yesLabel={ui.yes}
			noLabel={ui.no}
			onAccept={acceptSuggestion}
			onDismiss={dismissSuggestion}
		/>

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
								<div class="lesson-card">
									<div class="lesson-meta">
										<span class="lesson-author">{l.author}</span>
										<span class="lesson-flag"><Flag lang={l.lang as 'fr' | 'en' | 'kh'} size="sm" /></span>
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
		<ChatInput
			bind:inputText
			{sending}
			{recording}
			{speaking}
			{vadLoading}
			{transcribing}
			{showEmojis}
			placeholder={ui.placeholder}
			emojis={EMOJIS}
			{onInput}
			{onKeydown}
			onSend={send}
			onToggleEmojis={() => showEmojis = !showEmojis}
			onInsertEmoji={insertEmoji}
			onPickImage={pickAndSendImage}
			onToggleRecording={toggleRecording}
		/>
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

	/* ── Chat header ── */
	.chat-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.45rem var(--space-4);
		flex-shrink: 0;
		position: relative;
		z-index: 2;
		background: color-mix(in srgb, var(--bg) 96%, var(--accent));
		border-bottom: 2px solid color-mix(in srgb, var(--accent) 25%, transparent);
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
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
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
		border-radius: var(--radius-sm);
		background: var(--raised);
		border: 1px solid var(--border);
		font-size: 1rem;
		color: var(--accent);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: opacity 0.15s, transform 0.12s;
	}

	.date-btn:not(:disabled):active {
		transform: scale(0.9);
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
		overflow-anchor: auto;
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

	.image-input-hidden { display: none; }

	@keyframes spin-slow {
		from { transform: rotate(0deg); }
		to   { transform: rotate(360deg); }
	}

	/* ── Bouton flashcard niveau ── */
	.fc-badge-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1px;
		padding: 0.22rem 0.4rem 0.18rem;
		border-radius: var(--radius-sm);
		background: var(--surface);
		border: 1px solid var(--border);
		transition: transform 0.12s;
		position: relative;
		overflow: visible;
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
