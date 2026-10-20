import { cachedEvents, fetchEvents, EventApiError } from './events-api';
import type { EventDTO } from './events-types';

// État partagé de la liste des évènements (grille, picker, vue évènement). Côté client seulement :
// rien n'est chargé tant que load() n'est pas appelé depuis un composant monté.
class EventsStore {
	list = $state<EventDTO[]>([]);
	loading = $state(false);
	failed = $state(false);
	offline = $state(false);
	hydrated = $state(false);

	async load() {
		if (!this.hydrated) {
			const c = cachedEvents();
			if (c) this.list = c;
			this.hydrated = true;
		}
		this.loading = true;
		this.failed = false;
		try {
			this.list = await fetchEvents();
			this.offline = false;
		} catch (e) {
			if (e instanceof EventApiError && e.status === 0) this.offline = true;
			// Sans cache, on affiche l'erreur ; avec cache, on garde la liste et on signale hors-ligne.
			this.failed = this.list.length === 0;
		} finally {
			this.loading = false;
		}
	}

	byId(id: number | null): EventDTO | null {
		return id === null ? null : (this.list.find((e) => e.id === id) ?? null);
	}

	upsert(ev: EventDTO) {
		const i = this.list.findIndex((e) => e.id === ev.id);
		this.list = i >= 0 ? this.list.map((e) => (e.id === ev.id ? ev : e)) : [ev, ...this.list];
	}

	remove(id: number) {
		this.list = this.list.filter((e) => e.id !== id);
	}
}

export const eventsStore = new EventsStore();
