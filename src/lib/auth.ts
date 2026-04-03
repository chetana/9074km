import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { setCachedUser, getCachedUser, clearCachedUser, clearAllCache } from './localCache';

export interface User {
	name: string;
	email: string;
	picture: string;
}

export interface GoogleCredentialResponse {
	credential: string;
}

export interface GoogleAccounts {
	id: {
		initialize: (config: {
			client_id: string;
			callback: (response: GoogleCredentialResponse) => void;
			auto_select?: boolean;
			use_fedcm_for_prompt?: boolean;
		}) => void;
		prompt: (notification?: (n: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean }) => void) => void;
		renderButton: (parent: HTMLElement, options: {
			type?: string;
			theme?: string;
			size?: string;
			text?: string;
			shape?: string;
			width?: number;
		}) => void;
		disableAutoSelect: () => void;
		revoke: (hint: string, done: () => void) => void;
	};
}

declare global {
	interface Window {
		google?: { accounts: GoogleAccounts };
		__gsiLoaded?: boolean;
		__gsiCallback?: (response: GoogleCredentialResponse) => void;
	}
}

const CLIENT_ID =
	'267131866578-m6rua7ccatqno7lp0t0jscsrvsf69u4f.apps.googleusercontent.com';

export const userStore = writable<User | null>(null);
export const tokenStore = writable<string | null>(null);
/** true une fois que auth.init() a terminé sa vérification initiale */
export const authReadyStore = writable<boolean>(false);

function parseJwt(token: string): Record<string, unknown> {
	try {
		// Base64url → Base64, puis décodage UTF-8 propre (atob seul casse les accents)
		const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
		const json = decodeURIComponent(
			atob(base64).split('').map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
		);
		return JSON.parse(json);
	} catch {
		return {};
	}
}

function loadGsiScript(): Promise<void> {
	return new Promise((resolve) => {
		if (window.__gsiLoaded) { resolve(); return; }
		const script = document.createElement('script');
		script.src = 'https://accounts.google.com/gsi/client';
		script.async = true;
		script.defer = true;
		script.onload = () => { window.__gsiLoaded = true; resolve(); };
		document.head.appendChild(script);
	});
}

function initGsi(callback: (response: GoogleCredentialResponse) => void): void {
	window.google!.accounts.id.initialize({
		client_id: CLIENT_ID,
		callback,
		auto_select: true,
		use_fedcm_for_prompt: true,
	});
}

function handleCredential(response: GoogleCredentialResponse): void {
	const jwt = response.credential;
	const payload = parseJwt(jwt);
	const user = {
		name: payload['name'] as string,
		email: payload['email'] as string,
		picture: payload['picture'] as string
	};
	userStore.set(user);
	tokenStore.set(jwt);
	sessionStorage.setItem('chetlys_token', jwt);
	setCachedUser(user);
	startExpiryWatch();
}

let expiryTimer: ReturnType<typeof setInterval> | null = null;

function startExpiryWatch(): void {
	if (expiryTimer) return;
	expiryTimer = setInterval(() => {
		const token = get(tokenStore);
		if (!token) return;
		const payload = parseJwt(token);
		const exp = (payload['exp'] as number) * 1000;
		if (exp <= Date.now()) {
			auth.signOutSilent();
		}
	}, 30_000);
}

function stopExpiryWatch(): void {
	if (expiryTimer) { clearInterval(expiryTimer); expiryTimer = null; }
}

export const auth = {
	async init(): Promise<void> {
		if (!browser) return;
		// Restore from session
		const saved = sessionStorage.getItem('chetlys_token');
		if (saved) {
			const payload = parseJwt(saved);
			const exp = (payload['exp'] as number) * 1000;
			if (exp > Date.now()) {
				const user = {
					name: payload['name'] as string,
					email: payload['email'] as string,
					picture: payload['picture'] as string
				};
				userStore.set(user);
				tokenStore.set(saved);
				setCachedUser(user);
				startExpiryWatch();
				authReadyStore.set(true);
				return;
			} else {
				sessionStorage.removeItem('chetlys_token');
			}
		}
		// Token expiré / absent mais user connu en cache → restaurer le profil
		// pour afficher les données cachées immédiatement (sans token, les API
		// réseau échoueront et le cache sera servi)
		const cached = getCachedUser();
		if (cached) {
			userStore.set({ name: cached.name, email: cached.email, picture: cached.picture });
		}
		// Try silent auto-select (récupère un vrai token si possible)
		await loadGsiScript();
		initGsi(handleCredential);
		window.google!.accounts.id.prompt();
		authReadyStore.set(true);
	},

	async signIn(): Promise<void> {
		if (!browser) return;
		await loadGsiScript();
		initGsi(handleCredential);
		window.google!.accounts.id.prompt();
	},

	async renderSignInButton(container: HTMLElement): Promise<void> {
		if (!browser) return;
		await loadGsiScript();
		initGsi(handleCredential);
		window.google!.accounts.id.renderButton(container, {
			type: 'standard',
			theme: 'filled_black',
			size: 'large',
			text: 'signin_with',
			shape: 'pill',
			width: 240,
		});
	},

	signOut(): void {
		const user = get(userStore);
		if (user && window.google) {
			window.google.accounts.id.disableAutoSelect();
			window.google.accounts.id.revoke(user.email, () => {});
		}
		userStore.set(null);
		tokenStore.set(null);
		sessionStorage.removeItem('chetlys_token');
		clearCachedUser();
		clearAllCache();
		stopExpiryWatch();
	},

	/** Reset auth state without revoking Google (for expired/invalid tokens) */
	signOutSilent(): void {
		userStore.set(null);
		tokenStore.set(null);
		sessionStorage.removeItem('chetlys_token');
		stopExpiryWatch();
		// On garde le cache localStorage — le user pourra revoir les données cachées
		// après re-login silencieux (auto_select)
	},

	getToken(): string | null {
		return get(tokenStore);
	},

	getFirstName(): string {
		const user = get(userStore);
		if (!user) return '';
		return user.name.split(' ')[0];
	}
};
