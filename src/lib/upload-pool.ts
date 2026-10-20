/** map à concurrence bornée, ordre des résultats conservé ; une erreur de `fn` n'interrompt pas les autres. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
	const out: PromiseSettledResult<R>[] = new Array(items.length);
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const i = next++;
			try {
				out[i] = { status: 'fulfilled', value: await fn(items[i], i) };
			} catch (reason) {
				out[i] = { status: 'rejected', reason };
			}
		}
	};
	await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
	return out;
}
