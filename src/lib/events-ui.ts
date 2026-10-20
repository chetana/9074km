import { MONTHS_FR, MONTHS_KH, DAYS_FR, DAYS_KH } from './i18n';
import type { EventColor, EventDTO } from './events-types';

export type ReaderLang = 'fr' | 'kh';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Lys lit en khmer, tout le monde d'autre en français (même logique que isChet : NFD). */
export function readerLangFor(userName: string | null | undefined): ReaderLang {
	const n = norm(userName ?? '');
	return n.includes('lys') || n.includes('vornsok') ? 'kh' : 'fr';
}

/** Nom dans la langue du lecteur + autre langue en second (jamais deux fois le même texte). */
export function displayNames(ev: Pick<EventDTO, 'names'>, lang: ReaderLang) {
	const other: ReaderLang = lang === 'kh' ? 'fr' : 'kh';
	const primary = ev.names[lang] || ev.names.fr || ev.names.en || ev.names.kh;
	const second = ev.names[other];
	return {
		primary,
		primaryLang: lang === 'kh' ? 'km' : 'fr',
		secondary: second && second !== primary ? second : null,
		secondaryLang: other === 'kh' ? 'km' : 'fr'
	};
}

const SHORT_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

const parts = (d: string) => {
	const [y, m, day] = d.split('-').map(Number);
	return { y, m, d: day };
};

/** « 30 nov. 2026 » / « 30 nov. – 2 déc. 2026 » + équivalent khmer. */
export function formatRange(start: string, end: string): { fr: string; kh: string } {
	const a = parts(start);
	const b = parts(end);
	const mfr = (m: number) => SHORT_FR[m - 1];
	const full = (m: number) => MONTHS_FR[m - 1].toLowerCase();
	if (start === end) return { fr: `${a.d} ${full(a.m)} ${a.y}`, kh: `${a.d} ${MONTHS_KH[a.m - 1]} ${a.y}` };
	if (a.y === b.y && a.m === b.m) return { fr: `${a.d}–${b.d} ${full(a.m)} ${a.y}`, kh: `${a.d}–${b.d} ${MONTHS_KH[a.m - 1]} ${a.y}` };
	if (a.y === b.y)
		return {
			fr: `${a.d} ${mfr(a.m)} – ${b.d} ${mfr(b.m)} ${a.y}`,
			kh: `${a.d} ${MONTHS_KH[a.m - 1]} – ${b.d} ${MONTHS_KH[b.m - 1]} ${a.y}`
		};
	return {
		fr: `${a.d} ${mfr(a.m)} ${a.y} – ${b.d} ${mfr(b.m)} ${b.y}`,
		kh: `${a.d} ${MONTHS_KH[a.m - 1]} ${a.y} – ${b.d} ${MONTHS_KH[b.m - 1]} ${b.y}`
	};
}

export function dayHeading(date: string): { fr: string; kh: string } {
	const p = parts(date);
	return { fr: `${p.d} ${MONTHS_FR[p.m - 1].toLowerCase()}`, kh: `${p.d} ${MONTHS_KH[p.m - 1]}` };
}

/** « dimanche 11 octobre » · « អាទិត្យ 11 តុលា » : jour de la semaine + date, pour l'en-tête d'un fil par jour. */
export function dayHeadingLong(date: string): { fr: string; kh: string } {
	const p = parts(date);
	const dow = (new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() + 6) % 7;
	return { fr: `${DAYS_FR[dow].toLowerCase()} ${p.d} ${MONTHS_FR[p.m - 1].toLowerCase()}`, kh: `${DAYS_KH[dow]} ${p.d} ${MONTHS_KH[p.m - 1]}` };
}

/** À venir en tête (le plus proche d'abord), puis le passé, le plus récent d'abord. */
export function sortEvents(events: EventDTO[]): EventDTO[] {
	const up = events.filter((e) => e.upcoming).sort((a, b) => a.dates.start.localeCompare(b.dates.start) || a.id - b.id);
	const past = events.filter((e) => !e.upcoming).sort((a, b) => b.dates.start.localeCompare(a.dates.start) || b.id - a.id);
	return [...up, ...past];
}

export interface MonthGroup {
	key: string; // 'upcoming' ou 'AAAA-MM'
	upcoming: boolean;
	year: number;
	month: number;
	events: EventDTO[];
}

export function groupByMonth(sorted: EventDTO[]): MonthGroup[] {
	const out: MonthGroup[] = [];
	for (const e of sorted) {
		const key = e.upcoming ? 'upcoming' : e.dates.start.slice(0, 7);
		let g = out[out.length - 1];
		if (!g || g.key !== key) {
			const p = parts(e.dates.start);
			g = { key, upcoming: e.upcoming, year: p.y, month: p.m, events: [] };
			out.push(g);
		}
		g.events.push(e);
	}
	return out;
}

