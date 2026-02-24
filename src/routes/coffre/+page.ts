import type { PageLoad } from './$types';

export const load: PageLoad = ({ url }) => {
	return {
		y: url.searchParams.get('y'),
		m: url.searchParams.get('m'),
		d: url.searchParams.get('d'),
		f: url.searchParams.get('f')
	};
};
