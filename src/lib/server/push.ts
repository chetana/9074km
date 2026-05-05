import webpush from 'web-push'
import { env } from '$env/dynamic/private'
import { getGcsBucket } from './gcs'

interface PushSubscriptionRecord {
  endpoint: string
  keys: { p256dh: string; auth: string }
  author: string
  updatedAt: string
}

const SUBS_PATH = 'push/subscriptions.json'

function initVapid() {
  webpush.setVapidDetails(
    `mailto:${env.VAPID_MAILTO ?? 'chetana.yin@gmail.com'}`,
    env.VAPID_PUBLIC_KEY!,
    env.VAPID_PRIVATE_KEY!,
  )
}

async function loadSubscriptions(): Promise<PushSubscriptionRecord[]> {
  try {
    const bucket = getGcsBucket()
    const [contents] = await bucket.file(SUBS_PATH).download()
    return JSON.parse(contents.toString('utf-8'))
  } catch {
    return []
  }
}

async function saveSubscriptions(subs: PushSubscriptionRecord[]) {
  const bucket = getGcsBucket()
  await bucket.file(SUBS_PATH).save(JSON.stringify(subs), { contentType: 'application/json' })
}

export async function upsertSubscription(sub: PushSubscriptionRecord) {
  const subs = await loadSubscriptions()
  const idx = subs.findIndex(s => s.endpoint === sub.endpoint)
  if (idx >= 0) subs[idx] = sub
  else subs.push(sub)
  await saveSubscriptions(subs)
}

export async function removeSubscription(endpoint: string) {
  const subs = await loadSubscriptions()
  await saveSubscriptions(subs.filter(s => s.endpoint !== endpoint))
}

export async function sendPushToOthers(senderAuthor: string, payload: { title: string; body: string; url?: string }) {
  const subs = await loadSubscriptions()
  const targets = subs.filter(s => s.author !== senderAuthor)
  if (targets.length === 0) return

  initVapid()
  const data = JSON.stringify({ title: payload.title, body: payload.body, url: payload.url ?? '/chat' })
  const dead: string[] = []

  await Promise.allSettled(targets.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, data)
    } catch (e: any) {
      if (e?.statusCode === 410 || e?.statusCode === 404) dead.push(s.endpoint)
    }
  }))

  if (dead.length > 0) {
    const cleaned = subs.filter(s => !dead.includes(s.endpoint))
    await saveSubscriptions(cleaned)
  }
}
