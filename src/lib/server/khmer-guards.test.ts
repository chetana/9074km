import { describe, it, expect } from 'vitest'
import {
	containsForeignScript, containsGluedLatin, cleanKhmer, detectIsChet,
	pickTranslation, pickSuggestion, termsEchoed, splitIntoChunks, translateBudget,
	glossaryEchoed, numbersPreserved, tendernessAdded, pronounSwapped,
} from './khmer-guards'

describe('containsForeignScript', () => {
	it('détecte le thaï (piège historique : khmer et thaï se ressemblent)', () => {
		expect(containsForeignScript('សួស្តី ไทย')).toBe(true)
	})
	it('détecte le chinois/japonais/coréen/arabe/cyrillique/hébreu', () => {
		expect(containsForeignScript('中文')).toBe(true)
		expect(containsForeignScript('日本語')).toBe(true)
		expect(containsForeignScript('한국어')).toBe(true)
		expect(containsForeignScript('العربية')).toBe(true)
		expect(containsForeignScript('Привет')).toBe(true)
		expect(containsForeignScript('שלום')).toBe(true)
	})
	it('laisse passer du khmer pur, du latin, des chiffres, de la ponctuation et des emoji', () => {
		expect(containsForeignScript('អូនស្រលាញ់បង 😘 12€ !')).toBe(false)
	})
	it('gère undefined sans planter', () => {
		expect(containsForeignScript(undefined)).toBe(false)
	})
})

describe('containsGluedLatin', () => {
	it(`détecte la corruption réelle du 22/09 : latin collé sans espace au milieu d\'un mot khmer`, () => {
		expect(containsGluedLatin('បងទើបកែបុortonexus')).toBe(true)
	})
	it('ne signale PAS un vrai nom propre latin séparé par une espace (faux positif à éviter)', () => {
		expect(containsGluedLatin('បង iPhone អូន')).toBe(false)
		expect(containsGluedLatin('WhatsApp អូន')).toBe(false)
	})
	it('laisse passer chiffres, ponctuation, emoji seuls avec du khmer', () => {
		expect(containsGluedLatin('អូន 123 ខៀវ ។ 😘')).toBe(false)
	})
	it('un seul caractère latin collé ne déclenche pas (seuil {2,})', () => {
		expect(containsGluedLatin('អូនXអូន')).toBe(false)
	})
	it('deux caractères latins collés ou plus déclenchent', () => {
		expect(containsGluedLatin('អូនXYអូន')).toBe(true)
	})
})

describe('cleanKhmer', () => {
	it('retire une glose de romanisation entre parenthèses', () => {
		expect(cleanKhmer('កែ (kê)')).toBe('កែ')
	})
	it('ne touche pas une parenthèse contenant du khmer', () => {
		expect(cleanKhmer('អូន (ស្រលាញ់) បង')).toBe('អូន (ស្រលាញ់) បង')
	})
	it('compresse les espaces multiples', () => {
		expect(cleanKhmer('អូន   បង')).toBe('អូន បង')
	})
	it('gère undefined sans planter', () => {
		expect(cleanKhmer(undefined)).toBe('')
	})
})

describe('detectIsChet', () => {
	it('reconnaît "Chet" et "Chetana"', () => {
		expect(detectIsChet('Chet')).toBe(true)
		expect(detectIsChet('Chetana')).toBe(true)
	})
	it('reconnaît "Chétana" (accent composé, NFD)', () => {
		expect(detectIsChet('Chétana')).toBe(true)
	})
	it('renvoie false pour Lys/Vornsok', () => {
		expect(detectIsChet('Lys')).toBe(false)
		expect(detectIsChet('Vornsok')).toBe(false)
	})
	it('renvoie null si auteur inconnu (aucun accord forcé)', () => {
		expect(detectIsChet(undefined)).toBe(null)
		expect(detectIsChet('')).toBe(null)
	})
})

