import { describe, it, expect } from 'vitest'
import { U } from './upload-i18n'

describe('libellés khmers de la confirmation de date', () => {
	it('khmer pur (ponctuation ? … autorisée), orthographe du projet', () => {
		for (const [k, v] of Object.entries(U)) {
			expect(v.kh, k).toMatch(/^[ក-៿​\s?…:·()]+$/)
			expect(v.kh, k).not.toContain('ឱ្យ')
			expect(v.kh, k).not.toContain('មួយដង')
		}
	})
})
