<script lang="ts">
	interface Props {
		lang: 'fr' | 'en' | 'kh' | 'gb' | 'us';
		size?: 'sm' | 'md' | 'lg';
		rounded?: boolean;
	}

	let { lang, size = 'md', rounded = true }: Props = $props();

	// Mapping lang → ISO country code pour flag-icons
	const code = $derived(
		lang === 'fr' ? 'fr' :
		lang === 'en' || lang === 'gb' ? 'gb' :
		lang === 'kh' ? 'kh' :
		lang === 'us' ? 'us' : 'un'
	);
</script>

<span
	class="fi fi-{code} flag"
	class:rounded
	class:sm={size === 'sm'}
	class:md={size === 'md'}
	class:lg={size === 'lg'}
	aria-label={lang.toUpperCase()}
	role="img"
></span>

<style>
	.flag {
		display: inline-block;
		vertical-align: text-bottom;
		flex-shrink: 0;
	}

	.sm {
		width: 1em;
		height: 0.75em;
	}

	.md {
		width: 1.3em;
		height: 1em;
	}

	.lg {
		width: 1.6em;
		height: 1.2em;
	}

	.rounded {
		border-radius: 2px;
		overflow: hidden;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
	}
</style>
