<script lang="ts">
interface Props {
		label: string;
		hasPrev: boolean;
		hasNext: boolean;
		columns: number;
		onPrev: () => void;
		onNext: () => void;
		onCycleColumns: () => void;
	}

	let { label, hasPrev, hasNext, columns, onPrev, onNext, onCycleColumns }: Props = $props();

	const gridIcon = $derived(
		columns === 2 ? '⊞' : columns === 3 ? '⊟' : '▦'
	);
</script>

<div class="navbar">
	<button class="nav-btn" onclick={onPrev} disabled={!hasPrev} aria-label="Jour précédent">‹</button>

	<span class="day-label">{label}</span>

	<button class="nav-btn" onclick={onNext} disabled={!hasNext} aria-label="Jour suivant">›</button>

	<button class="grid-btn" onclick={onCycleColumns} title="Changer le zoom">
		{gridIcon}
	</button>
</div>

<style>
	.navbar {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border);
		background: var(--bg);
		position: sticky;
		top: 0;
		z-index: 10;
	}

	.nav-btn {
		font-size: 1.5rem;
		color: var(--accent);
		width: var(--btn-icon);
		height: var(--btn-icon);
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-sm);
		transition: background 0.15s;
		flex-shrink: 0;
	}

	.nav-btn:hover {
		background: var(--card);
	}

	.day-label {
		flex: 1;
		font-size: var(--fs-base);
		color: var(--text);
		text-align: center;
		font-weight: 500;
	}

	.grid-btn {
		font-size: var(--fs-xl);
		color: var(--muted);
		width: var(--btn-icon);
		height: var(--btn-icon);
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-sm);
		flex-shrink: 0;
		transition: color 0.15s;
	}

	.grid-btn:hover {
		color: var(--accent);
	}
</style>
