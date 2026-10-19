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
		// Bug réel des 12-13/10/2026 : លក់ (vendre) rendu "dormi profondément" / "veillé sur mon sommeil".
		name: 'លក់ដាច់ = bien vendre, jamais dormir (bug réel 12-13/10)', author: 'Lys',
		text: 'បងបានមើលការលក់អូនទេ ថ្ងៃនេះអូនលក់ដាច់ណាស់ 🙈',
		check: () => true,
		checkFrEn: (fr, en) => /vend|vente/i.test(fr) && !/dorm|sommeil/i.test(fr) && !/\bslee?p|\bslept/i.test(en),
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
	{
		// Bug réel du 25/09/2026 : "tu as dormi tôt" (se coucher tôt, un horaire) rendu en prod par
		// "ដេកច្រើនម៉ោង" (dormir de nombreuses heures, une durée) — glissement de sens, pas de registre :
		// la source ne dit rien sur la durée du sommeil, seulement qu'il s'est couché tôt.
		// Même essai prod : après "អូនសម្លាញ់" en ouverture, le pronom d'adresse dérivait vers "កូន"
		// (« enfant », registre parent→enfant) pour le reste du message au lieu de rester à "អូន"
		// (le terme d'affection normal entre amoureux) — deux bugs distincts dans le même message.
		name: '"dormi tôt" (horaire) ≠ dormir longtemps + pas de dérive អូន→កូន (bug réel)', author: 'Chet',
		text: "Bonjour ma chérie, ah c'est bien si tu as dormi tôt, mais c'est dommage que tu aies eu mal à la tête, t'avais assez bu ? parfois dormir sans avoir bien bu de l'eau, ça nous assèche et ça fait mal à la tête",
		check: (kh) => !/ច្រើនម៉ោង|ដេកយូរ/.test(kh) && !/កូន/.test(kh),
	},
	// Erreurs réelles du 16 au 19/10/2026 (messages de Chet en prod).
	{
		name: '"croisé le patron" → ជួប, pas "assis dans la rue" (bug réel 19/10)', author: 'Chet',
		text: "j'ai arrêté de te parler, parce que j'ai croisé le patron de ma société en chemin",
		check: (kh) => /ជួប|ប្រទះ/.test(kh) && !kh.includes('បង្គុយនៅផ្លូវ'),
	},
	{
		name: '"bouchon" → ស្ទះ/ជាប់ផ្លូវ, pas un mot inventé (bug réel 19/10)', author: 'Chet',
		text: "ah non c'est pas un bouchon, mon patron m'a appelé dans la rue",
		check: (kh) => /ស្ទះ|ជាប់ផ្លូវ|ចរាចរណ៍/.test(kh) && !kh.includes('គ្រាប់ចំលង'),
	},
	{
		name: '"20 minutes" → នាទី, pas ម៉ោង (bug réel 19/10)', author: 'Chet',
		text: "Je viens de descendre du train, encore 20 minutes à pied",
		check: (kh) => kh.includes('នាទី') && !kh.includes('ម៉ោង'),
	},
	{
		name: '"visa" → ទិដ្ឋាការ (bug réel 16/10)', author: 'Chet',
		text: "Je suis trop content que tu aies ton visa pour la France, on va pouvoir t'acheter le billet d'avion bientôt",
		check: (kh) => kh.includes('ទិដ្ឋាការ'),
	},
	{
		name: '"restés dormir" ≠ venus dormir (bug réel 19/10)', author: 'Chet',
		text: "Ils sont restés dormir, ils sont encore chez moi, je les ramène ce soir après le travail",
		check: (kh) => !kh.includes('ចុះមកដេក') && !containsForeignScript(kh) && !containsGluedLatin(kh),
	},
	{
		name: '"4 degrés là" : "là" n\'est pas un mot khmer (bug réel 19/10)', author: 'Chet',
		text: "Il commence à faire froid le matin, 4 degrés là, on est passé sous les 10 degrés",
		check: (kh) => !kh.includes('តាស'),
	},
	{
		name: '"chauffage" ≠ climatisation chaude (bug réel 19/10)', author: 'Chet',
		text: "dès que j'arriverai au bureau, il y aura du chauffage comme à la maison",
		check: (kh) => /កម្[តដ]ៅ|កំ[តដ]ៅ/.test(kh) && !kh.includes('ត្រជាក់ក្ដៅ') && !kh.includes('ត្រជាក់ក្តៅ'),
	},
	{
		name: '"site" → គេហទំព័រ, pas សាយ (bug réel 18/10)', author: 'Chet',
		text: "j'ai fait ce site pour ta maman, tu pourras l'installer sur son téléphone",
		check: (kh) => /គេហទំព័រ|វេបសាយ|វេបសៃ/.test(kh),
	},
	{
		name: '"l\'habitude de vendre" → ធ្លាប់, pas "fini de vendre" (bug réel 19/10)', author: 'Chet',
		text: "j'ai peur que tu t'ennuies à la maison, vu que tu as l'habitude de vendre",
		check: (kh) => kh.includes('ធ្លាប់') && !kh.includes('ធ្លាប់លក់រួច'),
	},
	{
		name: 'date "5 novembre" → ថ្ងៃទី៥, ទី jamais perdu (bug réel 19/10)', author: 'Chet',
		text: "j'ai vu des billets moins chers le 5 novembre, tu veux qu'on y aille le 5 novembre ?",
		check: (kh) => /ទី\s*[5៥]/.test(kh) && !/ថ្ងៃ[5៥]/.test(kh),
	},
	{
		name: '"prends des places" → សំបុត្រ, pas ប្រអប់ (bug réel 19/10)', author: 'Chet',
		text: "pour savoir si je prends des places ou pas ahah",
		check: (kh) => kh.includes('សំបុត្រ') && !kh.includes('ប្រអប់') && !/ahah/i.test(kh),
	},
	{
		name: '"billets à 60€ chacun" → សំបុត្រ (bug réel 19/10)', author: 'Chet',
		text: "c'est le seul jour où on peut avoir des billets à 60€ chacun, ça fait 120€ à nous deux",
		check: (kh) => kh.includes('សំបុត្រ') && !kh.includes('ប្រអប់'),
	},
	{
		name: '"le double" (prix) ≠ ឆ្ងាយ=loin (bug réel 19/10)', author: 'Chet',
		text: "le prix normal c'est plutôt le double",
		check: (kh) => /ទ្វេ|ពីរដង/.test(kh) && !kh.includes('ឆ្ងាយ'),
	},
	// Audit du 19/10/2026 sur les messages du 13 au 15/10.
	{ name: '"tu me manques aussi" Chet → បងនឹកអូន, pas inversé (audit 13/10)', author: 'Chet', text: "et tu me manques aussi ma chérie 😘",
		check: (kh) => /បង(?:ក៏)?នឹកអូន/.test(kh) && !/អូន(?:ក៏)?នឹកបង/.test(kh) },
	{ name: '"23 degrés" ≠ ម៉ោង (audit 13/10)', author: 'Chet', text: "ici il refait chaud, il fait 23 degrés ce matin",
		check: (kh) => !kh.includes('ម៉ោង') },
	{ name: '"j\'aurais pensé" → គិត, pas សំណើច=rire (audit 15/10)', author: 'Chet', text: "oui, on a une activité avant, donc j'aurais déjà pensé à autre chose je pense",
		check: (kh) => !kh.includes('សំណើច') },
	{ name: '"je baille" / "difficile" ≠ asthme / manque (audit 13/10)', author: 'Chet', text: "c'est difficile ce matin, je baille déjà ahah",
		check: (kh) => !/ហឺត|ខ្វះខាត/.test(kh) },
	{ name: '"chez mes parents" avec possessif (audit 15/10)', author: 'Chet', text: "j'irai près de chez mes parents pour aller acheter",
		check: (kh) => /ប៉ាម៉ាក់(?:របស់)?\s*(?:បង|ខ្ញុំ)/.test(kh) },
	{ name: 'kh→fr : ថ្ងាស់ = front, pas menton (audit 15/10)', author: 'Lys', text: 'អូនសារភាពប្រាប់បងតាមត្រង់ចុះ អូនមិនចូលចិត្តថ្ងាស់របស់អូននឹងច្រមុះរបស់អូនទេ',
		check: () => true, checkFrEn: (fr) => /\bfront\b/i.test(fr) && !/menton/i.test(fr) },
	{ name: 'kh→fr : ឆ្ងល់ = se demander, pas ballonnements (audit 14/10)', author: 'Lys', text: 'អូនសុខសប្បាយជាធម្មតាទេបង តែឆ្ងល់២ថ្ងៃហើយ អូនចេះតែឃ្លានមិនឈប់សោះ',
		check: () => true, checkFrEn: (fr) => !/ballonn/i.test(fr) && /demand|bizarre|étrang|intrigu|étonn|curieu/i.test(fr) },
	{ name: 'kh→fr : ឆ្ងន់ (typo de ឆ្ងាញ់) = délicieux, pas difficile (audit 14/10)', author: 'Lys', text: 'មែនហើយបងវាឆ្ងន់ខ្លាំងណាស់',
		check: () => true, checkFrEn: (fr) => /délicieu|bon/i.test(fr) && !/difficile/i.test(fr) },
	{ name: '"monte de 20€" → បន្ថែម, pas un mot douteux (bug réel 19/10)', author: 'Chet', text: "en vrai, si on monte encore de 20€, on peut y aller fin novembre",
		check: (kh) => kh.includes('បន្ថែម') && !kh.includes('បង្អើល') },
	{ name: '"entre les deux" → ចន្លោះ, pas "parmi ces deux" (bug réel 19/10)', author: 'Chet', text: "entre les deux, c'est trop cher xD",
		check: (kh) => kh.includes('ចន្លោះ') && !kh.includes('ចំណោមពីរ') },
	{ name: '"billet d\'avion" → សំបុត្រយន្តហោះ, pas un mot inventé (bug réel 19/10)', author: 'Chet', text: "que ce soit ton billet d'avion ou les billets pour DisneyLand Paris, je les ai payés",
		check: (kh) => /សំបុត្រ(?:យន្តហោះ|ជើងហោះ)/.test(kh) && !kh.includes('ហ្មួង') },
	{ name: '"payé en 4 fois" → បង់រំលស់/៤ដង, pas ជាដាច់ (bug réel 19/10)', author: 'Chet', text: "je les ai payés en 4 fois pour pouvoir tout prendre, je termine de tout payer en Janvier",
		check: (kh) => /រំលស់|[4៤]\s*ដង|បួនដង/.test(kh) && !kh.includes('ជាដាច់') },
	{
		// Bug réel du 25/09/2026 : "couverture" absent du glossaire → mot inventé différent à chaque
		// essai ("ភ្លុងវី", "គ្រែងរុំ"...), jamais ភួយ (le vrai mot). Ajouté au GLOSSARY.
		name: '"couverture" (lit) → ភួយ, pas un mot inventé (bug réel)', author: 'Chet',
		text: "tu as attrapé froid aussi ? tu avais le ventilateur sur toi sans couverture ?",
		check: (kh) => kh.includes('ភួយ'),
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
	{
		name: 'kh→fr : "បងគិតដូចអូនទេ" = c\'est ELLE qui demande « tu penses comme moi ? » (bug réel 19/10)', author: 'Lys',
		text: 'បងគិតដូចអូនទេ គ្មានពេលណាហត់ជាងពេលដែលយើងរស់នៅជាមួយមនុស្សដែលមិនយល់ពីយើង',
		check: () => true,
		checkFrEn: (fr, en) => !/^\W*je pense (pareil|comme|la même)/i.test(fr) && /\b(tu|toi)\b/i.test(fr.split(/[.,;]/)[0]) && /\byou\b/i.test(en.split(/[.,;]/)[0]),
	},

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

// ── cas « boutique » khmer→fr/en (Lys tient une boutique ; bug réel 12-13/10/2026 : លក់ rendu « dormir »).
// Le vocabulaire commerce (vendre, client, commande, livraison, stock, prix, caisse) est celui où les
// modèles légers dérapent. Chaque check lit le fr/en, pas le khmer (source khmer, sortie fr/en).
export const SHOP_CASES = [
	{
		name: 'boutique — លក់បានច្រើន = beaucoup vendu (jamais dormir)', author: 'Lys',
		text: 'ថ្ងៃនេះអូនលក់បានច្រើនណាស់',
		// លក់ (vendre) est le mot piégé du bug réel ; "sell/sold/sale" attendu en anglais
		check: () => true,
		checkFrEn: (fr, en) => /vend|vente/i.test(fr) && !/dorm|sommeil/i.test(fr) && /\bsold\b|\bsell|\bsales?\b/i.test(en) && !/\bslee?p|\bslept/i.test(en),
	},
	{
		name: 'boutique — អតិថិជន = clients, nombre conservé', author: 'Lys',
		text: 'ថ្ងៃនេះមានអតិថិជនបីនាក់មកហាង',
		// អតិថិជន = client ; "3 clients" ; le magasin est la boutique, pas la maison
		check: () => true,
		checkFrEn: (fr, en) => /client/i.test(fr) && /\b(3|trois)\b/i.test(fr) && /customer|client/i.test(en) && /\b(3|three)\b/i.test(en),
	},
	{
		name: 'boutique — កុម្ម៉ង់ = commande de 5 articles', author: 'Lys',
		text: 'មានភ្ញៀវម្នាក់កុម្ម៉ង់អាវប្រាំដុំ',
		// កុម្ម៉ង់ = passer commande (pas "commander quelqu'un" ni "commandement") ; 5 articles
		check: () => true,
		checkFrEn: (fr, en) => /command/i.test(fr) && /\b(5|cinq)\b/i.test(fr) && /order/i.test(en) && /\b(5|five)\b/i.test(en),
	},
	{
		name: 'boutique — ដឹកជញ្ជូន = livraison demain matin', author: 'Lys',
		text: 'ទំនិញនឹងដឹកទៅដល់ភ្ញៀវនៅព្រឹកស្អែក',
		// ដឹក = transporter/livrer ; ព្រឹកស្អែក = demain matin (piège : "ce matin")
		check: () => true,
		checkFrEn: (fr, en) => /livr/i.test(fr) && /demain/i.test(fr) && /deliver/i.test(en) && /tomorrow/i.test(en),
	},
	{
		name: 'boutique — ស្តុកនៅសល់តិច / ដាច់ស្តុក = stock presque épuisé, rupture', author: 'Lys',
		text: 'ស្តុកអាវនៅសល់តិចហើយ ទំហំធំដាច់ស្តុកហើយ',
		// ដាច់ស្តុក = rupture de stock (ដាច់ = être épuisé ici, pas "coupé" ni "dormir")
		check: () => true,
		checkFrEn: (fr, en) => /stock/i.test(fr) && /rupture|épuis|plus de|fini/i.test(fr) && /stock/i.test(en) && /out of stock|sold out|run out|ran out/i.test(en) && !/dorm|sommeil/i.test(fr),
	},
	{
		name: 'boutique — បញ្ចុះតម្លៃ = réduction de 10 %', author: 'Lys',
		text: 'អូនបញ្ចុះតម្លៃដប់ភាគរយឲ្យភ្ញៀវនេះ',
		// បញ្ចុះតម្លៃ = baisser le prix / remise ; ដប់ភាគរយ = 10 % (nombre en lettres khmères)
		check: () => true,
		checkFrEn: (fr, en) => /réduc|remise|rabais|baiss/i.test(fr) && /\b10\b|dix/i.test(fr) && /discount|off/i.test(en) && /\b10\b|ten/i.test(en),
	},
	{
		name: 'boutique — លុយចូលបាន 50 ដុល្លារ = 50 $ encaissés', author: 'Lys',
		text: 'ថ្ងៃនេះលុយចូលបានហាសិបដុល្លារ',
		// លុយចូល = l\'argent rentré en caisse ; ហាសិប = 50 ; ដុល្លារ = dollars (pas "monnaie"/"poupée")
		check: () => true,
		checkFrEn: (fr, en) => /argent|caisse|encaiss|gagn|recett|rentr|vente/i.test(fr) && /\b50\b|cinquante/i.test(fr) && /dollar|\$/i.test(fr) && /\b50\b|fifty/i.test(en) && /dollar|\$/i.test(en),
	},
	{
		name: 'boutique — phrase réelle : bien vendu, 3 clients, peu de stock', author: 'Lys',
		text: 'ថ្ងៃនេះអូនលក់ដាច់ណាស់ មានអតិថិជនបីនាក់មកទិញ ហើយស្តុកនៅសល់តិចទេ',
		// l\'esprit du bug réel dans un message complet : vendre + clients + stock, aucune dérive "sommeil"
		check: () => true,
		checkFrEn: (fr, en) => /vend|vente/i.test(fr) && /client/i.test(fr) && /\b(3|trois)\b/i.test(fr) && /stock/i.test(fr) && !/dorm|sommeil/i.test(fr)
			&& /customer|client/i.test(en) && /stock/i.test(en) && !/\bslee?p|\bslept/i.test(en),
	},
]
