/** Une seule URL blob: vivante à la fois : la précédente est révoquée dès qu'on en pose une autre (ou à clear()). */
export function createBlobUrlHolder() {
	let url: string | null = null;
	return {
		get url() { return url; },
		set(blob: Blob): string {
			if (url) URL.revokeObjectURL(url);
			url = URL.createObjectURL(blob);
			return url;
		},
		clear() {
			if (url) URL.revokeObjectURL(url);
			url = null;
		}
	};
}
