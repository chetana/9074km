<script lang="ts">
	// Étiquette typographique de langue — remplace Flag.svelte quand il s'agit de marquer une
	// LANGUE (pas un lieu). Un drapeau signale une nationalité, pas une langue (l'anglais devient
	// le Royaume-Uni) ; l'écriture khmère se reconnaît d'elle-même. Flag reste légitime sur
	// l'horloge, où il désigne bien Paris/Phnom Penh (des lieux).
	interface Props {
		lang: 'fr' | 'en' | 'kh';
	}
	let { lang }: Props = $props();
	const labels: Record<Props['lang'], string> = { fr: 'FR', en: 'EN', kh: 'ខ្មែរ' };
</script>

<span class="lang-tag" lang={lang === 'kh' ? 'km' : lang} aria-label={lang === 'fr' ? 'français' : lang === 'en' ? 'anglais' : 'khmer'}>{labels[lang]}</span>

<style>
	.lang-tag {
		display: inline-flex;
		align-items: center;
		font-family: var(--font-display);
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		color: var(--text-secondary);
		background: var(--surface-2);
		border-radius: 0.35rem;
		padding: 0.05rem 0.35rem;
		line-height: 1.4;
		flex-shrink: 0;
	}
</style>
