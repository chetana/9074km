import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
	plugins: [
		sveltekit(),
		VitePWA({
			registerType: 'autoUpdate',
			manifest: false,
			workbox: {
				globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}']
			}
		})
	]
});
