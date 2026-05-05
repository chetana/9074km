type Client = { controller: ReadableStreamDefaultController<Uint8Array>; remove: () => void }

const rooms = new Map<string, Set<Client>>()
const encoder = new TextEncoder()

export function addClient(date: string, controller: ReadableStreamDefaultController<Uint8Array>): () => void {
  if (!rooms.has(date)) rooms.set(date, new Set())
  const client: Client = {
    controller,
    remove: () => {
      rooms.get(date)?.delete(client)
      if (rooms.get(date)?.size === 0) rooms.delete(date)
    },
  }
  rooms.get(date)!.add(client)
  return client.remove
}

export function broadcast(date: string, event: object) {
  const room = rooms.get(date)
  if (!room || room.size === 0) return
  const data = encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
  for (const client of room) {
    try { client.controller.enqueue(data) }
    catch { client.remove() }
  }
}
