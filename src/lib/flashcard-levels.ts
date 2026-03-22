export interface FlashLevel {
	level: number; minXp: number;
	title_fr: string; title_kh: string;
	avatar_m: string; avatar_f: string;
}

export const LEVELS: FlashLevel[] = [
	{ level: 1, minXp: 0,    title_fr: 'Bébé',         title_kh: 'ទារក',               avatar_m: '👶',    avatar_f: '👶🏻'    },
	{ level: 2, minXp: 60,   title_fr: 'Enfant',       title_kh: 'កូន',                avatar_m: '🧒',    avatar_f: '🧒🏻'    },
	{ level: 3, minXp: 180,  title_fr: 'Écolier',      title_kh: 'សិស្ស',              avatar_m: '👦',    avatar_f: '👧🏻'    },
	{ level: 4, minXp: 400,  title_fr: 'Ado',          title_kh: 'ក្មេង',              avatar_m: '🧑',    avatar_f: '🧑🏻'    },
	{ level: 5, minXp: 700,  title_fr: 'Jeune adulte', title_kh: 'យុវវ័យ',             avatar_m: '👨',    avatar_f: '👩🏻'    },
	{ level: 6, minXp: 1200, title_fr: 'Diplômé',      title_kh: 'បញ្ចប់ការសិក្សា',   avatar_m: '👨‍🎓', avatar_f: '👩🏻‍🎓' },
	{ level: 7, minXp: 2000, title_fr: 'Expert',       title_kh: 'អ្នកជំនាញ',          avatar_m: '👨‍🏫', avatar_f: '👩🏻‍🏫' },
	{ level: 8, minXp: 3500, title_fr: 'Maître',       title_kh: 'គ្រូ',               avatar_m: '🧙‍♂️', avatar_f: '🧙🏻‍♀️' },
	{ level: 9, minXp: 5500, title_fr: 'Légende',      title_kh: 'វីរបុរស',            avatar_m: '🤴',    avatar_f: '👸🏻'    },
]

export function getLevel(xp: number): FlashLevel {
	return [...LEVELS].reverse().find(l => xp >= l.minXp) ?? LEVELS[0]
}
export function getAvatar(xp: number, lang: 'fr' | 'kh'): string {
	const l = getLevel(xp)
	return lang === 'kh' ? l.avatar_f : l.avatar_m
}
export function getLevelTitle(xp: number, lang: 'fr' | 'kh'): string {
	const l = getLevel(xp)
	return lang === 'fr' ? l.title_fr : l.title_kh
}
export function xpForNextLevel(xp: number): number | null {
	return LEVELS.find(l => l.minXp > xp)?.minXp ?? null
}
export function xpProgressPct(xp: number): number {
	const cur = getLevel(xp)
	const next = LEVELS.find(l => l.minXp > xp)
	if (!next) return 100
	return ((xp - cur.minXp) / (next.minXp - cur.minXp)) * 100
}
