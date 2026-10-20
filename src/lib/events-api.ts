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

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
	if (isOffline()) throw new EventApiError(0, 'offline');
	let res: Response;
	try {
		res = await fetch(path, {
			credentials: 'include',
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
	return res.json();
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

export async function addEventMedia(id: number, paths: string[]): Promise<void> {
	await call(`/api/coffre/events/${id}/media`, { method: 'POST', body: JSON.stringify({ paths }) });
}

export async function removeEventMedia(id: number, paths: string[]): Promise<void> {
	await call(`/api/coffre/events/${id}/media`, { method: 'DELETE', body: JSON.stringify({ paths }) });
}

export async function fetchForDate(d: string): Promise<ForDateResult> {
	return call<ForDateResult>(`/api/coffre/events/for-date?d=${encodeURIComponent(d)}`);
}
