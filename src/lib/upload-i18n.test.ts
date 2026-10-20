import { describe, it, expect } from 'vitest'
import { U } from './upload-i18n'

describe('libellés khmers de la confirmation de date', () => {
	it('khmer pur (ponctuation ? … autorisée), orthographe du projet', () => {
		for (const [k, v] of Object.entries(U)) {
			expect(v.kh.replace(/\{[nx]\}/g, '1'), k).toMatch(/^[\u1780-\u17FF\u200B\s?…:·()«»0-9]+$/)
			expect(v.kh, k).not.toContain('ឱ្យ')
			expect(v.kh, k).not.toContain('មួយដង')
		}
	})
})
