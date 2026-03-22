import { Storage } from '@google-cloud/storage'
import { createHash, createSign } from 'crypto'

function getCredentials() {
  const raw = process.env.GCS_SERVICE_ACCOUNT_JSON!.trim()
  // gcloud --env-vars-file uses YAML single-quoted strings where \n is literal backslash+n.
  // Strip \n sequences outside of JSON string values (structural whitespace from pretty-printing).
  let fixed = ''
  let inString = false
  let i = 0
  while (i < raw.length) {
    if (inString && raw[i] === '\\') {
      fixed += raw[i++]
      if (i < raw.length) fixed += raw[i++]
      continue
    }
    if (raw[i] === '"') inString = !inString
    if (!inString && raw[i] === '\\' && raw[i + 1] === 'n') { i += 2; continue }
    fixed += raw[i++]
  }
  const creds = JSON.parse(fixed)
  creds.private_key = (creds.private_key as string).replace(/\\n/g, '\n').trim() + '\n'
  creds.client_email = (creds.client_email as string).trim()
  return creds
}

export function getGcsBucket() {
  const creds = getCredentials()
  return new Storage({ credentials: creds }).bucket(process.env.GCS_BUCKET_NAME!.trim())
}

function buildSignedUrl(path: string, method: 'PUT' | 'GET', expiresSeconds: number, contentType?: string): string {
  const creds = getCredentials()
  const bucket = process.env.GCS_BUCKET_NAME!.trim()
  const now = new Date()

  const pad = (n: number) => n.toString().padStart(2, '0')
  const date = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`
  const datetime = `${date}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`

  const serviceAccount: string = creds.client_email
  const scope = `${date}/auto/storage/goog4_request`
  const credential = `${serviceAccount}/${scope}`

  const signedHeaders = method === 'PUT' ? 'content-type;host' : 'host'
  const canonicalHeaders = method === 'PUT'
    ? `content-type:${contentType}\nhost:storage.googleapis.com\n`
    : `host:storage.googleapis.com\n`

  const qs = [
    'X-Goog-Algorithm=GOOG4-RSA-SHA256',
    `X-Goog-Credential=${encodeURIComponent(credential)}`,
    `X-Goog-Date=${datetime}`,
    `X-Goog-Expires=${expiresSeconds}`,
    `X-Goog-SignedHeaders=${encodeURIComponent(signedHeaders)}`,
  ].join('&')

  const canonicalRequest = [method, `/${bucket}/${path}`, qs, canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n')
  const hash = createHash('sha256').update(canonicalRequest).digest('hex')
  const stringToSign = `GOOG4-RSA-SHA256\n${datetime}\n${scope}\n${hash}`
  const signature = createSign('RSA-SHA256').update(stringToSign).sign(creds.private_key, 'hex')

  return `https://storage.googleapis.com/${bucket}/${path}?${qs}&X-Goog-Signature=${signature}`
}

export const signedPutUrl = (path: string, contentType: string) => buildSignedUrl(path, 'PUT', 900, contentType)
export const signedGetUrl = (path: string) => buildSignedUrl(path, 'GET', 3600)
