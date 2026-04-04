// Injecté par Vite au build (voir vite.config.ts define.__APP_VERSION__)
declare const __APP_VERSION__: string;
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
