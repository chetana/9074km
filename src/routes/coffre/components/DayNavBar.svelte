<script lang="ts">
	import { DAYS_FR, DAYS_KH, MONTHS_FR } from '$lib/i18n';

	interface Props {
		year: string;
		month: string;
		day: string;
		columns: number;
		onPrev: () => void;
		onNext: () => void;
		onColumnsChange: (cols: number) => void;
	}

	let { year, month, day, columns, onPrev, onNext, onColumnsChange }: Props = $props();

	const dayLabel = $derived.by(() => {
		const d = new Date(`${year}-${month}-${day}T12:00:00`);
		const dow = (d.getDay() + 6) % 7;
		const monthShort = MONTHS_FR[parseInt(month, 10) - 1].slice(0, 3);
		return `${DAYS_FR[dow]} · ${DAYS_KH[dow]} ${monthShort} ${day}`;
	});

	const gridIcon = $derived(
		columns === 2 ? '⊞' : columns === 3 ? '⊟' : '▦'
	);

	function cycleColumns() {
		onColumnsChange(columns === 4 ? 2 : columns + 1);
	}
</script>

<div class="navbar">
	<button class="nav-btn" onclick={onPrev} aria-label="Jour précédent">‹</button>

	<span class="day-label">{dayLabel}</span>

	<button class="nav-btn" onclick={onNext} aria-label="Jour suivant">›</button>

	<button class="grid-btn" onclick={cycleColumns} title="Changer le zoom">
		{gridIcon}
	</button>
</div>

<style>
	.navbar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		border-bottom: 1px solid var(--border);
		background: var(--bg);
		position: sticky;
		top: 0;
		z-index: 10;
	}

	.nav-btn {
		font-size: 24px;
		color: var(--accent);
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		transition: background 0.15s;
		flex-shrink: 0;
	}

	.nav-btn:hover {
		background: var(--card);
	}

	.day-label {
		flex: 1;
		font-size: 13px;
		color: var(--text);
		text-align: center;
		font-weight: 500;
	}

	.grid-btn {
		font-size: 18px;
		color: var(--muted);
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		flex-shrink: 0;
		transition: color 0.15s;
	}

	.grid-btn:hover {
		color: var(--accent);
	}
</style>
