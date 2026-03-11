import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

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
	userStore.set({
		name: payload['name'] as string,
		email: payload['email'] as string,
		picture: payload['picture'] as string
	});
	tokenStore.set(jwt);
	sessionStorage.setItem('chetlys_token', jwt);
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
				userStore.set({
					name: payload['name'] as string,
					email: payload['email'] as string,
					picture: payload['picture'] as string
				});
				tokenStore.set(saved);
				startExpiryWatch();
				return;
			} else {
				sessionStorage.removeItem('chetlys_token');
			}
		}
		// Try silent auto-select
		await loadGsiScript();
		initGsi(handleCredential);
		window.google!.accounts.id.prompt();
	},

	async signIn(): Promise<void> {
		if (!browser) return;
		await loadGsiScript();
		initGsi(handleCredential);
		window.google!.accounts.id.prompt((notification) => {
			// If prompt suppressed, fallback to One Tap won't show — user must retry
			if (notification?.isNotDisplayed() || notification?.isSkippedMoment()) {
				// Already handled via auto_select or dismissed
			}
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
		stopExpiryWatch();
	},

	/** Reset auth state without revoking Google (for expired/invalid tokens) */
	signOutSilent(): void {
		userStore.set(null);
		tokenStore.set(null);
		sessionStorage.removeItem('chetlys_token');
		stopExpiryWatch();
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
