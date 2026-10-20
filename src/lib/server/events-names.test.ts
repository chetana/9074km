import { describe, it, expect, vi, beforeEach } from 'vitest'

const translateMock = vi.fn()
vi.mock('./vertex', () => ({ geminiTranslateAll: (...a: unknown[]) => translateMock(...a) }))
const applyMock = vi.fn()
vi.mock('./events-store', () => ({ applyTranslations: (...a: unknown[]) => applyMock(...a) }))

import { scheduleNameTranslation, healPendingNames, resetHealForTests } from './events-names'
import { buildEventNameUser } from './khmer-guards'
import { resetEventLimitsForTests } from './events-limits'

const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
	translateMock.mockReset(); applyMock.mockReset().mockResolvedValue(true)
	resetEventLimitsForTests(); resetHealForTests()
})

describe('scheduleNameTranslation', () => {
	it('traduit avec le prompt « nom d\'évènement » et écrit les 3 langues (source intacte)', async () => {
		translateMock.mockResolvedValue({ fr: 'Disneyland Paris', en: 'Disneyland Paris', kh: 'ឌីស្នីឡែន ប៉ារីស', lang: 'fr' })
		expect(scheduleNameTranslation(1, 7, 'fr', 'Disneyland Paris')).toBe(true)
		await flush()
		expect(translateMock).toHaveBeenCalledWith('Disneyland Paris', undefined, undefined, buildEventNameUser)
		expect(applyMock).toHaveBeenCalledWith(7, 'fr', 'Disneyland Paris', { fr: 'Disneyland Paris', en: 'Disneyland Paris', kh: 'ឌីស្នីឡែន ប៉ារីស' })
	})
	it('ne bloque pas l\'appelant : retourne avant la fin de la traduction', () => {
		translateMock.mockReturnValue(new Promise(() => {}))
		expect(scheduleNameTranslation(1, 7, 'fr', 'x')).toBe(true)
	})
	it('erreur du moteur : journalisée, jamais propagée, rien d\'écrit', async () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {})
		translateMock.mockRejectedValue(new Error('boom'))
		scheduleNameTranslation(1, 7, 'fr', 'x')
		await flush()
		expect(applyMock).not.toHaveBeenCalled()
		expect(err).toHaveBeenCalled()
		err.mockRestore()
	})
	it('khmer sans caractère khmer (repli du moteur) : laissé en attente', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
		translateMock.mockResolvedValue({ fr: 'Fête', en: 'Party', kh: 'Fête' })
		scheduleNameTranslation(1, 7, 'fr', 'Fête')
		await flush()
		expect(applyMock).not.toHaveBeenCalled()
		warn.mockRestore()
	})
	it('source khmère : le khmer reste le texte de l\'utilisateur', async () => {
		translateMock.mockResolvedValue({ fr: 'Voyage', en: 'Trip', kh: 'ដំណើរ (autre)' })
		scheduleNameTranslation(1, 7, 'kh', 'ដំណើរ')
		await flush()
		expect(applyMock).toHaveBeenCalledWith(7, 'kh', 'ដំណើរ', { fr: 'Voyage', en: 'Trip', kh: 'ដំណើរ' })
	})
	it('champ vide renvoyé par le moteur : repli sur le nom source', async () => {
		translateMock.mockResolvedValue({ fr: '', en: 'Trip', kh: 'ដំណើរ' })
		scheduleNameTranslation(1, 7, 'en', 'Trip')
		await flush()
		expect(applyMock.mock.calls[0][3].fr).toBe('Trip')
	})
	it('plafonds : 20/min puis refus sans appel au moteur (nom source + pending conservés)', async () => {
		translateMock.mockResolvedValue({ fr: 'a', en: 'a', kh: 'ក' })
		let allowed = 0
		for (let i = 0; i < 25; i++) if (scheduleNameTranslation(1, i + 1, 'fr', 'a')) allowed++
		await flush()
		expect(allowed).toBe(20)
		expect(translateMock).toHaveBeenCalledTimes(20)
	})
})

describe('healPendingNames', () => {
	const ev = (id: number, pending: boolean) => ({ id, nameSrcLang: 'fr' as const, namesPending: pending, names: { fr: `Chine ${id}`, en: `Chine ${id}`, kh: `Chine ${id}` } })
	it('relance seulement les noms en attente, avec le nom source', async () => {
		translateMock.mockResolvedValue({ fr: 'Chine 1', en: 'China 1', kh: 'ចិន 1', lang: 'fr' })
		expect(healPendingNames(1, [ev(1, true), ev(2, false)])).toBe(1)
		await flush()
		expect(translateMock).toHaveBeenCalledTimes(1)
		expect(translateMock.mock.calls[0][0]).toBe('Chine 1')
	})
	it('attend 10 minutes entre deux essais et s\'arrête après 3', () => {
		translateMock.mockReturnValue(new Promise(() => {}))
		const t0 = 1_000_000
		expect(healPendingNames(1, [ev(1, true)], t0)).toBe(1)
		expect(healPendingNames(1, [ev(1, true)], t0 + 60_000)).toBe(0)
		expect(healPendingNames(1, [ev(1, true)], t0 + 11 * 60_000)).toBe(1)
		expect(healPendingNames(1, [ev(1, true)], t0 + 22 * 60_000)).toBe(1)
		expect(healPendingNames(1, [ev(1, true)], t0 + 33 * 60_000)).toBe(0)
	})
})
