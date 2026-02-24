<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { toZonedTime, format } from 'date-fns-tz';
	import { fr } from 'date-fns/locale';
	import { getStatus, getDaysTogether, TZ_PARIS, TZ_PP, DISTANCE_KM } from '$lib/i18n';

	let now = $state(new Date());
	let interval: ReturnType<typeof setInterval>;

	onMount(() => {
		interval = setInterval(() => (now = new Date()), 1000);
	});
	onDestroy(() => clearInterval(interval));

	const paris = $derived(toZonedTime(now, TZ_PARIS));
	const pp = $derived(toZonedTime(now, TZ_PP));
	const daysTogether = $derived(getDaysTogether(now));

	const parisStatus = $derived(getStatus(paris.getHours()));
	const ppStatus = $derived(getStatus(pp.getHours()));

	function fmtTime(d: Date) {
		return format(d, 'HH:mm:ss');
	}

	function fmtDate(d: Date, tz: string) {
		return format(toZonedTime(d, tz), "EEEE d MMMM", { locale: fr, timeZone: tz });
	}

	function fmtDateKh(d: Date, tz: string) {
		const zoned = toZonedTime(d, tz);
		const KH_DAYS = ['អាទិត្យ', 'ច័ន្ទ', 'អង្គារ', 'ពុធ', 'ព្រហស្បតិ៍', 'សុក្រ', 'សៅរ៍'];
		const KH_MONTHS = ['មករា','កុម្ភៈ','មីនា','មេសា','ឧសភា','មិថុនា','កក្កដា','សីហា','កញ្ញា','តុលា','វិច្ឆិកា','ធ្នូ'];
		return `${KH_DAYS[zoned.getDay()]} ${zoned.getDate()} ${KH_MONTHS[zoned.getMonth()]}`;
	}
</script>

<svelte:head>
	<title>Chet & Lys · Horloge</title>
</svelte:head>

<div class="page">

	<!-- Carte Paris -->
	<div class="clock-card">
		<div class="card-glow glow-paris"></div>
		<div class="card-header">
			<div class="flag-box fr">FR</div>
			<div class="person-name">Chet</div>
		</div>
		<div class="time">{fmtTime(paris)}</div>
		<div class="dates">
			<div class="date-fr">{fmtDate(now, TZ_PARIS)}</div>
			<div class="date-kh">{fmtDateKh(now, TZ_PARIS)}</div>
		</div>
		<div class="status">
			<span class="status-icon">{parisStatus.icon}</span>
			<span class="status-text">{parisStatus.fr} · {parisStatus.kh}</span>
		</div>
	</div>

	<!-- Séparateur -->
	<div class="separator">
		<div class="sep-line"></div>
		<div class="sep-content">
			<span class="sep-dist">{DISTANCE_KM.toLocaleString('fr-FR')} km</span>
			<span class="sep-heart">♡</span>
			<span class="sep-offset">+6h</span>
		</div>
		<div class="sep-line"></div>
	</div>

	<!-- Carte Phnom Penh -->
	<div class="clock-card">
		<div class="card-glow glow-pp"></div>
		<div class="card-header">
			<div class="flag-box kh">KH</div>
			<div class="person-name">Lys</div>
		</div>
		<div class="time">{fmtTime(pp)}</div>
		<div class="dates">
			<div class="date-fr">{fmtDate(now, TZ_PP)}</div>
			<div class="date-kh">{fmtDateKh(now, TZ_PP)}</div>
		</div>
		<div class="status">
			<span class="status-icon">{ppStatus.icon}</span>
			<span class="status-text">{ppStatus.fr} · {ppStatus.kh}</span>
		</div>
	</div>

	<!-- Compteur -->
	<div class="together">
		<div class="together-inner">
			<span class="together-ring">💍</span>
			<div class="together-body">
				<span class="together-count">Jour {daysTogether}</span>
				<span class="together-label">ensemble · ថ្ងៃទី {daysTogether}</span>
			</div>
		</div>
	</div>

