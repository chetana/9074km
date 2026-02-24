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
		gap: 4px;
		flex: 1;
		min-width: 0;
		overflow: hidden;
	}

	button {
		font-size: 13px;
		color: var(--accent);
		white-space: nowrap;
		opacity: 0.8;
		transition: opacity 0.15s;
		padding: 0 2px;
	}

	button:hover {
		opacity: 1;
	}

	.sep {
		color: var(--muted);
		font-size: 12px;
	}

	.current {
		font-size: 13px;
		color: var(--text);
		font-weight: 600;
		white-space: nowrap;
	}
</style>
