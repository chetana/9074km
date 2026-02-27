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
		<!-- Tour Eiffel -->
		<svg class="landmark" viewBox="0 0 100 160" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
			<!-- Base legs -->
			<line x1="18" y1="155" x2="42" y2="80" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
			<line x1="82" y1="155" x2="58" y2="80" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
			<!-- Lower arch -->
			<path d="M18 155 Q50 110 82 155" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
			<!-- Mid section -->
			<line x1="42" y1="80" x2="32" y2="52" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
			<line x1="58" y1="80" x2="68" y2="52" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
			<!-- Mid platform -->
			<line x1="28" y1="80" x2="72" y2="80" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
			<line x1="30" y1="52" x2="70" y2="52" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
			<!-- Upper section -->
			<line x1="32" y1="52" x2="44" y2="28" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
			<line x1="68" y1="52" x2="56" y2="28" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
			<!-- Top platform -->
			<line x1="42" y1="28" x2="58" y2="28" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
			<!-- Spire -->
			<line x1="50" y1="28" x2="50" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
			<line x1="47" y1="12" x2="53" y2="12" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
		</svg>
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
		<!-- Temple Angkor Wat -->
		<svg class="landmark" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
			<!-- Base platform -->
			<rect x="5" y="98" width="110" height="6" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/>
			<rect x="15" y="90" width="90" height="8" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/>
			<!-- Left small tower -->
			<rect x="18" y="72" width="14" height="18" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/>
			<path d="M18 72 Q25 62 32 72" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>
			<line x1="25" y1="62" x2="25" y2="56" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
			<!-- Right small tower -->
			<rect x="88" y="72" width="14" height="18" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/>
			<path d="M88 72 Q95 62 102 72" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>
			<line x1="95" y1="62" x2="95" y2="56" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
			<!-- Central tower body -->
			<rect x="40" y="60" width="40" height="30" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/>
			<!-- Central tower mid -->
			<rect x="46" y="46" width="28" height="14" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/>
			<!-- Central spire (prasat) -->
			<path d="M46 46 Q60 28 74 46" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>
			<line x1="60" y1="28" x2="60" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
			<!-- Spire rings -->
			<line x1="56" y1="22" x2="64" y2="22" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
			<line x1="57" y1="16" x2="63" y2="16" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
			<!-- Door details -->
			<rect x="55" y="72" width="10" height="18" rx="1" stroke="currentColor" stroke-width="1" fill="none"/>
		</svg>
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
		height: 100%;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
		padding: var(--space-4) var(--space-4) var(--space-6);
		gap: 0;
		background:
			radial-gradient(ellipse 80% 30% at 50% 20%, color-mix(in srgb, var(--accent) 8%, transparent) 0%, transparent 70%),
			radial-gradient(ellipse 80% 30% at 50% 80%, color-mix(in srgb, var(--accent) 6%, transparent) 0%, transparent 70%);
	}

	/* ── Cartes ── */
	.clock-card {
		position: relative;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: var(--radius-2xl);
		padding: var(--space-6) var(--space-6) var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		overflow: hidden;
		flex: 1;
	}

	.landmark {
		position: absolute;
		bottom: var(--space-3);
		right: var(--space-4);
		width: 5rem;
		height: auto;
		color: var(--accent);
		opacity: 0.12;
		pointer-events: none;
	}

	.card-glow {
		position: absolute;
		top: -2.5rem;
		right: -1.25rem;
		width: 11.25rem;
		height: 11.25rem;
		border-radius: var(--radius-full);
		pointer-events: none;
	}

	.glow-paris {
		background: radial-gradient(circle, color-mix(in srgb, var(--accent) 20%, transparent) 0%, transparent 70%);
	}

	.glow-pp {
		background: radial-gradient(circle, color-mix(in srgb, var(--accent) 15%, transparent) 0%, transparent 70%);
		top: auto;
		bottom: -2.5rem;
		right: -1.25rem;
	}

	.card-header {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.flag-box {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: var(--fs-xs);
		font-weight: 800;
		letter-spacing: 1.5px;
		border-radius: var(--radius-sm);
		padding: 0.1875rem 0.4375rem;
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
		font-size: var(--fs-2xl);
		font-weight: 700;
		color: var(--text);
		letter-spacing: 0.5px;
	}

	.time {
		font-size: clamp(2.625rem, 12vw, 4rem);
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
		gap: var(--space-1);
	}

	.date-fr {
		font-size: var(--fs-base);
		color: var(--muted);
		text-transform: capitalize;
	}

	.date-kh {
		font-size: var(--fs-sm);
		color: var(--muted);
		opacity: 0.65;
	}

	.status {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-1);
	}

	.status-icon {
		font-size: var(--fs-xl);
		line-height: 1;
	}

	.status-text {
		font-size: var(--fs-base);
		color: var(--text);
	}

	/* ── Séparateur ── */
	.separator {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-1);
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
		gap: var(--space-3);
		flex-shrink: 0;
	}

	.sep-dist {
		font-size: var(--fs-xs);
		color: var(--muted);
		letter-spacing: 0.5px;
	}

	.sep-heart {
		font-size: var(--fs-lg);
		color: var(--accent);
		animation: heartbeat 2s ease-in-out infinite;
	}

	@keyframes heartbeat {
		0%, 100% { transform: scale(1);   opacity: 0.6; }
		50%       { transform: scale(1.4); opacity: 1;   }
	}

	.sep-offset {
		font-size: var(--fs-sm);
		font-weight: 700;
		color: var(--accent);
		background: color-mix(in srgb, var(--accent) 12%, transparent);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: var(--space-1) var(--space-2);
	}

	/* ── Compteur ── */
	.together {
		margin-top: var(--space-4);
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: var(--radius-2xl);
		overflow: hidden;
		position: relative;
	}

	.together::before {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 7%, transparent) 0%, transparent 60%);
		pointer-events: none;
	}

	.together-inner {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-4) var(--space-6);
	}

	.together-ring {
		font-size: var(--fs-3xl);
		flex-shrink: 0;
	}

	.together-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.together-count {
		font-size: 1.75rem;
		font-weight: 800;
		color: var(--accent);
		line-height: 1;
	}

	.together-label {
		font-size: var(--fs-sm);
		color: var(--muted);
		letter-spacing: 0.3px;
	}
</style>
