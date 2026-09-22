import { describe, it, expect } from 'vitest'
import { isValidCoffrePath } from './coffre-path'

describe('isValidCoffrePath', () => {
	it('accepte un path coffre bien formé', () => {
		expect(isValidCoffrePath('2026/09/22/photo.jpg')).toBe(true)
	})

	it('rejette un path vers une autre feature du bucket (chat, apprendre, translation-issues)', () => {
		expect(isValidCoffrePath('chat/2026/09/22.json')).toBe(false)
		expect(isValidCoffrePath('apprendre/lessons/unit1-fr.json')).toBe(false)
		expect(isValidCoffrePath('translation-issues/2026/09/22/abc.json')).toBe(false)
	})

	it('rejette un traversal de répertoire', () => {
		expect(isValidCoffrePath('2026/09/../../../etc/passwd')).toBe(false)
		expect(isValidCoffrePath('../2026/09/22/photo.jpg')).toBe(false)
	})

	it('rejette une année/mois/jour mal formés', () => {
		expect(isValidCoffrePath('26/9/22/photo.jpg')).toBe(false)
		expect(isValidCoffrePath('2026/09/22/')).toBe(false)
		expect(isValidCoffrePath('2026/09/photo.jpg')).toBe(false)
	})

	it('rejette un sous-dossier supplémentaire dans le nom de fichier', () => {
		expect(isValidCoffrePath('2026/09/22/sub/photo.jpg')).toBe(false)
	})

	it('rejette une chaîne vide', () => {
		expect(isValidCoffrePath('')).toBe(false)
	})
})
