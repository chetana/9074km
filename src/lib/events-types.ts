export type EventColor = 'accent' | 'lavender' | 'gold' | 'mint' | 'peach'
export type NameLang = 'fr' | 'en' | 'kh'

export interface EventDTO {
	id: number
	names: { fr: string; en: string; kh: string }
	nameSrcLang: NameLang
	namesPending: boolean
	dates: { start: string; end: string }
	cover: string | null
	place: string | null
	emoji: string | null
	color: EventColor
	autoAttach: boolean
	version: number
	count: number
	upcoming: boolean
}

export interface ForDateResult {
	events: EventDTO[]
	tags: Record<string, number>
	tagEvents: EventDTO[]
}