describe('splitIntoChunks', () => {
	it('ne découpe pas un texte plus court que maxLen', () => {
		expect(splitIntoChunks('bonjour', 100)).toEqual(['bonjour'])
	})
	it('découpe aux frontières de phrase khmères (។) et occidentales', () => {
		const text = 'Phrase un. Phrase deux។ Phrase trois!'
		const chunks = splitIntoChunks(text, 15)
		expect(chunks.join('')).toBe(text) // rien de perdu
		expect(chunks.every(c => c.length <= 15 || !c.includes(' '))).toBe(true)
	})
	it('découpe dur une phrase seule plus longue que maxLen, sans rien perdre', () => {
		const text = 'a'.repeat(50)
		const chunks = splitIntoChunks(text, 10)
		expect(chunks.join('')).toBe(text)
		expect(chunks.every(c => c.length <= 10)).toBe(true)
	})
})

describe('translateBudget', () => {
	it('a un plancher de 1024 même pour un texte très court', () => {
		expect(translateBudget('hi')).toBe(1024)
	})
	it('grandit proportionnellement au texte (facteur 4 par défaut)', () => {
		const text = 'a'.repeat(1000)
		expect(translateBudget(text)).toBe(4000)
	})
	it('est plafonné à MAX_OUTPUT_CEILING (8192)', () => {
		const text = 'a'.repeat(100000)
		expect(translateBudget(text)).toBe(8192)
	})
})

const okTranslationJson = JSON.stringify({
	lang: 'fr', terms: [], en: 'Hello', kh: 'សួស្តី', fr: 'Bonjour',
})

describe('pickTranslation', () => {
	it('accepte une sortie bien formée et pick uniquement les clés attendues', () => {
		const t = pickTranslation(JSON.stringify({
			lang: 'fr', terms: [{ src: 'bonjour', kh: 'សួស្តី' }], en: 'Hello', kh: 'សួស្តី', fr: 'Bonjour',
			unexpectedExtraKey: 'ignoré',
		}))
		expect(t).toEqual({ lang: 'fr', en: 'Hello', kh: 'សួស្តី', fr: 'Bonjour', terms: [{ src: 'bonjour', kh: 'សួស្តី' }] })
	})
	it('rejette un champ kh vide', () => {
		expect(() => pickTranslation(JSON.stringify({ lang: 'fr', terms: [], en: 'Hello', kh: '', fr: 'Bonjour' })))
			.toThrow(/kh manquant\/vide/)
	})
	it('rejette un champ fr manquant', () => {
		expect(() => pickTranslation(JSON.stringify({ lang: 'fr', terms: [], en: 'Hello', kh: 'សួស្តី' })))
			.toThrow(/fr manquant\/vide/)
	})
	it('rejette le placeholder du schéma recopié tel quel (bug réel possible)', () => {
		expect(() => pickTranslation(JSON.stringify({ lang: 'fr', terms: [], en: 'Hello', kh: 'អត្ថបទជាភាសាខ្មែរ', fr: 'Bonjour' })))
			.toThrow(/placeholder/)
	})
	it('rejette kh identique à fr (probable non-traduction)', () => {
		expect(() => pickTranslation(JSON.stringify({ lang: 'fr', terms: [], en: 'Hello', kh: 'Bonjour', fr: 'Bonjour' })))
			.toThrow(/identique/)
	})
	it('lang invalide devient une chaîne vide plutôt que de planter', () => {
		const t = pickTranslation(JSON.stringify({ lang: 'xx', terms: [], en: 'Hello', kh: 'សួស្តី', fr: 'Bonjour' }))
		expect(t.lang).toBe('')
	})
	it('filtre les entrées de terms malformées', () => {
		const t = pickTranslation(JSON.stringify({
			lang: 'fr', terms: [{ src: 'ok', kh: 'ok' }, { src: 'sans kh' }, 'pas un objet', null],
			en: 'Hello', kh: 'សួស្តី', fr: 'Bonjour',
		}))
		expect(t.terms).toEqual([{ src: 'ok', kh: 'ok' }])
	})
})

