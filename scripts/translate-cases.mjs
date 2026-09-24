// Cas de test de traduction PARTAGÉS entre scripts/eval-translate.mjs (GLM, prod) et
// scripts/bench-gemini-models.mjs (comparaison de modèles Gemini) — un seul endroit, pour ne pas
// recréer les copies désynchronisées que le refactor P4 du 22/09/2026 avait supprimées.
import {
	containsForeignScript, containsGluedLatin, glossaryEchoed, numbersPreserved,
} from '../src/lib/server/khmer-guards.ts'

// ── cas de régression connus (bugs réels trouvés le 22/09/2026, cf. CLAUDE.md / historique git) ──
// Chaque cas vérifie une invariance observable dans le khmer produit — pas un jugement subjectif
// de qualité (ça, c'est le rôle du --replay, lu par un humain).
export const REGRESSION_CASES = [
	{
		name: 'allergie (glossaire)', author: 'Chet', text: "Attention elle est allergique au sésame",
		check: (kh) => kh.includes('អាលែកហ្ស៊ី') && kh.includes('ល្ង'),
	},
	{
		name: 'acidulé/aigre (glossaire)', author: 'Lys', text: "C'est trop acidulé pour moi",
		check: (kh) => kh.includes('ជូរ'),
	},
	{
		name: 'bleu (glossaire)', author: 'Chet', text: "J'ai acheté une robe bleue pour toi",
		check: (kh) => kh.includes('ខៀវ'),
	},
	{
		name: '"il faut que" ≠ perdre (bug réel : traduit à tort en បាត់បង់)', author: 'Chet',
		text: "Il faut que tu manges avant d'aller travailler",
		check: (kh) => (kh.includes('ត្រូវ')) && !kh.includes('បាត់បង់'),
	},
	{
		name: '"mes parents" registre intime (bug réel : traduit trop formel en មាតាបិតា)', author: 'Lys',
		text: "Mes parents demandent de tes nouvelles",
		check: (kh) => kh.includes('ប៉ាម៉ាក់') && !kh.includes('មាតាបិតា'),
	},
	{
		name: 'inversion de sens cher/pas cher (bug réel)', author: 'Chet',
		text: "Ce restaurant n'est pas cher du tout",
		// on ne peut pas connaître LE mot exact que le modèle choisira pour "pas cher", donc on
		// vérifie juste l'absence de corruption — cette phrase sert surtout de garde-fou lu par un
		// humain (voir README), le vrai check automatisable est glued-latin/foreign-script ci-dessous.
		check: (kh) => !containsForeignScript(kh) && !containsGluedLatin(kh),
	},
	{
		name: 'pas de script étranger ni de latin collé (corruption)', author: 'Lys',
		text: "Tu as vu les boutons de ma nouvelle veste ?",
		check: (kh) => !containsForeignScript(kh) && !containsGluedLatin(kh),
	},
	{
		// Bug réel du 23/09/2026 : "បង" utilisé en interpellation (fin de phrase, pas sujet/objet
		// d'un verbe) transcrit tel quel ("bang") dans le fr/en au lieu de "chéri(e)"/"darling".
		name: '"បង" en interpellation → chéri/darling (bug réel, pas Oun/Bang littéral)', author: 'Lys',
		text: "មើលទៅហួយម៉ែនទែបង បងពូកែធ្វើងាស់ អរគុណណាស់ដែរ",
		check: () => true, // le vrai check est sur fr/en, voir checkFrEn
		checkFrEn: (fr, en) => !/\bbang\b/i.test(fr) && !/\bbang\b/i.test(en),
	},
	{
		// Bug réel du 24/09/2026 : sur 6 essais, le khmer halluciné un mot bidon pour "ma chérie"
		// collée à "Bonjour" à 5/6, ET l'heure glissait (8h/11h au lieu de 22h/10h) à 2/6 — jamais
		// en fr/en dans la même génération. glossaryEchoed + numbersPreserved lisent la source
		// directement, pas besoin que le modèle annonce quoi que ce soit dans `terms[]`.
		name: '"Bonjour ma chérie" + heure (bug réel : khmer halluciné + heure qui glisse)', author: 'Chet',
		text: "Bonjour ma chérie 😘, je suis rentré vers 22h, la je pars au travail, je suis dans le train 🚝",
		check: (kh, text) => glossaryEchoed(text, { kh, fr: '', en: '' }, true) && numbersPreserved(text, kh),
	},
	{
		// Bug réel du 24/09/2026 : "ប្ដីសម្លាញ់" (mari affectueux) rendu en français perd "mari" sur
		// 2-3/6 essais (reste juste "chéri"), ou tournure bancale "mon chéri de mari" sur 2/6.
		name: 'ប្ដីសម្លាញ់ → "mari" ne doit pas disparaître du fr/en (bug réel)', author: 'Lys',
		text: "ញាំទឹកអោយបានច្រើនផងណាប្ដីសម្លាញ់",
		check: () => true,
		checkFrEn: (fr, en) => /\bmari\b/i.test(fr) && /\bhusband\b/i.test(en),
	},
	{
		// Bug réel du 24/09/2026 : "se remettre à un sport" glisse souvent vers un cadrage "dois
		// trouver un moyen/une possibilité de..." (រក) absent de la source, sur 5/6 essais — pas de
		// garde de forme fiable possible ici (រក est un mot légitime ailleurs), affiché pour lecture
		// humaine au --replay ou relance manuelle, pas de check automatisable.
		name: '"se remettre à un sport" — cadrage រក (chercher) parasite, à relire à l\'œil', author: 'Chet',
		text: "Il faut que j'arrive à me remettre à un sport mais je suis toujours fatigué je ne comprends pas",
		check: () => true,
	},
]

