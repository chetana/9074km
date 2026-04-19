import type { RequestHandler } from './$types'
import { env } from '$env/dynamic/private'

export const GET: RequestHandler = async ({ locals, url }) => {
	const baseUrl = env.LOGTO_BASE_URL ?? url.origin
	await locals.logtoClient.signIn({
		redirectUri: `${baseUrl}/callback`,
		directSignIn: { method: 'social', target: 'google' },
	})
	// signIn() throws a redirect — unreachable
	return new Response('Redirecting...', { status: 302 })
}