describe('termsEchoed', () => {
	it('true si tous les termes annoncés apparaissent dans le khmer final', () => {
		expect(termsEchoed({ kh: 'អូនមានអាលែកហ្ស៊ីនឹងល្ង', terms: [{ src: 'allergie', kh: 'អាលែកហ្ស៊ី' }, { src: 'sésame', kh: 'ល្ង' }] })).toBe(true)
	})
	it('false si un terme annoncé est absent (génération qui a divergé)', () => {
		expect(termsEchoed({ kh: 'អូនមានអាឡែស៊ីនឹងល្ង', terms: [{ src: 'allergie', kh: 'អាលែកហ្ស៊ី' }] })).toBe(false)
	})
	it('true trivialement si aucun terme difficile annoncé', () => {
		expect(termsEchoed({ kh: 'អូនស្រលាញ់បង', terms: [] })).toBe(true)
	})
	it('ignore la glose fr/en du terme (variantes "doué / fort" jamais présentes telles quelles)', () => {
		// cas réel du banc du 24/09 : traduction correcte, escaladée à tort quand fr/en étaient vérifiés
		expect(termsEchoed({
			kh: 'បងពូកែធ្វើណាស់',
			terms: [{ src: 'ពូកែ', kh: 'ពូកែ', fr: 'doué / fort', en: 'good at / skilled' }],
		})).toBe(true)
	})
	it(`accepte un terme à alternatives si l\'une est présente ("ឡេវ / គ្រាប់ឡេវ")`, () => {
		expect(termsEchoed({ kh: 'បងឃើញឡេវអាវថ្មីរបស់អូនទេ?', terms: [{ src: 'boutons', kh: 'ឡេវ / គ្រាប់ឡេវ' }] })).toBe(true)
	})
	it('ignore un terme inventé, absent du message source', () => {
		const t = { kh: 'បងបានលាបឡេលើមុខ ស្បែកបងទន់រលោងណាស់', terms: [{ src: 'ma chérie', kh: 'អូន' }] }
		expect(termsEchoed(t, "J'ai mis de la crème sur mon visage, ma peau est toute douce")).toBe(true)
		expect(termsEchoed(t, "Bonjour ma chérie, j'ai mis de la crème")).toBe(false) // là il est vraiment dans la source
	})
	it('vérifie un terme à trous ("ចាប់ផ្ដើម...ឡើងវិញ") morceau par morceau', () => {
		expect(termsEchoed({ kh: 'បងត្រូវតែចាប់ផ្ដើមកីឡាឡើងវិញអោយបាន', terms: [{ src: 'se remettre à', kh: 'ចាប់ផ្ដើម...ឡើងវិញ' }] })).toBe(true)
		expect(termsEchoed({ kh: 'បងត្រូវតែចាប់ផ្ដើមកីឡាម្ដងទៀត', terms: [{ src: 'se remettre à', kh: 'ចាប់ផ្ដើម…ឡើងវិញ' }] })).toBe(false)
	})
})

describe('glossaryEchoed', () => {
	it('bug réel du 24/09 : "ma chérie" (Chet→Lys) doit produire អូន/អូនសម្លាញ់ en khmer', () => {
		expect(glossaryEchoed('Bonjour ma chérie, je suis dans le train', { kh: 'សួស្តីអូនសម្លាញ់ បងនៅលើរថភ្លើង', fr: '', en: '' }, true)).toBe(true)
		expect(glossaryEchoed('Bonjour ma chérie, je suis dans le train', { kh: 'សួស្តីចង្អុរអូន បងនៅលើរថភ្លើង', fr: '', en: '' }, true)).toBe(false)
	})
	it(`ne s\'applique pas dans le mauvais sens (Lys écrit "mon chéri", pas "ma chérie")`, () => {
		// "ma chérie" est une entrée authorIsChet:true — un message de Lys ne la déclenche jamais
		expect(glossaryEchoed('Bonjour ma chérie', { kh: 'ខុសទាំងស្រុង', fr: '', en: '' }, false)).toBe(true)
	})
	it('ប្ដីសម្លាញ់ (source khmer) exige "mari"/"husband" dans le fr/en', () => {
		expect(glossaryEchoed('ញាំទឹកឲ្យបានច្រើនផងណាប្ដីសម្លាញ់', { kh: '', fr: 'Bois de l\'eau, mon cher mari', en: 'Drink water, my dear husband' }, false)).toBe(true)
		expect(glossaryEchoed('ញាំទឹកឲ្យបានច្រើនផងណាប្ដីសម្លាញ់', { kh: '', fr: 'Bois de l\'eau, chéri', en: 'Drink water, darling' }, false)).toBe(false)
	})
	it('true trivialement si aucune entrée du glossaire ne concerne cette phrase', () => {
		expect(glossaryEchoed('Tu as vu les infos ce matin ?', { kh: 'x', fr: 'y', en: 'z' }, true)).toBe(true)
	})
})

