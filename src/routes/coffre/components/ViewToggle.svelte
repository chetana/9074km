<script lang="ts">
	import { T } from '$lib/events-i18n';

	interface Props {
		view: 'dates' | 'events';
		onChange: (v: 'dates' | 'events') => void;
	}
	let { view, onChange }: Props = $props();

	const tabs = [
		{ id: 'dates', label: T.datesTab },
		{ id: 'events', label: T.eventsTab }
	] as const;
</script>

<div class="toggle" role="group" aria-label="Vue du coffre · ទិដ្ឋភាពប្រអប់">
	{#each tabs as tab (tab.id)}
		<button class="seg" class:active={view === tab.id} aria-pressed={view === tab.id} onclick={() => onChange(tab.id)}>
			<span class="kh" lang="km">{tab.label.kh}</span>
			<span class="fr">{tab.label.fr}</span>
		</button>
	{/each}
</div>

<style>
	.toggle {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-1);
		margin: var(--space-3) var(--space-4) 0;
		padding: var(--space-1);
		background: var(--raised);
		border-radius: var(--radius-full);
		flex-shrink: 0;
		position: relative;
		z-index: 1;
	}
	.seg {
		min-height: var(--btn-tap);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-full);
		color: var(--text-secondary);
		padding: 2px var(--space-3);
		transition: background var(--transition), color var(--transition);
	}
	.seg.active {
		background: var(--surface);
		color: var(--accent-text);
		box-shadow: var(--shadow-sm);
	}
	.kh {
		font-size: var(--fs-xl);
		font-weight: 600;
		line-height: var(--lh-kh);
	}
	.fr {
		font-family: var(--font-display);
		font-size: var(--fs-sm);
		font-weight: 500;
		line-height: 1.1;
		margin-top: -2px;
	}
</style>
