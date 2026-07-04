// Squelette curriculum CEFR français A1 → B1 pour Lys (khmère apprenant le français).
// Structure FIXE (paliers/unités/objectifs) — les exercices sont générés dynamiquement par Gemini.
// 24 unités, 8 par palier. L'ordre = la progression : une unité débloque la suivante.

export type CefrLevel = 'A1' | 'A2' | 'B1'

export interface Unit {
	id: string                 // 'a1-1', stable — clé de progression
	level: CefrLevel
	order: number              // ordre global 1..24
	icon: string               // emoji affiché sur le nœud
	title_fr: string
	title_kh: string
	grammar: string            // focus grammatical (sert de prompt à Gemini)
	theme: string              // champ lexical (sert de prompt à Gemini)
	canDo_fr: string           // "can-do statement" CEFR — objectif concret
	canDo_kh: string
	seedVocab: string[]        // mots-graines FR que Gemini étendra en exercices
}

export interface LevelMeta {
	level: CefrLevel
	label_fr: string
	label_kh: string
	subtitle_fr: string
	color: string              // couleur d'accent du palier sur la carte
}

export const LEVEL_META: LevelMeta[] = [
	{ level: 'A1', label_fr: 'Découverte',  label_kh: 'ការរកឃើញ',  subtitle_fr: 'Les premiers mots',     color: '#58C4DC' },
	{ level: 'A2', label_fr: 'Survie',      label_kh: 'ការរស់រាន',  subtitle_fr: 'Le quotidien',          color: '#7BC86C' },
	{ level: 'B1', label_fr: 'Seuil',       label_kh: 'កម្រិតមធ្យម', subtitle_fr: 'S\'exprimer librement',  color: '#F2A0B8' },
]