describe('numbersPreserved', () => {
	it('bug réel du 24/09 : "22h" doit ressortir en ១០ (12h) ou ២២ dans le khmer', () => {
		expect(numbersPreserved('je suis rentré vers 22h', 'បងបានទៅដល់ផ្ទះម៉ោង១០យប់')).toBe(true)
		expect(numbersPreserved('je suis rentré vers 22h', 'បងបានទៅដល់ផ្ទះម៉ោង២២')).toBe(true)
		expect(numbersPreserved('je suis rentré vers 22h', 'បងបានទៅដល់ផ្ទះម៉ោងប្រាំបីរាត្រី')).toBe(false) // "8" en lettres, aucun chiffre
	})
	it('accepte les chiffres khmers natifs', () => {
		expect(numbersPreserved('rendez-vous à 8h30', 'ណាត់ជួបម៉ោង៨:៣០ព្រឹក')).toBe(true)
	})
	it('true trivialement si la source ne contient aucun nombre à unité', () => {
		expect(numbersPreserved('je pense à toi', 'អូននឹកបង')).toBe(true)
	})
})

describe('pickSuggestion', () => {
	const base = { lang: 'fr', terms: [], en: 'Hello', kh: 'សួស្តី', fr: 'Bonjour', corrected: 'Bonjour', question: 'Tu voulais dire ?' }
	it('accepte une sortie bien formée', () => {
		const s = pickSuggestion(JSON.stringify(base))
		expect(s.corrected).toBe('Bonjour')
		expect(s.lessons).toBeUndefined()
	})
	it('rejette un champ corrected manquant', () => {
		const { corrected, ...rest } = base
		expect(() => pickSuggestion(JSON.stringify(rest))).toThrow(/corrected manquant\/vide/)
	})
	it('garde les lessons si présentes et bien formées', () => {
		const s = pickSuggestion(JSON.stringify({ ...base, lessons: [{ original: 'a', corrected: 'b', explanation: 'c' }] }))
		expect(s.lessons).toEqual([{ original: 'a', corrected: 'b', explanation: 'c' }])
	})
})

describe('glossaryEchoed — champ avoid (dérives réelles du 24/09 après-midi)', () => {
	it('"oui" de Chet : បាទ attendu, ចា៎ស (le oui féminin) rejeté', () => {
		const src = "oui c'était bon ce repas, je suis content hihi"
		expect(glossaryEchoed(src, { kh: 'បាទ បាយហ្នឹងឆ្ងាញ់ បងសប្បាយចិត្ត', fr: '', en: '' }, true)).toBe(true)
		expect(glossaryEchoed(src, { kh: 'ចា៎ស បាយហ្នឹងឆ្ងាញ់ បងអរហ្នឹង', fr: '', en: '' }, true)).toBe(false)
	})
	it(`"content" rendu par un "je t'aime" (ស្រលាញ់) est rejeté`, () => {
		expect(glossaryEchoed('je suis content', { kh: 'បងស្រលាញ់អូនណាស់', fr: '', en: '' }, null)).toBe(false)
	})
	it(`"je ne m'ennuie pas" exige ធុញទ្រាន់/អផ្សុក, pas un mot inventé`, () => {
		expect(glossaryEchoed("au travail je ne m'ennuie pas", { kh: 'នៅកន្លែងធ្វើការ បងមិនធុញទ្រាន់ទេ', fr: '', en: '' }, true)).toBe(true)
		expect(glossaryEchoed("au travail je ne m'ennuie pas", { kh: 'នៅកន្លែងធ្វើការ បងមិនស្អប់ខ្ពស់ទេ', fr: '', en: '' }, true)).toBe(false)
	})
	it('អូនតូច : "notre petit" rejeté, sauf si la source dit យើង (nous)', () => {
		const t = { kh: '', fr: 'Peut-être que notre petit ne veut pas', en: 'Maybe our little one' }
		expect(glossaryEchoed('ប្រហែលអូនតូចនឹងមិនទាន់ចង់', t, false)).toBe(false)
		expect(glossaryEchoed('ប្រហែលអូនតូចរបស់យើងមិនទាន់ចង់', t, false)).toBe(true)
	})
})

