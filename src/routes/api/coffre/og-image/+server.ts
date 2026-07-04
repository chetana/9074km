import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { signedGetUrl } from '$lib/server/gcs'
import sharp from 'sharp'

// AI-DEV: Endpoint public — intentionnellement sans requireAuth().
// Appelé par les bots Telegram/WhatsApp/Facebook pour générer la preview OG.
// Ne pas ajouter d'auth ici, sinon les previews de partage ne fonctionneront plus.
export const GET: RequestHandler = async ({ url }) => {
  const path = url.searchParams.get('path') ?? ''
  if (!path) throw error(400, 'path is required')

  const gcsUrl = await signedGetUrl(path)
  const response = await fetch(gcsUrl)
  if (!response.ok) throw error(502, 'Failed to fetch image from GCS')

  const buffer = Buffer.from(await response.arrayBuffer())

  const wParam = parseInt(url.searchParams.get('w') ?? '', 10)
  const width = (!isNaN(wParam) && wParam > 0 && wParam <= 2000) ? wParam : 1200
  const isThumb = width <= 600

  const jpeg = await sharp(buffer)
    .resize(isThumb
      ? { width, height: width, fit: 'cover', position: 'centre', withoutEnlargement: true }
      : { width, withoutEnlargement: true }
    )
    .jpeg({ quality: width <= 400 ? 80 : 85 })
    .toBuffer()

  return new Response(jpeg, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
      'Content-Length': jpeg.length.toString(),
    }
  })
}
