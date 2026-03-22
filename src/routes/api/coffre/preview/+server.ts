import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ url, request }) => {
  const y = url.searchParams.get('y') ?? ''
  const m = url.searchParams.get('m') ?? ''
  const d = url.searchParams.get('d') ?? ''
  const f = url.searchParams.get('f') ?? ''
  if (!y || !m || !d || !f) throw error(400, 'y, m, d, f are required')

  const origin = new URL(request.url).origin
  const path = `${y}/${m}/${d}/${f}`
  const appUrl = `${origin}/coffre?y=${y}&m=${m}&d=${d}&f=${encodeURIComponent(f)}`
  const appUrlHtml = appUrl.replace(/&/g, '&amp;')
  const ogImageUrl = `${origin}/api/coffre/og-image?path=${encodeURIComponent(path)}`
  const ogImageUrlHtml = ogImageUrl.replace(/&/g, '&amp;')
  const imgUrl = `${origin}/api/coffre/og-image?path=${encodeURIComponent(path)}&w=1200`
  const imgUrlHtml = imgUrl.replace(/&/g, '&amp;')

  const monthsFr = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
  const monthName = monthsFr[parseInt(m, 10) - 1] ?? m
  const title = `Chet & Lys — ${parseInt(d, 10)} ${monthName} ${y}`

  return new Response(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Chet &amp; Lys">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="Un souvenir partagé · ការចងចាំរួម">
  <meta property="og:image" content="${ogImageUrlHtml}">
  <meta name="twitter:card" content="summary_large_image">
  <meta property="og:url" content="${appUrlHtml}">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; background: #0F0F1A; color: #E8E8F0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .page { display: flex; flex-direction: column; height: 100dvh; }
    .photo { flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #000; }
    .photo img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
    .footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; padding-bottom: max(12px, env(safe-area-inset-bottom)); background: #1E1E30; border-top: 1px solid rgba(232,164,184,0.3); flex-shrink: 0; }
    .meta { display: flex; flex-direction: column; gap: 2px; }
    .meta-title { font-size: 14px; font-weight: 600; color: #E8A4B8; }
    .meta-date { font-size: 12px; color: #9090A0; }
    .btn { display: flex; align-items: center; gap: 8px; background: #1E1E30; border: 1px solid rgba(232,164,184,0.3); border-radius: 20px; padding: 10px 16px; font-size: 13px; color: #E8E8F0; text-decoration: none; white-space: nowrap; }
    .btn:hover { border-color: #E8A4B8; }
  </style>
</head>
<body>
  <div class="page">
    <div class="photo"><img src="${imgUrlHtml}" alt="${title}" /></div>
    <div class="footer">
      <div class="meta">
        <span class="meta-title">Chet &amp; Lys</span>
        <span class="meta-date">${parseInt(d, 10)} ${monthName} ${y}</span>
      </div>
      <a class="btn" href="${appUrlHtml}">Ouvrir le coffre · ប្រអប់</a>
    </div>
  </div>
</body>
</html>`, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    }
  })
}