describe('tendernessAdded', () => {
	it(`bug réel du 24/09 : "je suis content" traduit "je t'aime très fort"`, () => {
		expect(tendernessAdded("oui c'était bon ce repas, je suis content hihi", { kh: 'ចា៎ស អាហារហ្នឹងឆ្ងាញ់មែន បងស្រលាញ់អូនណាស់ហីហី', fr: '', en: '' })).toBe(true)
	})
	it(`"darling" ajouté en anglais alors que la phrase n'a aucun mot tendre`, () => {
		expect(tendernessAdded('courage à toi aussi', { kh: '', fr: 'courage à toi aussi', en: 'Hang in there too, darling.' })).toBe(true)
	})
	it(`laisse passer un mot tendre ou un je t'aime présents dans la source`, () => {
		expect(tendernessAdded('courage ma chérie', { kh: '', fr: 'courage ma chérie', en: 'hang in there, darling' })).toBe(false)
		expect(tendernessAdded("je t'aime", { kh: 'បងស្រលាញ់អូន', fr: "je t'aime", en: 'I love you' })).toBe(false)
	})
	it('ne juge pas une source khmère (interpeller par អូន/បង y est normal)', () => {
		expect(tendernessAdded('អូនស្រលាញ់បង', { kh: 'អូនស្រលាញ់បង', fr: "Je t'aime, chéri", en: 'I love you, darling' })).toBe(false)
	})
})

describe('pronounSwapped', () => {
	it(`bug réel du 24/09 : Lys parle d'elle, le khmer lui fait dire បង`, () => {
		expect(pronounSwapped("J'ai fini le travail plus tôt aujourd'hui", 'ថ្ងៃនេះបងចប់ការមុនម្លេះ', false)).toBe(true)
		expect(pronounSwapped("J'ai fini le travail plus tôt aujourd'hui", 'ថ្ងៃនេះអូនចប់ការមុនម្លេះ', false)).toBe(false)
	})
	it('Chet parle de lui : អូន interdit', () => {
		expect(pronounSwapped('Je suis tellement fatigué ce soir', 'អូនហត់ណាស់យប់នេះ', true)).toBe(true)
		expect(pronounSwapped('Je suis tellement fatigué ce soir', 'បងហត់ណាស់យប់នេះ', true)).toBe(false)
	})
	it('ignore les faux amis បង្ហាញ (montrer), បងប្អូន (frères et sœurs), ប្អូន (cadet)', () => {
		expect(pronounSwapped('Je vais montrer la photo à mes frères et sœurs', 'អូននឹងបង្ហាញរូបទៅបងប្អូន', false)).toBe(false)
		expect(pronounSwapped('Je vais voir mon petit frère', 'បងនឹងទៅលេងប្អូនប្រុស', true)).toBe(false)
	})
	it('ne juge pas une phrase avec « tu » (les deux pronoms y sont légitimes) ni une source khmère', () => {
		expect(pronounSwapped("je t'aime", 'បងស្រលាញ់អូន', true)).toBe(false)
		expect(pronounSwapped('Tu as mangé ?', 'អូនញ៉ាំបាយហើយឬនៅ?', true)).toBe(false)
		// faux positif mesuré à l'éval : « ma chérie » s'adresse à Lys sans « tu »
		expect(pronounSwapped('Bonjour ma chérie, je suis rentré vers 22h', 'សួស្តីអូនសម្លាញ់ បងត្រឡប់មកផ្ទះវិញម៉ោង១០យប់', true)).toBe(false)
		expect(pronounSwapped('អូនហត់', 'អូនហត់', true)).toBe(false)
	})
})
