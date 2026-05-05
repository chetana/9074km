import type { RequestHandler } from './$types'
import { requireAuth } from '$lib/server/auth'
import { addClient } from '$lib/server/sse'

const KEEPALIVE_MS = 25_000 // ping toutes les 25s — évite le timeout Cloud Run (60s par défaut)

export const GET: RequestHandler = async (event) => {
  const { url, request } = event
  await requireAuth(event)

  const y = url.searchParams.get('y') ?? ''
  const m = url.searchParams.get('m') ?? ''
  const d = url.searchParams.get('d') ?? ''
  const date = `${y}/${m}/${d}`

  const encoder = new TextEncoder()
  let removeClient: (() => void) | null = null
  let keepaliveTimer: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      removeClient = addClient(date, controller)

      // Ping initial pour confirmer la connexion
      controller.enqueue(encoder.encode(': connected\n\n'))

      // Keepalive périodique — SSE comment (ignoré par le client)
      keepaliveTimer = setInterval(() => {
        try { controller.enqueue(encoder.encode(': ping\n\n')) }
        catch { cleanup() }
      }, KEEPALIVE_MS)

      request.signal.addEventListener('abort', cleanup)
    },
    cancel() { cleanup() },
  })

  function cleanup() {
    if (keepaliveTimer) { clearInterval(keepaliveTimer); keepaliveTimer = null }
    removeClient?.()
    removeClient = null
  }

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // désactive le buffering nginx/proxy
    },
  })
}