// ── protocole pronoms បង/អូន avec contexte BIAISANT (le "20/20" cité dans vertex.ts) ──
// Chaque message source n'a QUE la 1re personne (pas de "tu") : l'auteur doit se désigner par SON
// pronom (Chet → បង, Lys → អូន) et l'autre pronom ne doit pas apparaître. Le contexte précédent
// vient de l'AUTRE personne et martèle l'autre pronom — le piège qui faisait basculer les modèles
// légers (3.5-flash-lite écarté sur ce critère). Plusieurs phrases de Chet parlent de beauté/peau
// exprès : un modèle influencé par le contenu "féminin" lui attribuait អូន.
const LYS_CTX = 'Lys: អូនទើបតែញ៉ាំបាយរួច\nLys: អូនហត់ណាស់ថ្ងៃនេះ អូនចង់គេង'
const CHET_CTX = "Chet: Je suis encore au bureau, je rentre tard\nChet: j'ai hâte de rentrer"
const chetSelf = (kh) => kh.includes('បង') && !kh.includes('អូន')
const lysSelf = (kh) => kh.includes('អូន') && !kh.includes('បង')
const noNameLeak = (fr, en) => !/\b(oun|bang|bong)\b/i.test(fr) && !/\b(oun|bang|bong)\b/i.test(en)

export const PRONOUN_CASES = [
	{ name: 'pronom Chet — fatigué', author: 'Chet', context: LYS_CTX, text: 'Je suis tellement fatigué ce soir', check: chetSelf },
	{ name: 'pronom Chet — beauté (biais contenu)', author: 'Chet', context: LYS_CTX, text: "Je me suis fait beau pour la soirée, j'ai même mis du parfum", check: chetSelf },
	{ name: 'pronom Chet — peau douce (biais contenu)', author: 'Chet', context: LYS_CTX, text: "J'ai mis de la crème sur mon visage, ma peau est toute douce", check: chetSelf },
	{ name: 'pronom Chet — repas', author: 'Chet', context: LYS_CTX, text: 'Je viens de finir de manger, je suis plein', check: chetSelf },
	{ name: 'pronom Chet — retour maison', author: 'Chet', context: LYS_CTX, text: 'Je suis rentré à la maison, je vais prendre une douche', check: chetSelf },
	{ name: 'pronom Lys — fatiguée', author: 'Lys', context: CHET_CTX, text: 'Je suis fatiguée ce soir', check: lysSelf },
	{ name: 'pronom Lys — travail', author: 'Lys', context: CHET_CTX, text: "J'ai fini le travail plus tôt aujourd'hui", check: lysSelf },
	{ name: 'pronom Lys — marché', author: 'Lys', context: CHET_CTX, text: 'Je suis allée au marché ce matin avec ma mère', check: lysSelf },
	{ name: 'pronom Lys — cheveux', author: 'Lys', context: CHET_CTX, text: 'Je me suis coupé les cheveux hier', check: lysSelf },
	{ name: 'pronom Lys — repas', author: 'Lys', context: CHET_CTX, text: "J'ai trop mangé ce midi, j'ai mal au ventre", check: lysSelf },
	{
		name: 'kh→fr/en — អូននឹកបង = tu me manques', author: 'Lys', context: CHET_CTX, text: 'អូននឹកបងណាស់',
		check: () => true, checkFrEn: (fr, en) => noNameLeak(fr, en) && /miss you/i.test(en),
	},
	{
		name: 'kh→fr/en — បងញ៉ាំបាយហើយឬនៅ = tu as mangé ?', author: 'Lys', context: CHET_CTX, text: 'បងញ៉ាំបាយហើយឬនៅ?',
		check: () => true, checkFrEn: (fr, en) => noNameLeak(fr, en) && /\byou\b/i.test(en),
	},
	{
		name: 'kh→fr/en — បងស្រលាញ់អូន (Chet) = je t\'aime', author: 'Chet', context: LYS_CTX, text: 'បងស្រលាញ់អូនខ្លាំងណាស់',
		check: () => true, checkFrEn: (fr, en) => noNameLeak(fr, en) && /love you/i.test(en),
	},
]
