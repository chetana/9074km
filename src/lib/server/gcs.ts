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

// Normalise une erreur S3 "objet introuvable" au format GCS attendu par les routes (e.code === 404).
function map404(e: any): never {
  if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NoSuchKey' || e?.name === 'NotFound') {
    const err: any = new Error('Not Found'); err.code = 404; throw err
  }
  throw e
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
      try {
        const r = await client.send(new GetObjectCommand({ Bucket, Key: name }))
        return [await toBuffer(r.Body)]
      } catch (e) { map404(e) }
    },
    async delete() {
      try { await client.send(new DeleteObjectCommand({ Bucket, Key: name })) }
      catch (e) { map404(e) }
    },
    async exists(): Promise<[boolean]> {
      try { await client.send(new HeadObjectCommand({ Bucket, Key: name })); return [true] }
      catch { return [false] }
    },
  })
  return {
    file,
    // Émule bucket.getFiles GCS : renvoie [files, nextQuery, apiResponse{prefixes}].
    // Les "dossiers" (années/mois/jours) = CommonPrefixes S3, lus par les routes via apiResponse.prefixes.
    async getFiles(opts?: { prefix?: string; delimiter?: string; autoPaginate?: boolean }) {
      const out = await client.send(new ListObjectsV2Command({ Bucket, Prefix: opts?.prefix, Delimiter: opts?.delimiter }))
      const files = (out.Contents ?? []).map(o =>
        Object.assign(file(o.Key as string), {
          metadata: { size: Number(o.Size ?? 0), contentType: '', updated: o.LastModified ? new Date(o.LastModified).toISOString() : '' },
        }))
      const prefixes = (out.CommonPrefixes ?? []).map(p => p.Prefix as string)
      return [files, null, { prefixes }] as const
    },
  }
}

export const signedPutUrl = (path: string, contentType: string) =>
  getSignedUrl(s3(), new PutObjectCommand({ Bucket: BUCKET(), Key: path, ContentType: contentType }), { expiresIn: 900 })

export const signedGetUrl = (path: string) =>
  getSignedUrl(s3(), new GetObjectCommand({ Bucket: BUCKET(), Key: path }), { expiresIn: 3600 })
