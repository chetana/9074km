import type { RequestHandler } from './$types'
import { env } from '$env/dynamic/private'

export const GET: RequestHandler = async ({ locals, url }) => {
	const baseUrl = env.LOGTO_BASE_URL ?? url.origin
	await locals.logtoClient.signOut(`${baseUrl}/`)
	return new Response('Redirecting...', { status: 302 })
}
