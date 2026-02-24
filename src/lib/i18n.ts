export const MONTHS_FR = [
	'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
	'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

export const MONTHS_KH = [
	'មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា',
	'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'
];

export const DAYS_FR = [
	'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'
];

export const DAYS_KH = [
	'ច័ន្ទ', 'អង្គារ', 'ពុធ', 'ព្រហស្បតិ៍', 'សុក្រ', 'សៅរ៍', 'អាទិត្យ'
];

export const DAYS_KH_SHORT = ['ច', 'អ', 'ព', 'ព្រ', 'សុ', 'ស', 'ទ'];

export const STATUS = [
	{ from: 0,  to: 6,  icon: '🌙', fr: 'dort',           kh: 'គេង' },
	{ from: 6,  to: 9,  icon: '🌅', fr: 'se réveille',    kh: 'ភ្ញាក់' },
	{ from: 9,  to: 12, icon: '☀️', fr: 'matinée',        kh: 'ព្រឹក' },
	{ from: 12, to: 14, icon: '🍽️', fr: 'déjeuner',       kh: 'អាហារថ្ងៃ' },
	{ from: 14, to: 18, icon: '☀️', fr: 'après-midi',     kh: 'រសៀល' },
	{ from: 18, to: 21, icon: '🌆', fr: 'soirée',         kh: 'ល្ងាច' },
	{ from: 21, to: 24, icon: '🌙', fr: 'bientôt au lit', kh: 'ចូលគេង' }
];

export function getStatus(hour: number) {
	return STATUS.find((s) => hour >= s.from && hour < s.to) ?? STATUS[0];
}

export const REACTIONS = ['❤️', '😍', '😂', '🥹', '🔥', '👏'];

export const COUPLE_START = new Date('2026-01-13T00:00:00');
export const DISTANCE_KM = 9074;
export const TZ_PARIS = 'Europe/Paris';
export const TZ_PP = 'Asia/Phnom_Penh';

export function getDaysTogether(now: Date): number {
	return Math.floor((now.getTime() - COUPLE_START.getTime()) / 86_400_000);
}

export function monthLabel(mm: string): string {
	const idx = parseInt(mm, 10) - 1;
	return `${mm} — ${MONTHS_FR[idx]} · ${MONTHS_KH[idx]}`;
}

export function dayLabel(dateStr: string): { fr: string; kh: string } {
	const d = new Date(`${dateStr}T12:00:00`);
	const dow = (d.getDay() + 6) % 7; // 0=Mon
	return { fr: DAYS_FR[dow], kh: DAYS_KH[dow] };
}
