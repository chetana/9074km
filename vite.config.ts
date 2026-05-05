import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
	optimizeDeps: {
		exclude: ['@ricky0123/vad-web', 'onnxruntime-web'],
	},
	plugins: [
		sveltekit(),
		VitePWA({
			registerType: 'autoUpdate',
			manifest: false,
			workbox: {
				globPatterns: ['**/*.{js,css,ico,png,svg,webp}'],
				navigateFallback: null,
				importScripts: ['/push-sw.js'],
			}
		}),
		viteStaticCopy({
			targets: [
				{ src: 'node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js', dest: './' },
				{ src: 'node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx', dest: './' },
				{ src: 'node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx', dest: './' },
				{ src: 'node_modules/onnxruntime-web/dist/*.wasm', dest: './' },
				{ src: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs', dest: './' },
			]
		})
	]
});
