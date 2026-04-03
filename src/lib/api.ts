import { auth } from './auth';
import {
	getCachedMessages, setCachedMessages,
	getCachedList, setCachedList, invalidateCachedList,
	getCachedNote, setCachedNote,
	getCachedMeta, setCachedMeta,
	getCachedReactions, setCachedReactions,
	getCachedLessons, setCachedLessons,
} from './localCache';

const BASE = '';

export interface CoffreItem {
	name: string;
	size: number;
	updated: string;
}

export interface ListResult {
	prefixes: string[];
	items: CoffreItem[];
}

async function authHeaders(): Promise<Record<string, string>> {
	const token = auth.getToken();
	if (!token) throw new Error('Not authenticated');
	return { Authorization: `Bearer ${token}` };
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
	const headers = await authHeaders();
	const res = await fetch(`${BASE}${path}`, {
		...options,
		headers: { ...headers, ...(options.headers as Record<string, string>) }
	});
	if (res.status === 401) {
		auth.signOutSilent();
		throw new Error('Session expired');
	}
	if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
	return res;
}

const listCache = new Map<string, ListResult>();

export async function listObjects(prefix: string): Promise<ListResult> {
	if (listCache.has(prefix)) return listCache.get(prefix)!;
	try {
		const res = await apiFetch(`/api/coffre/list?prefix=${encodeURIComponent(prefix)}`);
		const data: ListResult = await res.json();
		listCache.set(prefix, data);
		setCachedList(prefix, data);
		return data;
	} catch {
		// Offline / erreur réseau → servir depuis le cache localStorage
		const cached = getCachedList(prefix) as ListResult | null;
		if (cached) { listCache.set(prefix, cached); return cached; }
		return { prefixes: [], items: [] };
	}
}

/** Invalide toutes les entrées du cache dont le préfixe commence par `prefix` */
export function invalidateListCache(prefix: string): void {
	for (const key of listCache.keys()) {
		if (key.startsWith(prefix) || prefix.startsWith(key)) {
			listCache.delete(key);
		}
	}
	invalidateCachedList(prefix);
}

export async function signUpload(path: string, contentType: string): Promise<string> {
	const res = await apiFetch('/api/coffre/sign-upload', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ path, contentType })
	});
	const data = await res.json();
	return data.url as string;
}

export async function signDownload(path: string): Promise<string> {
	const res = await apiFetch(`/api/coffre/sign-download?path=${encodeURIComponent(path)}`);
	const data = await res.json();
	return data.url as string;
}

export async function deleteObject(path: string): Promise<void> {
	await apiFetch(`/api/coffre/delete?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
}

export async function uploadFile(
	signedUrl: string,
	bytes: Uint8Array,
	contentType: string
): Promise<void> {
	const res = await fetch(signedUrl, {
		method: 'PUT',
		body: bytes,
		headers: { 'Content-Type': contentType }
	});
	if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
}

export async function fetchNote(y: string, m: string, d: string): Promise<string> {
	try {
		const res = await apiFetch(`/api/coffre/note?y=${y}&m=${m}&d=${d}`);
		const text = await res.text();
		setCachedNote(y, m, d, text);
		return text;
	} catch {
		return getCachedNote(y, m, d) ?? '';
	}
}

export async function saveNote(y: string, m: string, d: string, text: string): Promise<void> {
	await apiFetch(`/api/coffre/note?y=${y}&m=${m}&d=${d}`, {
		method: 'POST',
		headers: { 'Content-Type': 'text/plain' },
		body: text
	});
}

export async function fetchMeta(y: string, m: string, d: string): Promise<Record<string, string>> {
	try {
		const res = await apiFetch(`/api/coffre/meta?y=${y}&m=${m}&d=${d}`);
		const data: Record<string, string> = await res.json();
		setCachedMeta(y, m, d, data);
		return data;
	} catch {
		return getCachedMeta(y, m, d) ?? {};
	}
}

export async function saveMeta(
	y: string,
	m: string,
	d: string,
	meta: Record<string, string>
): Promise<void> {
	await apiFetch(`/api/coffre/meta?y=${y}&m=${m}&d=${d}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(meta)
	});
}

