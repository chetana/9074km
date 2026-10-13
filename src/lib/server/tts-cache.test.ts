import { describe, it, expect } from 'vitest'
import { ttsCacheKey } from './tts-cache'

describe('ttsCacheKey', () => {
	it('est stable et insensible aux espaces / retours à la ligne en trop', () => {
		expect(ttsCacheKey('Bonjour  le\nmonde ', 'fr')).toBe(ttsCacheKey('Bonjour le monde', 'fr'))
	})
	it('distingue la langue et le texte', () => {
		expect(ttsCacheKey('Bonjour', 'fr')).not.toBe(ttsCacheKey('Bonjour', 'kh'))
		expect(ttsCacheKey('Bonjour', 'fr')).not.toBe(ttsCacheKey('Bonsoir', 'fr'))
	})
	it('range sous tts-cache/<langue>/ avec un hash hexadécimal', () => {
		expect(ttsCacheKey('សួស្តី', 'kh')).toMatch(/^tts-cache\/kh\/[0-9a-f]{64}\.b64$/)
	})
})
