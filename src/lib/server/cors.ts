const CARD_GAME_ORIGINS = [
  'https://card-game-267131866578.europe-west1.run.app',
  'https://cards.chetana.dev',
  'http://localhost:5174',
]

export function cardGameCors(origin: string | null): Record<string, string> {
  const allowed = origin && CARD_GAME_ORIGINS.includes(origin) ? origin : ''
  if (!allowed) return {}
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  }
}