export async function fetchReactions(
	y: string,
	m: string,
	d: string
): Promise<Record<string, string[]>> {
	try {
		const res = await apiFetch(`/api/coffre/reactions?y=${y}&m=${m}&d=${d}`);
		const data: Record<string, string[]> = await res.json();
		setCachedReactions(y, m, d, data);
		return data;
	} catch {
		return getCachedReactions(y, m, d) ?? {};
	}
}

export async function saveReactions(
	y: string,
	m: string,
	d: string,
	reactions: Record<string, string[]>
): Promise<void> {
	await apiFetch(`/api/coffre/reactions?y=${y}&m=${m}&d=${d}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(reactions)
	});
}

export function ogImageUrl(path: string, w = 300): string {
	return `${BASE}/api/coffre/og-image?path=${encodeURIComponent(path)}&w=${w}`;
}

export function previewUrl(y: string, m: string, d: string, f: string): string {
	return `https://lys.chetana.dev/api/coffre/preview?y=${y}&m=${m}&d=${d}&f=${encodeURIComponent(f)}`;
}

export function shareUrl(y: string, m: string, d: string, f: string): string {
	return `https://lys.chetana.dev/coffre?y=${y}&m=${m}&d=${d}&f=${encodeURIComponent(f)}`;
}

// Filter out metadata files from item lists
export const META_FILES = ['note.txt', 'meta.json', 'reactions.json'];

// ── Chat ──────────────────────────────────────────────────────────────────

export interface ChatMessage {
	id: string;
	author: string;
	text: string;
	fr: string;
	en: string;
	kh: string;
	lang?: string;   // langue détectée du message original : 'fr', 'en' ou 'kh'
	ts: string;
	image?: string;
	source?: 'audio';
}

export interface LessonItem {
	original: string;
	corrected: string;
	explanation: string;
}

export interface GeminiSuggestion {
	corrected: string;
	fr: string;
	en: string;
	kh: string;
	lang: string;    // langue détectée du message original : 'fr', 'en' ou 'kh'
	question: string;
	lessons?: LessonItem[];  // une entrée par faute — absent si aucune faute
}

export async function fetchMessages(y: string, m: string, d: string): Promise<ChatMessage[]> {
	try {
		const res = await apiFetch(`/api/chat/messages?y=${y}&m=${m}&d=${d}`);
		const msgs: ChatMessage[] = await res.json();
		setCachedMessages(y, m, d, msgs);
		return msgs;
	} catch {
		const cached = getCachedMessages(y, m, d) as ChatMessage[] | null;
		return cached ?? [];
	}
}

export async function sendMessage(
	y: string, m: string, d: string,
	author: string, text: string,
	translations: { fr: string; en: string; kh: string; lang?: string; lessons?: LessonItem[] },
	image?: string,
	source?: 'audio'
): Promise<ChatMessage> {
	const res = await apiFetch(`/api/chat/messages?y=${y}&m=${m}&d=${d}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ author, text, ...translations, ...(image ? { image } : {}), ...(source ? { source } : {}) })
	});
	return res.json();
}

export interface LessonEntry {
	id: string;
	ts: string;
	author: string;
	original: string;
	corrected: string;
	lesson: string;
	lang: string;
}

export async function fetchLessons(): Promise<LessonEntry[]> {
	try {
		const res = await apiFetch('/api/chat/lessons');
		const data: LessonEntry[] = await res.json();
		setCachedLessons(data);
		return data;
	} catch {
		return (getCachedLessons() as LessonEntry[] | null) ?? [];
	}
}

export async function transcribeAudio(audio: string, mimeType: string): Promise<{ text: string; fr: string; en: string; kh: string }> {
	const res = await apiFetch('/api/chat/transcribe', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ audio, mimeType })
	});
	return res.json();
}

export async function deleteMessage(y: string, m: string, d: string, id: string): Promise<void> {
	await apiFetch(`/api/chat/messages?y=${y}&m=${m}&d=${d}&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function suggestMessage(text: string): Promise<GeminiSuggestion> {
	const res = await apiFetch('/api/chat/suggest', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ text })
	});
	return res.json();
}

export function isMediaFile(name: string): boolean {
	const filename = name.split('/').pop() ?? '';
	return !META_FILES.includes(filename);
}
