import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'

export interface FlashCard {
  id: string; fr: string; kh: string; en?: string
  phonetic_kh?: string  // romanisation khmer pour Chet
  phonetic_fr?: string  // phonétique français pour Lys
}

const CARDS: FlashCard[] = [
  { id:  '1', fr: "Je t'aime",             kh: 'ខ្ញុំស្រឡាញ់អ្នក',       en: 'I love you',            phonetic_kh: 'khnhom srolanh neak',          phonetic_fr: 'jeu tem'               },
  { id:  '2', fr: 'Tu me manques',          kh: 'ខ្ញុំនឹកអ្នក',            en: 'I miss you',            phonetic_kh: 'khnhom neuk neak',             phonetic_fr: 'tu meu mank'           },
  { id:  '3', fr: 'Bonne nuit',             kh: 'រាត្រីសួស្តី',            en: 'Good night',            phonetic_kh: 'reatrei suostei',              phonetic_fr: 'bon nwi'               },
  { id:  '4', fr: 'Bonjour',                kh: 'អរុណសួស្តី',              en: 'Good morning',          phonetic_kh: 'arun suostei',                 phonetic_fr: 'bon-jour'              },
  { id:  '5', fr: 'Comment tu vas ?',       kh: 'អ្នកសុខសប្បាយទេ?',       en: 'How are you?',          phonetic_kh: 'neak sok sabay te?',           phonetic_fr: 'ko-man tu va'          },
  { id:  '6', fr: 'Je pense à toi',         kh: 'ខ្ញុំគិតដល់អ្នក',         en: 'Thinking of you',       phonetic_kh: 'khnhom kit dol neak',          phonetic_fr: 'jeu pans a twa'        },
  { id:  '7', fr: 'Reviens vite',           kh: 'ត្រឡប់មកឆាប់ៗ',           en: 'Come back soon',        phonetic_kh: 'trolob mok chab chab',         phonetic_fr: 'reuv-yen vit'          },
  { id:  '8', fr: 'Je suis fatigué',        kh: 'ខ្ញុំអស់កម្លាំង',         en: 'I am tired',            phonetic_kh: 'khnhom os kamlang',            phonetic_fr: 'jeu swi fati-gay'      },
  { id:  '9', fr: 'Tu es belle',            kh: 'អ្នកស្អាតណាស់',           en: 'You are beautiful',     phonetic_kh: 'neak s-at nas',                phonetic_fr: 'tu eh bel'             },
  { id: '10', fr: 'À demain',               kh: 'ជួបគ្នាថ្ងៃស្អែក',         en: 'See you tomorrow',      phonetic_kh: 'jouob knea tngai saek',        phonetic_fr: 'a deu-man'             },
  { id: '11', fr: "J'ai mangé",             kh: 'ខ្ញុំញ៉ាំហើយ',             en: 'I ate',                 phonetic_kh: 'khnhom nyam hauy',             phonetic_fr: 'jay man-jay'           },
  { id: '12', fr: "C'est délicieux",        kh: 'វាឆ្ងាញ់ណាស់',             en: "It's delicious",        phonetic_kh: 'vea chngayn nas',              phonetic_fr: 'seh day-li-syeu'       },
  { id: '13', fr: 'Je rentre à la maison',  kh: 'ខ្ញុំត្រឡប់ទៅផ្ទះ',       en: "I'm going home",        phonetic_kh: 'khnhom trolob tov pteah',      phonetic_fr: 'jeu rantr a la meh-zon'},
  { id: '14', fr: 'Fais attention',         kh: 'ប្រយ័ត្ន',                 en: 'Be careful',            phonetic_kh: 'bra-yat',                      phonetic_fr: 'feh a-tan-syon'        },
  { id: '15', fr: 'Bonne journée',          kh: 'ថ្ងៃល្អ',                 en: 'Have a good day',       phonetic_kh: 'tngai l-or',                   phonetic_fr: 'bon jour-nay'          },
  { id: '16', fr: 'Dors bien',              kh: 'ដេកលក់ស្កប់ស្កល់',         en: 'Sleep well',            phonetic_kh: 'dek lok skob skol',            phonetic_fr: 'dor byan'              },
  { id: '17', fr: 'Je suis heureux',        kh: 'ខ្ញុំសប្បាយចិត្ត',         en: 'I am happy',            phonetic_kh: 'khnhom sabay chet',            phonetic_fr: 'jeu swi eu-reu'        },
  { id: '18', fr: "J'arrive bientôt",       kh: 'ខ្ញុំមកដល់ក្នុងពេលឆាប់ៗ',  en: 'I arrive soon',         phonetic_kh: 'khnhom mok dol chab chab',     phonetic_fr: 'jar-iv byan-to'        },
  { id: '19', fr: 'Tu es mon amour',        kh: 'អ្នកជាស្នេហ៍របស់ខ្ញុំ',    en: 'You are my love',       phonetic_kh: 'neak jea sneh robos khnhom',   phonetic_fr: 'tu eh mon a-mour'      },
  { id: '20', fr: 'Prends soin de toi',     kh: 'ថែរក្សាខ្លួនឯង',           en: 'Take care of yourself', phonetic_kh: 'thae roksa kluan eng',         phonetic_fr: 'pran swan deu twa'     },
]

export const GET: RequestHandler = async ({ request }) => {
  await requireAuth(request)
  return json(CARDS)
}
