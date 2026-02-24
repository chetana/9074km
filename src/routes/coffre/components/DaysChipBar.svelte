<script lang="ts">
	import { tick } from 'svelte';

	interface Props {
		days: string[];
		dayCounts: Record<string, number>;
		currentDay: string;
		onSelect: (day: string) => void;
	}

	let { days, dayCounts, currentDay, onSelect }: Props = $props();

	let scrollContainer: HTMLDivElement;
	let chipRefs: Record<string, HTMLButtonElement> = {};

	// Auto-scroll to current day chip when it changes
	$effect(() => {
		const _day = currentDay;
		tick().then(() => {
			const chip = chipRefs[_day];
			if (chip && scrollContainer) {
				chip.scrollIntoView({
					behavior: 'smooth',
					block: 'nearest',
					inline: 'center'
				});
			}
		});
	});

	const today = new Date();
	const todayStr = [
		today.getFullYear(),
		String(today.getMonth() + 1).padStart(2, '0'),
		String(today.getDate()).padStart(2, '0')
	].join('-'); // Note: this is a rough check, not timezone-aware
</script>

<div class="chip-bar" bind:this={scrollContainer}>
	{#each days as d}
		{@const isActive = d === currentDay}
		{@const count = dayCounts[d] ?? 0}
		<button
			class="chip"
			class:active={isActive}
			bind:this={chipRefs[d]}
			onclick={() => onSelect(d)}
		>
			<span class="day-num">{d}</span>
			{#if count > 0}
				<span class="count">({count})</span>
			{/if}
		</button>
	{/each}
</div>

<style>
	.chip-bar {
		display: flex;
		gap: 6px;
		overflow-x: auto;
		padding: 8px 12px;
		border-bottom: 1px solid var(--border);
		scrollbar-width: none;
		-webkit-overflow-scrolling: touch;
	}

	.chip-bar::-webkit-scrollbar {
		display: none;
	}

	.chip {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 6px 10px;
		border-radius: 20px;
		border: 1.5px solid transparent;
		background: var(--card);
		flex-shrink: 0;
		transition: border-color 0.15s, color 0.15s;
		min-width: 44px;
	}

	.chip.active {
		border-color: var(--accent);
		color: var(--accent);
		position: relative;
	}

	.chip.active::after {
		content: '';
		position: absolute;
		bottom: -2px;
		left: 50%;
		transform: translateX(-50%);
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: var(--accent);
	}

	.day-num {
		font-size: 13px;
		font-weight: 600;
	}

	.count {
		font-size: 10px;
		color: var(--muted);
	}

	.chip.active .count {
		color: var(--accent);
		opacity: 0.8;
	}
</style>
