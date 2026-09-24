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
	// ── 5 dérives réelles du 24/09/2026 après-midi (prompt déjà corrigé le matin) : le modèle en
	// rajoutait dans le tendre (je t'aime / darling / « notre ») ou inventait un mot khmer. ──
	{
		name: `"je suis content" ≠ "je t'aime" + "oui" masculin បាទ (24/09 soir)`, author: 'Chet',
		text: "oui c'était bon ce repas, je suis content hihi",
		// prod : "ចា៎ស … បងស្រលាញ់អូនណាស់" — "je t'aime très fort" inventé, et ចា៎ស est le oui des femmes
		check: (kh) => !/ស្រលាញ់|ស្រឡាញ់/.test(kh) && !/ចា៎ស|ចាស/.test(kh) && /សប្បាយ|អរ|រីករាយ|ត្រេកអរ/.test(kh),
		checkFrEn: (fr, en) => !/\blove\b/i.test(en),
	},
	{
		name: `អូនតូច = "le petit" (bébé d'un ami), jamais "notre" (24/09 soir)`, author: 'Lys',
		context: "Chet: mon ami était chez le médecin avec sa femme, ils ont fait une échographie, le bébé n'a pas voulu montrer sa tête, il a mis sa main devant ahah",
		text: 'ប្រហែលអូនតូចនឹងនៅមិនទាន់ចង់អោយប៉ានឹងម៉ាក់គាត់ឃើញមុខគាត់ហើយមើលទៅបង 😂xd',
		// prod : "notre petit" / "our little one" — sous-entend LEUR bébé
		check: () => true,
		checkFrEn: (fr, en) => !/\bnotre\b/i.test(fr) && !/\bour\b/i.test(en),
	},
	{
		name: `"je ne m'ennuie pas" → ធុញទ្រាន់, pas un mot inventé (24/09 soir)`, author: 'Chet',
		text: "ça va, moi, j'ai juste un soucis avec ma fatigue et mes yeux fatigué, mais sinon ça va, au travail je ne m'ennuie pas, on a beaucoup de chose à faire",
		// prod : "មិនស្អប់ខ្ពស់ទេ" (« je ne déteste pas haut »), non-sens
		check: (kh) => /ធុញ|អផ្សុក/.test(kh) && !/ស្អប់/.test(kh),
	},
	{
		name: `"courage" → ស៊ូៗ (24/09 soir)`, author: 'Chet',
		text: "oh non, tu sais d'ou te venait tout ce stress ? courage ma chérie, j'aimerai être avec toi aussi 💪",
		// prod : "ខិតខំតែម៉េចទៅ", tournure peu naturelle
		// ស៊ូៗ ou មានកម្លាំងចិត្ត sont justes ; un essai rendait "stress" par ក្ដីស្រេកឃ្លា (la faim)
		check: (kh) => /ស៊ូ|កម្លាំងចិត្ត/.test(kh) && /ស្ត្រេស|ស្ទ្រេស|តានតឹង/.test(kh),
	},
	{
		name: `phrase jugée incompréhensible par Lys + pas de "darling" ajouté (24/09 soir)`, author: 'Chet',
		text: "courage à toi aussi, j'aimerai bien savoir quoi faire pour récupérer mon énergie et ne plus avoir ces soucis au visage mais ça va, c'est rien de grave non plus",
		// prod : "ស៊ូរៗដែរអូន បងចង់ដឹងថាត្រូវធ្វើអ្វីដើម្បីត្រឡប់កម្លាំងមកវិញ និងកុំមានបញ្ហាមុខហ្នឹងទៀត តែបងធូរហ្នឹង…" —
		// jugée incompréhensible par Lys : calques "ត្រឡប់កម្លាំង" (faire revenir la force), "បញ្ហាមុខ" ambigu
		// (មុខ = visage/devant/matière), "បងធូរហ្នឹង" pour "mais ça va". À remplacer par SA phrase dès qu'on l'a.
		check: (kh) => !/ត្រឡប់កម្លាំង/.test(kh) && /លើមុខ|ស្បែកមុខ/.test(kh) && /មិនអី/.test(kh),
		checkFrEn: (fr, en) => !/\b(darling|sweetheart|honey|my love|dear)\b/i.test(en) && !/\bch[ée]rie?\b/i.test(fr),
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
