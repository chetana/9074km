// Mécanisme pur du ciel Paris/Phnom Penh — porté de la maquette (design-proposals/chat-redesign/
// index.html) le 22/09/2026 (plan de modernisation P2). Interpolation continue par paliers de 3h
// (au lieu de paliers discrets qui sautaient à chaque heure ronde), zéro dépendance DOM/Svelte :
// testable directement, et réutilisable par l'horloge (P5) pour ses cartes "fenêtres sur le ciel".
export interface SkyStop { h: number; top: string; mid: string; bot: string; night: boolean }
export interface SkyColors { top: string; mid: string; bot: string; night: boolean }

export const PARIS_STOPS: SkyStop[] = [
	{ h: 0,  top: '#4E4785', mid: '#5E4C8E', bot: '#6B4D78', night: true },
	{ h: 3,  top: '#524B89', mid: '#635193', bot: '#714E76', night: true },
	{ h: 6,  top: '#BEDBF4', mid: '#F7E3CE', bot: '#FFCE9E', night: false },
	{ h: 9,  top: '#C7E7FC', mid: '#FDF1DE', bot: '#FFE2B8', night: false },
	{ h: 12, top: '#CDEAFB', mid: '#FDF6E8', bot: '#FFE9C6', night: false },
	{ h: 15, top: '#CDEAFB', mid: '#FDF1DE', bot: '#FFD9A0', night: false },
	{ h: 18, top: '#E7C9EC', mid: '#FBD8C8', bot: '#FFBE95', night: false },
	{ h: 21, top: '#6E62A0', mid: '#7B5CA0', bot: '#93597E', night: true },
	{ h: 24, top: '#4E4785', mid: '#5E4C8E', bot: '#6B4D78', night: true },
]

export const KP_STOPS: SkyStop[] = [
	{ h: 0,  top: '#4A3E82', mid: '#6A4180', bot: '#7C4462', night: true },
	{ h: 3,  top: '#4F4288', mid: '#714488', bot: '#8B4A64', night: true },
	{ h: 6,  top: '#F9D9C4', mid: '#FFC9A0', bot: '#FFAE78', night: false },
	{ h: 9,  top: '#FCE6D2', mid: '#FFDDB2', bot: '#FFC292', night: false },
	{ h: 12, top: '#FCEFD8', mid: '#FFE4BC', bot: '#FFC89C', night: false },
	{ h: 15, top: '#FCEFD8', mid: '#FFD9B8', bot: '#FFB88C', night: false },
	{ h: 18, top: '#FBC9D6', mid: '#FFB9A8', bot: '#FF9A78', night: false },
	{ h: 21, top: '#7256A0', mid: '#96468C', bot: '#B14E6C', night: true },
	{ h: 24, top: '#4A3E82', mid: '#6A4180', bot: '#7C4462', night: true },
]

function hex2rgb(hex: string): [number, number, number] {
	const n = parseInt(hex.slice(1), 16)
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgb2hex(rgb: number[]): string {
	return '#' + rgb.map((v) => {
		const c = Math.round(Math.max(0, Math.min(255, v))).toString(16)
		return c.length < 2 ? '0' + c : c
	}).join('')
}

function mixHex(h1: string, h2: string, t: number): string {
	const a = hex2rgb(h1), b = hex2rgb(h2)
	return rgb2hex([
		a[0] + (b[0] - a[0]) * t,
		a[1] + (b[1] - a[1]) * t,
		a[2] + (b[2] - a[2]) * t,
	])
}

// Interpolation linéaire continue entre les deux paliers encadrant `hour` (décimal, 0-24).
export function skyForHour(stops: SkyStop[], hour: number): SkyColors {
	for (let i = 0; i < stops.length - 1; i++) {
		const a = stops[i], b = stops[i + 1]
		if (hour >= a.h && hour <= b.h) {
			const t = (hour - a.h) / (b.h - a.h)
			return {
				top: mixHex(a.top, b.top, t),
				mid: mixHex(a.mid, b.mid, t),
				bot: mixHex(a.bot, b.bot, t),
				night: t < 0.5 ? a.night : b.night,
			}
		}
	}
	return stops[0]
}

export function skyAt(hour: number, side: 'paris' | 'kp'): SkyColors {
	return skyForHour(side === 'paris' ? PARIS_STOPS : KP_STOPS, hour)
}

// Heure décimale réelle dans un fuseau donné — gère automatiquement l'heure d'été/hiver de Paris,
// contrairement à un décalage fixe +6h.
export function hourInZone(tz: string, date: Date = new Date()): number {
	const parts = new Intl.DateTimeFormat('fr-FR', {
		timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
	}).formatToParts(date)
	let h = 0, m = 0
	for (const p of parts) {
		if (p.type === 'hour') h = parseInt(p.value, 10)
		if (p.type === 'minute') m = parseInt(p.value, 10)
	}
	return h + m / 60
}

// Phase lunaire réelle du jour (algo synodique standard, précision suffisante pour une icône) :
// 0/1 = nouvelle lune, 0.5 = pleine lune.
export function moonPhase(date: Date): number {
	const synodic = 29.530588853
	const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14)
	const days = (date.getTime() - knownNewMoon) / 86_400_000
	const phase = (days % synodic) / synodic
	return phase < 0 ? phase + 1 : phase
}
