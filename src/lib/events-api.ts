import { auth } from './auth';
import type { EventDTO, ForDateResult } from './events-types';
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

export async function removeEventMedia(id: number, paths: string[]): Promise<void> {
	await call(`/api/coffre/events/${id}/media`, { method: 'DELETE', body: JSON.stringify({ paths }) });
}

export async function fetchForDate(d: string): Promise<ForDateResult> {
	return call<ForDateResult>(`/api/coffre/events/for-date?d=${encodeURIComponent(d)}`);
}

export interface UnclassifiedItem { path: string; day: string; kind: 'image' | 'video'; size: number | null }
export interface UnclassifiedPage { total: number; items: UnclassifiedItem[]; nextCursor: string | null }

export async function fetchUnclassified(limit = 50, cursor: string | null = null): Promise<UnclassifiedPage> {
	const qs = new URLSearchParams({ limit: String(limit) });
	if (cursor) qs.set('cursor', cursor);
	return call<UnclassifiedPage>(`/api/coffre/media/unclassified?${qs}`);
}
