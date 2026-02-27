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
		<!-- Tour Eiffel — couleurs drapeau français -->
		<svg class="landmark landmark-eiffel" viewBox="0 0 100 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
			<defs>
				<!-- Dégradé tricolore vertical : bleu | blanc | rouge -->
				<linearGradient id="fr-flag" x1="0" y1="0" x2="100" y2="0" gradientUnits="userSpaceOnUse">
					<stop offset="0%"    stop-color="#002395"/>
					<stop offset="33.3%" stop-color="#002395"/>
					<stop offset="33.3%" stop-color="#EDEDED"/>
					<stop offset="66.6%" stop-color="#EDEDED"/>
					<stop offset="66.6%" stop-color="#ED2939"/>
					<stop offset="100%"  stop-color="#ED2939"/>
				</linearGradient>
				<!-- Clippath de la silhouette entière -->
				<clipPath id="eiffel-clip">
					<path d="M 9,200 C 20,178 34,168 36,165 L 64,165 C 66,168 80,178 91,200 Z"/>
					<rect x="33" y="162" width="34" height="5"/>
					<path d="M 36,162 L 42,130 L 58,130 L 64,162 Z"/>
					<rect x="40" y="127" width="20" height="5"/>
					<path d="M 42,127 L 47,34 L 53,34 L 58,127 Z"/>
					<rect x="45" y="30" width="10" height="6"/>
					<rect x="49" y="2" width="2" height="28"/>
				</clipPath>
			</defs>
			<!-- Rectangle plein aux couleurs du drapeau, clippé sur la silhouette -->
			<rect x="0" y="0" width="100" height="200" fill="url(#fr-flag)" clip-path="url(#eiffel-clip)"/>
			<!-- Arche centrale découpée -->
			<path fill="var(--card)" d="M 28,200 Q 50,148 72,200 Z" opacity="0.85"/>
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
		<!-- Angkor Wat — silhouette drapeau cambodgien, tours en bulbe lotus étagé -->
		<svg class="landmark landmark-angkor" viewBox="0 0 300 130" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
			<defs>
				<linearGradient id="kh-flag" x1="0" y1="0" x2="0" y2="130" gradientUnits="userSpaceOnUse">
					<stop offset="0%"   stop-color="#032EA1"/>
					<stop offset="20%"  stop-color="#032EA1"/>
					<stop offset="20%"  stop-color="#E00025"/>
					<stop offset="80%"  stop-color="#E00025"/>
					<stop offset="80%"  stop-color="#032EA1"/>
					<stop offset="100%" stop-color="#032EA1"/>
				</linearGradient>
			</defs>
			<!-- ── Terrasses étagées ── -->
			<rect fill="url(#kh-flag)" x="0"   y="109" width="300" height="21"/>
			<rect fill="url(#kh-flag)" x="10"  y="97"  width="280" height="13"/>
			<rect fill="url(#kh-flag)" x="24"  y="85"  width="252" height="13"/>
			<rect fill="url(#kh-flag)" x="42"  y="73"  width="216" height="13"/>
			<rect fill="url(#kh-flag)" x="60"  y="63"  width="180" height="11"/>

			<!-- ── Tour coin gauche (prasat, bulbe étagé) ── -->
			<rect fill="url(#kh-flag)" x="17"  y="63"  width="24" height="23"/>
			<rect fill="url(#kh-flag)" x="19"  y="53"  width="20" height="11"/>
			<rect fill="url(#kh-flag)" x="21"  y="45"  width="16" height="9"/>
			<rect fill="url(#kh-flag)" x="23"  y="38"  width="12" height="8"/>
			<polygon fill="url(#kh-flag)" points="26,38 29,28 32,38"/>

			<!-- ── Tour coin droite ── -->
			<rect fill="url(#kh-flag)" x="259" y="63"  width="24" height="23"/>
			<rect fill="url(#kh-flag)" x="261" y="53"  width="20" height="11"/>
			<rect fill="url(#kh-flag)" x="263" y="45"  width="16" height="9"/>
			<rect fill="url(#kh-flag)" x="265" y="38"  width="12" height="8"/>
			<polygon fill="url(#kh-flag)" points="268,38 271,28 274,38"/>

			<!-- ── Tour intermédiaire gauche ── -->
			<rect fill="url(#kh-flag)" x="79"  y="50"  width="28" height="24"/>
			<rect fill="url(#kh-flag)" x="82"  y="39"  width="22" height="12"/>
			<rect fill="url(#kh-flag)" x="85"  y="30"  width="16" height="10"/>
			<rect fill="url(#kh-flag)" x="88"  y="22"  width="10" height="9"/>
			<polygon fill="url(#kh-flag)" points="90,22 93,12 96,22"/>

			<!-- ── Tour intermédiaire droite ── -->
			<rect fill="url(#kh-flag)" x="193" y="50"  width="28" height="24"/>
			<rect fill="url(#kh-flag)" x="196" y="39"  width="22" height="12"/>
			<rect fill="url(#kh-flag)" x="199" y="30"  width="16" height="10"/>
			<rect fill="url(#kh-flag)" x="202" y="22"  width="10" height="9"/>
			<polygon fill="url(#kh-flag)" points="205,22 208,12 211,22"/>

			<!-- ── Tour centrale (nettement plus haute) ── -->
			<rect fill="url(#kh-flag)" x="126" y="26"  width="48" height="47"/>
			<rect fill="url(#kh-flag)" x="131" y="17"  width="38" height="10"/>
			<rect fill="url(#kh-flag)" x="136" y="10"  width="28" height="8"/>
			<rect fill="url(#kh-flag)" x="141" y="4"   width="18" height="7"/>
			<polygon fill="url(#kh-flag)" points="147,4 150,0 153,4"/>
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
		bottom: var(--space-2);
		right: var(--space-3);
		opacity: 0.55;
		pointer-events: none;
	}

	.landmark-eiffel {
		height: 7rem;
		width: auto;
	}

	.landmark-angkor {
		height: 5rem;
		width: auto;
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
