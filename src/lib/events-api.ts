import { auth } from './auth';
import type { EventDTO, ForDateResult, SuggestionDTO } from './events-types';
import { getCachedEvents, setCachedEvents, getCachedEventMedia, setCachedEventMedia } from './localCache';

export class EventApiError extends Error {
	constructor(
		public status: number,
		message: string,
		public current?: EventDTO
	) {
		super(message);
	}
}

export interface EventFormBody {
	name?: string;
	nameLang?: 'fr' | 'en' | 'kh';
	names?: Partial<Record<'fr' | 'en' | 'kh', string>>;
	dateStart?: string;
	dateEnd?: string;
	place?: string | null;
	emoji?: string | null;
	color?: string;
	autoAttach?: boolean;
	coverPath?: string | null;
	mediaPaths?: string[];
	ifVersion?: number;
}

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** Délai maximum d'un appel (en-têtes ET corps) : au-delà, échec « réseau » (le toast propose « Réessayer »). */
export const REQUEST_TIMEOUT_MS = 15000;

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
	if (isOffline()) throw new EventApiError(0, 'offline');
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
	try {
		let res: Response;
		try {
			res = await fetch(path, {
				credentials: 'include',
				signal: ctrl.signal,
				...init,
				headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers as Record<string, string>) }
			});
		} catch {
			throw new EventApiError(0, 'network');
		}
		if (res.status === 401) {
			auth.signOutSilent();
			throw new EventApiError(401, 'Session expired');
		}
		if (!res.ok) {
			let current: EventDTO | undefined;
			if (res.status === 409) current = (await res.json().catch(() => ({})))?.current;
			throw new EventApiError(res.status, `API error ${res.status}`, current);
		}
		try {
			return await res.json();
		} catch {
			throw new EventApiError(0, 'network');
		}
	} finally {
		clearTimeout(timer);
	}
}

export const cachedEvents = (): EventDTO[] | null => getCachedEvents() as EventDTO[] | null;
export const cachedEventMedia = (id: number): string[] | null => getCachedEventMedia(id);

export async function fetchEvents(): Promise<EventDTO[]> {
	const { events } = await call<{ events: EventDTO[] }>('/api/coffre/events');
	setCachedEvents(events);
	return events;
}

export async function createEvent(body: EventFormBody): Promise<EventDTO> {
	return (await call<{ event: EventDTO }>('/api/coffre/events', { method: 'POST', body: JSON.stringify(body) })).event;
}

export async function patchEvent(id: number, body: EventFormBody): Promise<EventDTO> {
	return (await call<{ event: EventDTO }>(`/api/coffre/events/${id}`, { method: 'PATCH', body: JSON.stringify(body) })).event;
}

export async function deleteEvent(id: number): Promise<void> {
	await call(`/api/coffre/events/${id}`, { method: 'DELETE' });
}

export async function fetchEventMedia(id: number): Promise<string[]> {
	const { paths } = await call<{ paths: string[] }>(`/api/coffre/events/${id}/media`);
	setCachedEventMedia(id, paths);
	return paths;
}

export interface AddMediaResult {
	added: number;
	/** Photos déjà rangées dans un AUTRE évènement, laissées en place (mode « keep »). */
	skipped: { path: string; eventId: number }[];
}

/** mode « move » (défaut) = déplacement explicite ; « keep » = ne déplace jamais une photo déjà classée ailleurs. */
export async function addEventMedia(id: number, paths: string[], mode: 'move' | 'keep' = 'move'): Promise<AddMediaResult> {
	const r = await call<Partial<AddMediaResult>>(`/api/coffre/events/${id}/media`, { method: 'POST', body: JSON.stringify({ paths, mode }) });
	return { added: r.added ?? paths.length, skipped: r.skipped ?? [] };
}

