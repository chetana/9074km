// Stockage objet — Scaleway Object Storage (S3-compatible).
// Migré depuis @google-cloud/storage : adaptateur minimal imitant l'API Bucket GCS
// (sous-ensemble utilisé par lys : file().save/download/delete/exists, getFiles) + presigned URLs SigV4.
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from '$env/dynamic/private'

const BUCKET = () => (env.GCS_BUCKET_NAME ?? '').replace(/\\n/g, '').trim()

function s3() {
  return new S3Client({
    region: (env.S3_REGION ?? 'fr-par').trim(),
    endpoint: (env.S3_ENDPOINT ?? 'https://s3.fr-par.scw.cloud').trim(),
    forcePathStyle: true,
    credentials: {
      accessKeyId: (env.S3_ACCESS_KEY ?? '').trim(),
      secretAccessKey: (env.S3_SECRET_KEY ?? '').trim(),
    },
  })
}

async function toBuffer(body: any): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const c of body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(c))
  return Buffer.concat(chunks)
}

export function getGcsBucket() {
  const client = s3()
  const Bucket = BUCKET()
  const file = (name: string) => ({
    name,
    async save(data: string | Buffer | Uint8Array, opts?: { contentType?: string; metadata?: { contentType?: string } }) {
      const ContentType = opts?.contentType ?? opts?.metadata?.contentType
      await client.send(new PutObjectCommand({ Bucket, Key: name, Body: data as any, ContentType }))
    },
    async download(): Promise<[Buffer]> {
      const r = await client.send(new GetObjectCommand({ Bucket, Key: name }))
      return [await toBuffer(r.Body)]
    },
    async delete() {
      await client.send(new DeleteObjectCommand({ Bucket, Key: name }))
    },
    async exists(): Promise<[boolean]> {
      try { await client.send(new HeadObjectCommand({ Bucket, Key: name })); return [true] }
      catch { return [false] }
    },
  })
  return {
    file,
    async getFiles(opts?: { prefix?: string; delimiter?: string; autoPaginate?: boolean }) {
      const out = await client.send(new ListObjectsV2Command({ Bucket, Prefix: opts?.prefix, Delimiter: opts?.delimiter }))
      const files = (out.Contents ?? []).map(o =>
        Object.assign(file(o.Key as string), { metadata: { size: Number(o.Size ?? 0), contentType: '' } }))
      return [files] as const
    },
  }
}

export const signedPutUrl = (path: string, contentType: string) =>
  getSignedUrl(s3(), new PutObjectCommand({ Bucket: BUCKET(), Key: path, ContentType: contentType }), { expiresIn: 900 })

export const signedGetUrl = (path: string) =>
  getSignedUrl(s3(), new GetObjectCommand({ Bucket: BUCKET(), Key: path }), { expiresIn: 3600 })