</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		min-height: 100%;
		padding: 20px 16px 24px;
		gap: 0;
		background:
			radial-gradient(ellipse 80% 30% at 50% 20%, rgba(232, 164, 184, 0.08) 0%, transparent 70%),
			radial-gradient(ellipse 80% 30% at 50% 80%, rgba(164, 184, 232, 0.06) 0%, transparent 70%);
	}

	/* ── Cartes ── */
	.clock-card {
		position: relative;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 24px;
		padding: 28px 24px 24px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		overflow: hidden;
		flex: 1;
	}

	.card-glow {
		position: absolute;
		top: -40px;
		right: -20px;
		width: 180px;
		height: 180px;
		border-radius: 50%;
		pointer-events: none;
	}

	.glow-paris {
		background: radial-gradient(circle, rgba(66, 99, 196, 0.2) 0%, transparent 70%);
	}

	.glow-pp {
		background: radial-gradient(circle, rgba(232, 100, 100, 0.15) 0%, transparent 70%);
		top: auto;
		bottom: -40px;
		right: -20px;
	}

	.card-header {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.flag-box {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 1.5px;
		border-radius: 6px;
		padding: 3px 7px;
	}

	.flag-box.fr {
		background: #1a2a6c;
		color: #fff;
		box-shadow: inset 3px 0 0 #e53935, inset -3px 0 0 #e53935;
	}

	.flag-box.kh {
		background: #032ea1;
		color: #fff;
		box-shadow: inset 0 3px 0 #e00025, inset 0 -3px 0 #e00025;
	}

	.person-name {
		font-size: 20px;
		font-weight: 700;
		color: var(--text);
		letter-spacing: 0.5px;
	}

	.time {
		font-size: clamp(42px, 12vw, 64px);
		font-weight: 800;
		color: var(--accent);
		font-variant-numeric: tabular-nums;
		letter-spacing: 2px;
		line-height: 1;
		animation: pulse-text 1s ease-in-out infinite alternate;
	}

	@keyframes pulse-text {
		from { opacity: 1; }
		to   { opacity: 0.82; }
	}

	.dates {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.date-fr {
		font-size: 13px;
		color: var(--muted);
		text-transform: capitalize;
	}

	.date-kh {
		font-size: 12px;
		color: var(--muted);
		opacity: 0.65;
	}

	.status {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 4px;
	}

	.status-icon {
		font-size: 18px;
		line-height: 1;
	}

	.status-text {
		font-size: 13px;
		color: var(--text);
	}

	/* ── Séparateur ── */
	.separator {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 4px;
	}

	.sep-line {
		flex: 1;
		height: 1px;
		background: var(--border);
		opacity: 0.5;
	}

	.sep-content {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-shrink: 0;
	}

	.sep-dist {
		font-size: 11px;
		color: var(--muted);
		letter-spacing: 0.5px;
	}

	.sep-heart {
		font-size: 16px;
		color: var(--accent);
		animation: heartbeat 2s ease-in-out infinite;
	}

	@keyframes heartbeat {
		0%, 100% { transform: scale(1);   opacity: 0.6; }
		50%       { transform: scale(1.4); opacity: 1;   }
	}

	.sep-offset {
		font-size: 12px;
		font-weight: 700;
		color: var(--accent);
		background: rgba(232, 164, 184, 0.12);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 2px 8px;
	}

	/* ── Compteur ── */
	.together {
		margin-top: 16px;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 20px;
		overflow: hidden;
		position: relative;
	}

	.together::before {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(135deg, rgba(232, 164, 184, 0.07) 0%, transparent 60%);
		pointer-events: none;
	}

	.together-inner {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 18px 24px;
	}

	.together-ring {
		font-size: 32px;
		flex-shrink: 0;
	}

	.together-body {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.together-count {
		font-size: 28px;
		font-weight: 800;
		color: var(--accent);
		line-height: 1;
	}

	.together-label {
		font-size: 12px;
		color: var(--muted);
		letter-spacing: 0.3px;
	}
</style>