export const CURRICULUM: Unit[] = [
	// ─────────────────────────── A1 — Découverte ───────────────────────────
	{
		id: 'a1-1', level: 'A1', order: 1, icon: '👋',
		title_fr: 'Se présenter', title_kh: 'ការណែនាំខ្លួន',
		grammar: 'verbe être (je suis, tu es), pronoms sujets je/tu', theme: 'salutations, nom, nationalité',
		canDo_fr: 'Je peux dire bonjour et dire qui je suis',
		canDo_kh: 'ខ្ញុំអាចស្វាគមន៍ និងប្រាប់ថាខ្ញុំជានរណា',
		seedVocab: ['bonjour', 'salut', 'je suis', 'tu es', "je m'appelle", 'enchanté', 'au revoir', 'merci'],
	},
	{
		id: 'a1-2', level: 'A1', order: 2, icon: '🔢',
		title_fr: 'Les nombres et l\'heure', title_kh: 'លេខ និងម៉ោង',
		grammar: 'nombres 0-100, "il est ... heures"', theme: 'compter, dire l\'heure, l\'âge',
		canDo_fr: 'Je peux compter et dire l\'heure',
		canDo_kh: 'ខ្ញុំអាចរាប់លេខ និងប្រាប់ម៉ោង',
		seedVocab: ['un', 'deux', 'trois', 'dix', 'vingt', 'cent', 'quelle heure', 'midi', 'minuit'],
	},
	{
		id: 'a1-3', level: 'A1', order: 3, icon: '👨‍👩‍👧',
		title_fr: 'La famille', title_kh: 'គ្រួសារ',
		grammar: 'adjectifs possessifs (mon, ma, mes, ton, ta, tes)', theme: 'membres de la famille',
		canDo_fr: 'Je peux parler de ma famille',
		canDo_kh: 'ខ្ញុំអាចនិយាយអំពីគ្រួសាររបស់ខ្ញុំ',
		seedVocab: ['mère', 'père', 'frère', 'sœur', 'mon', 'ma', 'mes', 'mari', 'femme', 'enfant'],
	},
	{
		id: 'a1-4', level: 'A1', order: 4, icon: '🔤',
		title_fr: 'Articles et genre', title_kh: 'អត្ថបទ និងភេទនាម',
		grammar: 'articles définis/indéfinis (le, la, les, un, une, des), genre des noms', theme: 'objets du quotidien',
		canDo_fr: 'Je peux nommer les objets autour de moi',
		canDo_kh: 'ខ្ញុំអាចហៅឈ្មោះវត្ថុនៅជុំវិញខ្ញុំ',
		seedVocab: ['le', 'la', 'les', 'un', 'une', 'des', 'maison', 'table', 'livre', 'porte'],
	},
	{
		id: 'a1-5', level: 'A1', order: 5, icon: '🎯',
		title_fr: 'Le présent (verbes en -er)', title_kh: 'បច្ចុប្បន្នកាល (-er)',
		grammar: 'présent des verbes du 1er groupe (parler, aimer, habiter)', theme: 'actions quotidiennes',
		canDo_fr: 'Je peux décrire ce que je fais',
		canDo_kh: 'ខ្ញុំអាចពណ៌នាអ្វីដែលខ្ញុំធ្វើ',
		seedVocab: ['parler', 'aimer', 'habiter', 'travailler', 'manger', 'regarder', 'écouter', 'jouer'],
	},
	{
		id: 'a1-6', level: 'A1', order: 6, icon: '🙋',
		title_fr: 'Avoir et exprimer ses besoins', title_kh: 'កិរិយា avoir និងតម្រូវការ',
		grammar: 'verbe avoir, expressions "j\'ai faim/soif/froid"', theme: 'sensations, besoins',
		canDo_fr: 'Je peux dire ce dont j\'ai besoin',
		canDo_kh: 'ខ្ញុំអាចប្រាប់ពីអ្វីដែលខ្ញុំត្រូវការ',
		seedVocab: ['avoir', "j'ai", 'faim', 'soif', 'froid', 'chaud', 'sommeil', 'besoin', 'peur'],
	},
	{
		id: 'a1-7', level: 'A1', order: 7, icon: '🍽️',
		title_fr: 'La nourriture', title_kh: 'អាហារ',
		grammar: 'articles partitifs (du, de la, des), "je voudrais"', theme: 'aliments, au restaurant',
		canDo_fr: 'Je peux commander à manger',
		canDo_kh: 'ខ្ញុំអាចកម្ម៉ង់អាហារ',
		seedVocab: ['pain', 'eau', 'riz', 'poulet', 'fruit', 'café', 'je voudrais', 'l\'addition', 'délicieux'],
	},
	{
		id: 'a1-8', level: 'A1', order: 8, icon: '🎨',
		title_fr: 'Décrire (couleurs, adjectifs)', title_kh: 'ការពណ៌នា',
		grammar: 'accord des adjectifs (grand/grande), place de l\'adjectif', theme: 'couleurs, descriptions simples',
		canDo_fr: 'Je peux décrire une personne ou une chose',
		canDo_kh: 'ខ្ញុំអាចពណ៌នាមនុស្ស ឬវត្ថុ',
		seedVocab: ['rouge', 'bleu', 'grand', 'petit', 'beau', 'joli', 'nouveau', 'vieux', 'content'],
	},

	// ─────────────────────────── A2 — Survie ───────────────────────────
	{
		id: 'a2-1', level: 'A2', order: 9, icon: '⏪',
		title_fr: 'Le passé composé (avoir)', title_kh: 'អតីតកាល (avoir)',
		grammar: 'passé composé avec auxiliaire avoir, participes passés', theme: 'raconter une journée',
		canDo_fr: 'Je peux raconter ce que j\'ai fait',
		canDo_kh: 'ខ្ញុំអាចនិយាយអំពីអ្វីដែលខ្ញុំបានធ្វើ',
		seedVocab: ["j'ai mangé", "j'ai vu", "j'ai fait", 'hier', 'ce matin', 'fini', 'pris', 'dit'],
	},
	{
		id: 'a2-2', level: 'A2', order: 10, icon: '🚶',
		title_fr: 'Le passé composé (être)', title_kh: 'អតីតកាល (être)',
		grammar: 'passé composé avec être, accord du participe', theme: 'déplacements, événements',
		canDo_fr: 'Je peux dire où je suis allé(e)',
		canDo_kh: 'ខ្ញុំអាចប្រាប់ថាខ្ញុំបានទៅណា',
		seedVocab: ['je suis allé', 'je suis parti', 'venu', 'arrivé', 'resté', 'sorti', 'rentré', 'né'],
	},
	{
		id: 'a2-3', level: 'A2', order: 11, icon: '⏩',
		title_fr: 'Le futur proche', title_kh: 'អនាគតកាលជិត',
		grammar: 'aller + infinitif (je vais manger)', theme: 'projets, intentions',
		canDo_fr: 'Je peux parler de mes projets',
		canDo_kh: 'ខ្ញុំអាចនិយាយអំពីគម្រោងរបស់ខ្ញុំ',
		seedVocab: ['je vais', 'tu vas', 'demain', 'bientôt', 'ce soir', 'la semaine prochaine', 'partir', 'voir'],
	},
	{
		id: 'a2-4', level: 'A2', order: 12, icon: '🌅',
		title_fr: 'La routine quotidienne', title_kh: 'ទម្លាប់ប្រចាំថ្ងៃ',
		grammar: 'verbes pronominaux (se lever, se coucher), "d\'abord, ensuite"', theme: 'journée type',
		canDo_fr: 'Je peux décrire ma journée',
		canDo_kh: 'ខ្ញុំអាចពណ៌នាថ្ងៃរបស់ខ្ញុំ',
		seedVocab: ['se lever', 'se laver', 'se coucher', "s'habiller", "d'abord", 'ensuite', 'après', 'puis'],
	},
	{
		id: 'a2-5', level: 'A2', order: 13, icon: '🛒',
		title_fr: 'Faire les courses', title_kh: 'ការទិញឥវ៉ាន់',
		grammar: 'quantités (un kilo de, beaucoup de, un peu de), combien', theme: 'marché, magasin, argent',
		canDo_fr: 'Je peux faire des achats',
		canDo_kh: 'ខ្ញុំអាចទិញឥវ៉ាន់',
		seedVocab: ['combien', 'cher', 'un kilo', 'beaucoup', 'un peu', 'l\'argent', 'payer', 'acheter'],
	},
	{
		id: 'a2-6', level: 'A2', order: 14, icon: '🧭',
		title_fr: 'Demander son chemin', title_kh: 'ការសួរផ្លូវ',
		grammar: 'impératif (tournez, allez), prépositions de lieu', theme: 'ville, directions',
		canDo_fr: 'Je peux demander et indiquer un chemin',
		canDo_kh: 'ខ្ញុំអាចសួរ និងបង្ហាញផ្លូវ',
		seedVocab: ['à gauche', 'à droite', 'tout droit', 'où est', 'la rue', 'à côté de', 'près de', 'loin'],
	},
	{
		id: 'a2-7', level: 'A2', order: 15, icon: '🌦️',
		title_fr: 'Le temps et les saisons', title_kh: 'អាកាសធាតុ និងរដូវ',
		grammar: 'expressions impersonnelles (il fait, il pleut), "quand"', theme: 'météo, saisons',
		canDo_fr: 'Je peux parler du temps qu\'il fait',
		canDo_kh: 'ខ្ញុំអាចនិយាយអំពីអាកាសធាតុ',
		seedVocab: ['il fait beau', 'il pleut', 'il fait chaud', 'le soleil', 'la pluie', "l'été", "l'hiver", 'le vent'],
	},
	{
		id: 'a2-8', level: 'A2', order: 16, icon: '⚖️',
		title_fr: 'Comparer', title_kh: 'ការប្រៀបធៀប',
		grammar: 'comparatif (plus/moins/aussi ... que), superlatif', theme: 'préférences, opinions simples',
		canDo_fr: 'Je peux comparer des choses',
		canDo_kh: 'ខ្ញុំអាចប្រៀបធៀបវត្ថុ',
		seedVocab: ['plus que', 'moins que', 'aussi que', 'meilleur', 'le plus', 'préférer', 'comme', 'mieux'],
	},

	// ─────────────────────────── B1 — Seuil ───────────────────────────
	{
		id: 'b1-1', level: 'B1', order: 17, icon: '🎞️',
		title_fr: 'L\'imparfait', title_kh: 'អតីតកាលមិនបញ្ចប់',
		grammar: 'formation et emploi de l\'imparfait (description, habitude passée)', theme: 'souvenirs, enfance',
		canDo_fr: 'Je peux décrire le passé',
		canDo_kh: 'ខ្ញុំអាចពណ៌នាអតីតកាល',
		seedVocab: ['j\'étais', 'il y avait', 'je faisais', 'quand j\'étais petit', 'avant', 'souvent', 'toujours', 'autrefois'],
	},
	{
		id: 'b1-2', level: 'B1', order: 18, icon: '🔀',
		title_fr: 'Imparfait vs passé composé', title_kh: 'imparfait ទល់នឹង passé composé',
		grammar: 'opposition description (imparfait) / action (passé composé)', theme: 'raconter une histoire',
		canDo_fr: 'Je peux raconter un souvenir précis',
		canDo_kh: 'ខ្ញុំអាចនិទានរឿងអតីត',
		seedVocab: ['pendant que', 'soudain', 'tout à coup', "c'était", "il a commencé", 'quand', 'alors', 'à ce moment'],
	},
	{
		id: 'b1-3', level: 'B1', order: 19, icon: '🚀',
		title_fr: 'Le futur simple', title_kh: 'អនាគតកាលសាមញ្ញ',
		grammar: 'formation du futur simple, futur des verbes irréguliers', theme: 'projets à long terme, promesses',
		canDo_fr: 'Je peux parler de mon avenir',
		canDo_kh: 'ខ្ញុំអាចនិយាយអំពីអនាគតរបស់ខ្ញុំ',
		seedVocab: ['je ferai', 'je serai', "j'aurai", 'j\'irai', 'un jour', "l'année prochaine", 'plus tard', 'quand je serai'],
	},
	{
		id: 'b1-4', level: 'B1', order: 20, icon: '💭',
		title_fr: 'Exprimer une opinion', title_kh: 'ការបញ្ចេញមតិ',
		grammar: 'je pense/crois/trouve que + indicatif, "à mon avis"', theme: 'débats, goûts',
		canDo_fr: 'Je peux donner mon avis',
		canDo_kh: 'ខ្ញុំអាចផ្តល់មតិរបស់ខ្ញុំ',
		seedVocab: ['je pense que', 'je crois que', 'à mon avis', 'je trouve que', "d'accord", 'peut-être', 'parce que', 'selon moi'],
	},
	{
		id: 'b1-5', level: 'B1', order: 21, icon: '🎩',
		title_fr: 'Le conditionnel et la politesse', title_kh: 'លក្ខខណ្ឌ និងសុជីវធម៌',
		grammar: 'conditionnel présent (je voudrais, pourriez-vous), hypothèse', theme: 'demandes polies, souhaits',
		canDo_fr: 'Je peux faire une demande polie et exprimer un souhait',
		canDo_kh: 'ខ្ញុំអាចស្នើសុំដោយសុភាព',
		seedVocab: ['je voudrais', 'pourriez-vous', "j'aimerais", 'ce serait', 'si je pouvais', 'au cas où', 'volontiers', 'si possible'],
	},
	{
		id: 'b1-6', level: 'B1', order: 22, icon: '🙏',
		title_fr: 'Le subjonctif (introduction)', title_kh: 'subjonctif (ការណែនាំ)',
		grammar: 'subjonctif présent après "il faut que", "je veux que"', theme: 'obligation, nécessité, émotion',
		canDo_fr: 'Je peux exprimer une nécessité ou un souhait',
		canDo_kh: 'ខ្ញុំអាចបង្ហាញពីភាពចាំបាច់',
		seedVocab: ['il faut que', 'je veux que', 'il est important que', 'que tu sois', 'que tu fasses', 'bien que', 'pour que', 'avant que'],
	},
	{
		id: 'b1-7', level: 'B1', order: 23, icon: '📖',
		title_fr: 'Raconter une histoire', title_kh: 'ការនិទានរឿង',
		grammar: 'connecteurs logiques et temporels (d\'abord, cependant, enfin)', theme: 'récit structuré, anecdotes',
		canDo_fr: 'Je peux raconter une histoire de façon fluide',
		canDo_kh: 'ខ្ញុំអាចនិទានរឿងយ៉ាងរលូន',
		seedVocab: ["d'abord", 'ensuite', 'puis', 'cependant', 'pourtant', 'enfin', 'donc', 'finalement'],
	},
	{
		id: 'b1-8', level: 'B1', order: 24, icon: '🔗',
		title_fr: 'Les pronoms relatifs', title_kh: 'សព្វនាមជាប់ទាក់ទង',
		grammar: 'pronoms relatifs qui, que, où, dont', theme: 'phrases complexes, préciser',
		canDo_fr: 'Je peux faire des phrases longues et précises',
		canDo_kh: 'ខ្ញុំអាចបង្កើតប្រយោគវែង និងច្បាស់លាស់',
		seedVocab: ['qui', 'que', 'où', 'dont', "celui qui", "la chose que", "le jour où", 'ce qui'],
	},
]

// ── Helpers ──────────────────────────────────────────────────────────────

export function unitsByLevel(level: CefrLevel): Unit[] {
	return CURRICULUM.filter(u => u.level === level)
}

export function getUnit(id: string): Unit | undefined {
	return CURRICULUM.find(u => u.id === id)
}

export function levelMeta(level: CefrLevel): LevelMeta {
	return LEVEL_META.find(m => m.level === level) ?? LEVEL_META[0]
}

/** Première unité non terminée = unité courante. Tout est terminé → dernière unité. */
export function currentUnitId(completed: string[]): string {
	const done = new Set(completed)
	const next = CURRICULUM.find(u => !done.has(u.id))
	return next?.id ?? CURRICULUM[CURRICULUM.length - 1].id
}

/** Une unité est débloquée si elle est terminée OU si c'est l'unité courante. */
export function isUnlocked(unitId: string, completed: string[]): boolean {
	if (completed.includes(unitId)) return true
	return unitId === currentUnitId(completed)
}

export function progressPct(completed: string[]): number {
	return Math.round((completed.length / CURRICULUM.length) * 100)
}
