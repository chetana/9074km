import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { setCachedUser, getCachedUser, clearCachedUser, clearAllCache } from './localCache';

export interface User {
	name: string;
	email: string;
	picture: string;
}

export const userStore = writable<User | null>(null);
/** true une fois que auth.init() a terminé sa vérification initiale */
export const authReadyStore = writable<boolean>(false);

/**
 * Initialise l'état d'auth depuis les données chargées par `+layout.server.ts`.
 * - Si un user est présent (session Logto valide), on le stocke.
 * - Sinon, on restaure depuis le cache pour afficher les données déjà vues,
 *   puis on redirige silencieusement vers /api/auth/sign-in (directSignIn Google).
 */
export const auth = {
	init(serverUser: User | null): void {
		if (!browser) return;
		if (serverUser) {
			userStore.set(serverUser);
			setCachedUser(serverUser);
			authReadyStore.set(true);
			return;
		}
		const cached = getCachedUser();
		if (cached) {
			userStore.set({ name: cached.name, email: cached.email, picture: cached.picture });
		}
		authReadyStore.set(true);
	},

	signIn(): void {
		if (!browser) return;
		window.location.href = '/api/auth/sign-in';
	},

	signOut(): void {
		userStore.set(null);
		clearCachedUser();
		clearAllCache();
		if (browser) window.location.href = '/api/auth/sign-out';
	},

	/** Reset l'état local sans rediriger (pour 401 côté API) */
	signOutSilent(): void {
		userStore.set(null);
		if (browser) window.location.href = '/api/auth/sign-in';
	},

	getFirstName(): string {
		const user = get(userStore);
		if (!user) return '';
		return user.name.split(' ')[0];
	},
};
