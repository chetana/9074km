import type { PageLoad } from './$types';

export const load: PageLoad = ({ url }) => {
	return {
		y: url.searchParams.get('y'),
		m: url.searchParams.get('m'),
		d: url.searchParams.get('d'),
		f: url.searchParams.get('f'),
		// AI-DEV: origin requis pour les og:image en URL absolue (bots rejettent les URLs relatives).
		// Ne pas retirer — cassera les previews Telegram/WhatsApp/Facebook.
		origin: url.origin,
	};
};
