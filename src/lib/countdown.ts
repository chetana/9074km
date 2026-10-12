// Compte à rebours de l'arrivée de Lys à Paris (écran Horloge).
// L'heure exacte du vol n'est pas connue : on compte jusqu'au début de la journée du 2 novembre 2026
// à Paris (heure d'hiver, UTC+1 — le passage à l'heure d'hiver a eu lieu le 25/10). Quand l'heure du
// vol sera connue, il suffit de la mettre ici.
export const ARRIVAL_PARIS = new Date('2026-11-02T00:00:00+01:00');

// Une fois arrivée, la carte reste affichée quelques jours (célébration) puis disparaît.
export const ARRIVAL_CELEBRATION_DAYS = 7;

export interface Countdown {
	/** true dès que l'instant d'arrivée est atteint */
	arrived: boolean;
	/** temps restant (0 une fois arrivée) */
	days: number;
	hours: number;
	minutes: number;
	seconds: number;
	/** jours écoulés depuis l'arrivée (0 avant) */
	sinceDays: number;
}

const DAY = 86_400_000;

export function getCountdown(now: Date, target: Date = ARRIVAL_PARIS): Countdown {
	const ms = target.getTime() - now.getTime();
	if (ms <= 0) {
		return { arrived: true, days: 0, hours: 0, minutes: 0, seconds: 0, sinceDays: Math.max(0, Math.floor(-ms / DAY)) };
	}
	const s = Math.floor(ms / 1000);
	return {
		arrived: false,
		days: Math.floor(s / 86_400),
		hours: Math.floor((s % 86_400) / 3_600),
		minutes: Math.floor((s % 3_600) / 60),
		seconds: s % 60,
		sinceDays: 0,
	};
}

/** La carte est visible avant l'arrivée, puis pendant ARRIVAL_CELEBRATION_DAYS jours après. */
export function showArrivalCard(c: Countdown): boolean {
	return !c.arrived || c.sinceDays < ARRIVAL_CELEBRATION_DAYS;
}

// ── Trajet Phnom Penh → Paris (avion qui avance, points du calendrier) ──
// Départ du « trajet » = la dernière fois qu'ils se sont vus (08/09/2026, heure de Phnom Penh).
export const JOURNEY_START = new Date('2026-09-08T00:00:00+07:00');

export interface Journey {
	/** 0 (départ) → 1 (arrivée) */
	progress: number;
	/** nombre de jours entre le départ et l'arrivée (= nombre de points) */
	totalDays: number;
	/** jours déjà écoulés depuis le départ (0..totalDays) */
	doneDays: number;
}

export function getJourney(now: Date, start: Date = JOURNEY_START, end: Date = ARRIVAL_PARIS): Journey {
	const total = end.getTime() - start.getTime();
	const elapsed = now.getTime() - start.getTime();
	const totalDays = Math.max(1, Math.round(total / DAY));
	return {
		progress: Math.min(1, Math.max(0, elapsed / total)),
		totalDays,
		doneDays: Math.min(totalDays, Math.max(0, Math.floor(elapsed / DAY))),
	};
}
