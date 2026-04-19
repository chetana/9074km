import type { LogtoClient, UserInfoResponse } from '@logto/sveltekit';

// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Locals {
			logtoClient: LogtoClient;
			user?: UserInfoResponse;
			dbUser?: {
				id: number;
				email: string;
				name: string;
				picture: string;
			};
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
