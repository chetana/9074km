export class Semaphore {
	private active = 0;
	private queue: Array<() => void> = [];

	constructor(private max: number) {}

	acquire(): Promise<void> {
		if (this.active < this.max) {
			this.active++;
			return Promise.resolve();
		}
		return new Promise<void>((resolve) => {
			this.queue.push(resolve);
		});
	}

	release(): void {
		this.active--;
		const next = this.queue.shift();
		if (next) {
			this.active++;
			next();
		}
	}

	async run<T>(fn: () => Promise<T>): Promise<T> {
		await this.acquire();
		try {
			return await fn();
		} finally {
			this.release();
		}
	}
}
