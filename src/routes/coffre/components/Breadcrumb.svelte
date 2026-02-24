<script lang="ts">
	interface Props {
		year: string | null;
		month: string | null;
		day: string | null;
		onCoffre: () => void;
		onYear: () => void;
		onMonth: () => void;
	}

	let { year, month, day, onCoffre, onYear, onMonth }: Props = $props();
</script>

<nav class="breadcrumb">
	<button onclick={onCoffre}>Coffre · ប្រអប់</button>

	{#if year}
		<span class="sep">›</span>
		{#if month}
			<button onclick={onYear}>{year}</button>
		{:else}
			<span class="current">{year}</span>
		{/if}
	{/if}

	{#if month}
		<span class="sep">›</span>
		{#if day}
			<button onclick={onMonth}>{month}</button>
		{:else}
			<span class="current">{month}</span>
		{/if}
	{/if}

	{#if day}
		<span class="sep">›</span>
		<span class="current">{day}</span>
	{/if}
</nav>

<style>
	.breadcrumb {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		flex: 1;
		min-width: 0;
		overflow: hidden;
	}

	button {
		font-size: var(--fs-sm);
		font-weight: 500;
		color: var(--accent);
		white-space: nowrap;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--accent) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
		transition: background 0.15s, border-color 0.15s;
	}

	button:hover {
		background: color-mix(in srgb, var(--accent) 22%, transparent);
		border-color: color-mix(in srgb, var(--accent) 50%, transparent);
	}

	button:active {
		background: color-mix(in srgb, var(--accent) 32%, transparent);
	}

	.sep {
		color: var(--muted);
		font-size: var(--fs-sm);
	}

	.current {
		font-size: var(--fs-base);
		color: var(--text);
		font-weight: 600;
		white-space: nowrap;
	}
</style>