/** Nombre de photos du coffre dans les dates de l'évènement qui n'ont AUCUN évènement (calculé par le serveur). */
export async function fetchDatesMediaCount(id: number): Promise<number> {
	const { count } = await call<{ count: number }>(`/api/coffre/events/${id}/dates-media`);
	return count;
}

/** Rattache ces photos (mode keep côté serveur : jamais de déplacement depuis un autre évènement). */
export async function attachDatesMedia(id: number): Promise<number> {
	const { added } = await call<{ added: number }>(`/api/coffre/events/${id}/dates-media`, { method: 'POST' });
	return added;
}

export async function removeEventMedia(id: number, paths: string[]): Promise<void> {
	await call(`/api/coffre/events/${id}/media`, { method: 'DELETE', body: JSON.stringify({ paths }) });
}

export async function fetchForDate(d: string): Promise<ForDateResult> {
	return call<ForDateResult>(`/api/coffre/events/for-date?d=${encodeURIComponent(d)}`);
}

export interface UnclassifiedItem { path: string; day: string; kind: 'image' | 'video'; size: number | null; uploadedBy: string | null }
export interface UnclassifiedPage { total: number; items: UnclassifiedItem[]; nextCursor: string | null }

export async function fetchUnclassified(limit = 50, cursor: string | null = null): Promise<UnclassifiedPage> {
	const qs = new URLSearchParams({ limit: String(limit) });
	if (cursor) qs.set('cursor', cursor);
	return call<UnclassifiedPage>(`/api/coffre/media/unclassified?${qs}`);
}

/** Retraduction sur demande du nom (PATCH `name`) : « scheduled » = lancée, « limited » = plafond de traductions atteint. */
export async function retranslateEvent(id: number, ifVersion: number, name: string, nameLang: 'fr' | 'en' | 'kh'): Promise<{ event: EventDTO; translation: 'scheduled' | 'limited' | undefined }> {
	return call(`/api/coffre/events/${id}`, { method: 'PATCH', body: JSON.stringify({ ifVersion, name, nameLang }) });
}

/** Export JSON des évènements : téléchargé tel quel (429 = limite horaire atteinte). */
export async function downloadExport(): Promise<void> {
	if (isOffline()) throw new EventApiError(0, 'offline');
	let res: Response;
	try {
		res = await fetch('/api/coffre/events/export', { credentials: 'include', signal: AbortSignal.timeout?.(REQUEST_TIMEOUT_MS * 2) });
	} catch {
		throw new EventApiError(0, 'network');
	}
	if (res.status === 401) { auth.signOutSilent(); throw new EventApiError(401, 'Session expired'); }
	if (!res.ok) throw new EventApiError(res.status, `API error ${res.status}`);
	const blob = await res.blob();
	const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'evenements-coffre.json';
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = name;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function fetchSuggestions(): Promise<SuggestionDTO[]> {
	return (await call<{ suggestions: SuggestionDTO[] }>('/api/coffre/events/suggestions')).suggestions;
}

export async function dismissSuggestion(start: string, end: string, count: number): Promise<void> {
	await call('/api/coffre/events/suggestions/dismiss', { method: 'POST', body: JSON.stringify({ start, end, count }) });
}

/** « Passer » dans le mode tri (ne revient pas avant 30 jours) ; undo = annulation du dernier geste. */
export async function skipMedia(paths: string[], undo = false): Promise<void> {
	await call('/api/coffre/media/skip', { method: 'POST', body: JSON.stringify({ paths, undo }) });
}

/** Rattache par lots de 500 en mode « keep » : rend le total ajouté et les photos laissées dans un autre évènement. */
export async function attachInChunks(id: number, paths: string[]): Promise<{ added: number; skipped: { path: string; eventId: number }[] }> {
	let added = 0;
	const skipped: { path: string; eventId: number }[] = [];
	for (let i = 0; i < paths.length; i += 500) {
		const r = await addEventMedia(id, paths.slice(i, i + 500), 'keep');
		added += r.added;
		skipped.push(...r.skipped);
	}
	return { added, skipped };
}