/** Texte cherchable d'un évènement : noms, lieu, mois (complets, abrégés, khmer), jours et années couverts, dates ISO. */
export function searchHaystack(ev: EventDTO): string {
	const out: string[] = [ev.names.fr, ev.names.en, ev.names.kh, ev.place ?? '', ev.dates.start, ev.dates.end];
	const a = Date.parse(`${ev.dates.start}T00:00:00Z`);
	const days = Math.min(Math.round((Date.parse(`${ev.dates.end}T00:00:00Z`) - a) / 86_400_000), 366);
	const months = new Set<number>();
	const nums = new Set<number>();
	const years = new Set<number>();
	for (let i = 0; i <= days; i++) {
		const d = new Date(a + i * 86_400_000);
		nums.add(d.getUTCDate());
		years.add(d.getUTCFullYear());
		months.add(d.getUTCMonth());
	}
	out.push(...[...nums].map(String), ...[...years].map(String));
	for (const m of months) out.push(MONTHS_FR[m], SHORT_FR[m], MONTHS_KH[m]);
	return norm(out.join(' | '));
}

/** Tous les mots de la requête doivent se retrouver (« 30 nov », « lyon », « 2026 »…), sans accents ni casse. */
export function matchesQuery(ev: EventDTO, q: string): boolean {
	const tokens = norm(q.trim()).split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return true;
	const hay = searchHaystack(ev);
	return tokens.every((t) => hay.includes(t));
}

/** Lieux distincts (casse ignorée), du plus fréquent au moins fréquent. */
export function placesOf(events: EventDTO[]): { key: string; label: string; count: number }[] {
	const m = new Map<string, { key: string; label: string; count: number }>();
	for (const e of events) {
		const label = e.place?.trim();
		if (!label) continue;
		const key = norm(label);
		const cur = m.get(key);
		if (cur) cur.count++;
		else m.set(key, { key, label, count: 1 });
	}
	return [...m.values()].sort((x, y) => y.count - x.count || x.label.localeCompare(y.label));
}

export const samePlace = (ev: EventDTO, key: string) => !!ev.place && norm(ev.place.trim()) === key;

export function yearsOf(events: EventDTO[]): number[] {
	return [...new Set(events.map((e) => Number(e.dates.start.slice(0, 4))))].sort((a, b) => b - a);
}

/** Chemins `AAAA/MM/JJ/fichier` regroupés par jour, jours croissants, fichiers triés. */
export function groupPathsByDay(paths: string[]): { date: string; paths: string[] }[] {
	const map = new Map<string, string[]>();
	for (const p of [...paths].sort()) {
		const [y, m, d] = p.split('/');
		const k = `${y}-${m}-${d}`;
		map.set(k, [...(map.get(k) ?? []), p]);
	}
	return [...map].map(([date, ps]) => ({ date, paths: ps }));
}

/** Picker : suggérés = couvrant la date (auto_attach d'abord), puis récents sans doublon. */
export function pickerSections(all: EventDTO[], covering: EventDTO[], excludeId: number | null, recentLimit = 8) {
	const suggested = covering.filter((e) => e.id !== excludeId);
	const ids = new Set(suggested.map((e) => e.id));
	const recent = sortEvents(all.filter((e) => e.id !== excludeId && !ids.has(e.id)))
		.sort((a, b) => Number(a.upcoming) - Number(b.upcoming) || b.id - a.id)
		.slice(0, recentLimit);
	return { suggested, recent };
}

export function coveringFromList(all: EventDTO[], date: string): EventDTO[] {
	return all
		.filter((e) => e.dates.start <= date && e.dates.end >= date)
		.sort((a, b) => Number(b.autoAttach) - Number(a.autoAttach) || b.dates.start.localeCompare(a.dates.start));
}

export function colorStyle(color: EventColor): string {
	const t: Record<EventColor, [string, string]> = {
		accent: ['color-mix(in srgb, var(--accent) 30%, var(--surface))', 'var(--on-accent)'],
		lavender: ['var(--lavender)', 'var(--on-lavender)'],
		gold: ['color-mix(in srgb, var(--gold) 45%, var(--surface))', 'var(--gold-text)'],
		mint: ['var(--mint)', 'var(--mint-text)'],
		peach: ['var(--peach)', 'var(--peach-text)']
	};
	const [bg, fg] = t[color] ?? t.accent;
	return `--ev-bg:${bg};--ev-fg:${fg}`;
}

export const EVENT_COLOR_LIST: EventColor[] = ['accent', 'lavender', 'gold', 'mint', 'peach'];

const cp = (s: string) => Array.from(s).length;

/** Miroir client minimal des règles du serveur (le serveur reste l'autorité). */
export function validateEventForm(f: { name: string; dateStart: string; dateEnd: string }): string | null {
	const n = f.name.trim();
	if (!n) return 'name';
	if (cp(n) > 80) return 'name-long';
	if (!/^\d{4}-\d{2}-\d{2}$/.test(f.dateStart) || !/^\d{4}-\d{2}-\d{2}$/.test(f.dateEnd)) return 'dates';
	if (f.dateEnd < f.dateStart) return 'range';
	const days = (Date.parse(f.dateEnd) - Date.parse(f.dateStart)) / 86_400_000;
	if (days > 366) return 'range-long';
	return null;
}

/** Remplit {n} {d} {x} {r} {t} d'un libellé ; le français accorde « photo(s) » et « ajoutée(s) » avec n. */
export function fillT(label: string, vars: Record<string, string | number>): string {
	const n = typeof vars.n === 'number' ? vars.n : Number(vars.n ?? 0);
	return label
		.replace('photo(s)', n > 1 ? 'photos' : 'photo')
		.replace('ajoutée(s)', n > 1 ? 'ajoutées' : 'ajoutée')
		.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
