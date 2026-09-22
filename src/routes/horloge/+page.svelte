<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { toZonedTime, format } from 'date-fns-tz';
	import { fr } from 'date-fns/locale';
	import { getStatus, getDaysTogether, TZ_PARIS, TZ_PP, DISTANCE_KM } from '$lib/i18n';
	import Flag from '$lib/Flag.svelte';
	import { skyAt, type SkyColors } from '$lib/sky';

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
	const hourDiff = $derived(Math.round((pp.getTime() - paris.getTime()) / 3_600_000));

	// Chaque carte devient une fenêtre sur son ciel local (même mécanisme que Sky.svelte, réutilisé
	// via sky.ts) — plan de modernisation P5, 22/09/2026. Auparavant les deux cartes étaient des
	// surfaces blanches opaques qui masquaient Sky, alors que l'écran compare justement les deux
	// fuseaux : le ciel local de chaque ville y a plus sa place que sur n'importe quel autre écran.
	const parisHour = $derived(paris.getHours() + paris.getMinutes() / 60);
	const kpHour = $derived(pp.getHours() + pp.getMinutes() / 60);
	function cardSky(hour: number, side: 'paris' | 'kp'): SkyColors {
		return skyAt(hour, side);
	}

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

	<!-- Mini-carte + compteur fusionnés -->
	<div class="map-card">
		<svg class="world-map" viewBox="0 0 800 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
			<!-- ── Ligne de vol pointillée ── -->
			<path class="flight-line" d="M 120,160 C 280,20 520,20 680,160"/>

			<!-- ── Épingles ── -->
			<circle class="pin pin-paris" cx="120" cy="160" r="6"/>
			<text class="pin-label" x="120" y="145" text-anchor="middle">Paris</text>
			<circle class="pin pin-pp" cx="680" cy="160" r="6"/>
			<text class="pin-label" x="680" y="145" text-anchor="middle">Phnom Penh</text>
		</svg>
		<div class="map-footer">
			<div class="map-hero">
				<span class="map-dist">{DISTANCE_KM.toLocaleString('fr-FR')} km</span>
				<span class="map-sep">·</span>
				<span class="map-together">Jour {daysTogether}</span>
			</div>
			<span class="map-offset">+{hourDiff}h</span>
		</div>
	</div>

	<!-- Carte Paris -->
	<div class="clock-card card-paris" style="--sky-top:{cardSky(parisHour, 'paris').top};--sky-mid:{cardSky(parisHour, 'paris').mid};--sky-bot:{cardSky(parisHour, 'paris').bot}">
		<!-- Tour Eiffel — silhouette monochrome, seule couche de décor de la carte -->
		<svg class="landmark landmark-eiffel" viewBox="0 0 100 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
			<defs>
				<!-- Dégradé tricolore vertical : bleu | blanc | rouge -->
				<!-- Silhouette monochrome (plus les couleurs du drapeau, qui entraient en collision
				     avec le pastel et donnaient un rendu "clip-art" — plan de modernisation P5,
				     22/09/2026) : un dégradé à une seule teinte, gardé en <linearGradient> pour ne
				     pas retoucher chaque <rect> individuellement. -->
				<linearGradient id="fr-flag" x1="0" y1="0" x2="100" y2="0" gradientUnits="userSpaceOnUse">
					<stop offset="0%"   stop-color="#C43A5A"/>
					<stop offset="100%" stop-color="#C43A5A"/>
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
			<div class="name-row">
				<Flag lang="fr" size="md" />
				<span class="bridge" aria-hidden="true">♡</span>
				<span class="person-name">Chet</span>
				<span class="bridge" aria-hidden="true">♡</span>
				<Flag lang="kh" size="md" />
			</div>
			<div class="name-sub">apprend le khmer · រៀនខ្មែរ</div>
		</div>
		<div class="time">{fmtTime(paris)}</div>
		<div class="dates">
			<div class="date-fr">{fmtDate(now, TZ_PARIS)}</div>
			<div class="date-kh" lang="km">{fmtDateKh(now, TZ_PARIS)}</div>
		</div>
		<div class="status">
			<span class="status-icon">{parisStatus.icon}</span>
			<span class="status-text">{parisStatus.fr} · {parisStatus.kh}</span>
		</div>
	</div>

	<!-- Carte Phnom Penh -->
	<div class="clock-card card-pp" style="--sky-top:{cardSky(kpHour, 'kp').top};--sky-mid:{cardSky(kpHour, 'kp').mid};--sky-bot:{cardSky(kpHour, 'kp').bot}">
		<!-- Angkor Wat — silhouette monochrome, seule couche de décor de la carte -->
		<svg class="landmark landmark-angkor" viewBox="0 0 300 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
			<defs>
				<!-- Silhouette monochrome, même raison que fr-flag ci-dessus. -->
				<linearGradient id="kh-flag" x1="0" y1="0" x2="0" y2="140" gradientUnits="userSpaceOnUse">
					<stop offset="0%"   stop-color="#B7A3E8"/>
					<stop offset="100%" stop-color="#B7A3E8"/>
				</linearGradient>
			</defs>

			<!-- ── Terrasses étagées ── -->
			<rect fill="url(#kh-flag)" x="0"   y="118" width="300" height="22"/>
			<rect fill="url(#kh-flag)" x="8"   y="107" width="284" height="12"/>
			<rect fill="url(#kh-flag)" x="20"  y="96"  width="260" height="12"/>
			<rect fill="url(#kh-flag)" x="36"  y="85"  width="228" height="12"/>
			<rect fill="url(#kh-flag)" x="56"  y="75"  width="188" height="11"/>

			<!-- ── Tour coin gauche — 8 anneaux étagés + pointe ── -->
			<!-- base -->
			<rect fill="url(#kh-flag)" x="12"  y="75"  width="30" height="11"/>
			<!-- corps -->
			<rect fill="url(#kh-flag)" x="14"  y="66"  width="26" height="10"/>
			<rect fill="url(#kh-flag)" x="16"  y="58"  width="22" height="9"/>
			<rect fill="url(#kh-flag)" x="18"  y="51"  width="18" height="8"/>
			<rect fill="url(#kh-flag)" x="20"  y="45"  width="14" height="7"/>
			<rect fill="url(#kh-flag)" x="21"  y="40"  width="12" height="6"/>
			<rect fill="url(#kh-flag)" x="22"  y="35"  width="10" height="6"/>
			<rect fill="url(#kh-flag)" x="23"  y="31"  width="8"  height="5"/>
			<!-- pointe -->
			<polygon fill="url(#kh-flag)" points="24,31 27,23 30,31"/>

			<!-- ── Tour coin droite ── -->
			<rect fill="url(#kh-flag)" x="258" y="75"  width="30" height="11"/>
			<rect fill="url(#kh-flag)" x="260" y="66"  width="26" height="10"/>
			<rect fill="url(#kh-flag)" x="262" y="58"  width="22" height="9"/>
			<rect fill="url(#kh-flag)" x="264" y="51"  width="18" height="8"/>
			<rect fill="url(#kh-flag)" x="266" y="45"  width="14" height="7"/>
			<rect fill="url(#kh-flag)" x="267" y="40"  width="12" height="6"/>
			<rect fill="url(#kh-flag)" x="268" y="35"  width="10" height="6"/>
			<rect fill="url(#kh-flag)" x="269" y="31"  width="8"  height="5"/>
			<polygon fill="url(#kh-flag)" points="270,31 273,23 276,31"/>

			<!-- ── Tour intermédiaire gauche — 9 anneaux ── -->
			<rect fill="url(#kh-flag)" x="75"  y="63"  width="34" height="12"/>
			<rect fill="url(#kh-flag)" x="77"  y="54"  width="30" height="10"/>
			<rect fill="url(#kh-flag)" x="79"  y="46"  width="26" height="9"/>
			<rect fill="url(#kh-flag)" x="82"  y="39"  width="20" height="8"/>
			<rect fill="url(#kh-flag)" x="84"  y="33"  width="16" height="7"/>
			<rect fill="url(#kh-flag)" x="86"  y="28"  width="12" height="6"/>
			<rect fill="url(#kh-flag)" x="87"  y="23"  width="10" height="6"/>
			<rect fill="url(#kh-flag)" x="88"  y="19"  width="8"  height="5"/>
			<rect fill="url(#kh-flag)" x="89"  y="15"  width="6"  height="5"/>
			<polygon fill="url(#kh-flag)" points="90,15 92,8 94,15"/>

			<!-- ── Tour intermédiaire droite ── -->
			<rect fill="url(#kh-flag)" x="191" y="63"  width="34" height="12"/>
			<rect fill="url(#kh-flag)" x="193" y="54"  width="30" height="10"/>
			<rect fill="url(#kh-flag)" x="195" y="46"  width="26" height="9"/>
			<rect fill="url(#kh-flag)" x="198" y="39"  width="20" height="8"/>
			<rect fill="url(#kh-flag)" x="200" y="33"  width="16" height="7"/>
			<rect fill="url(#kh-flag)" x="202" y="28"  width="12" height="6"/>
			<rect fill="url(#kh-flag)" x="203" y="23"  width="10" height="6"/>
			<rect fill="url(#kh-flag)" x="204" y="19"  width="8"  height="5"/>
			<rect fill="url(#kh-flag)" x="205" y="15"  width="6"  height="5"/>
			<polygon fill="url(#kh-flag)" points="206,15 208,8 210,15"/>

			<!-- ── Tour centrale — 11 anneaux, la plus haute ── -->
			<rect fill="url(#kh-flag)" x="120" y="52"  width="60" height="23"/>
			<rect fill="url(#kh-flag)" x="123" y="44"  width="54" height="9"/>
			<rect fill="url(#kh-flag)" x="127" y="37"  width="46" height="8"/>
			<rect fill="url(#kh-flag)" x="131" y="31"  width="38" height="7"/>
			<rect fill="url(#kh-flag)" x="134" y="25"  width="32" height="7"/>
			<rect fill="url(#kh-flag)" x="137" y="20"  width="26" height="6"/>
			<rect fill="url(#kh-flag)" x="140" y="15"  width="20" height="6"/>
			<rect fill="url(#kh-flag)" x="143" y="11"  width="14" height="5"/>
			<rect fill="url(#kh-flag)" x="145" y="7"   width="10" height="5"/>
			<rect fill="url(#kh-flag)" x="147" y="4"   width="6"  height="4"/>
			<polygon fill="url(#kh-flag)" points="148,4 150,0 152,4"/>
		</svg>
		<div class="card-header">
			<div class="name-row">
				<Flag lang="kh" size="md" />
				<span class="bridge" aria-hidden="true">♡</span>
				<span class="person-name">Lys</span>
				<span class="bridge" aria-hidden="true">♡</span>
				<Flag lang="fr" size="md" />
			</div>
			<div class="name-sub">apprend le français · រៀនបារាំង</div>
		</div>
		<div class="time">{fmtTime(pp)}</div>
		<div class="dates">
			<div class="date-fr">{fmtDate(now, TZ_PP)}</div>
			<div class="date-kh" lang="km">{fmtDateKh(now, TZ_PP)}</div>
		</div>
		<div class="status">
			<span class="status-icon">{ppStatus.icon}</span>
			<span class="status-text">{ppStatus.fr} · {ppStatus.kh}</span>
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
		background: transparent;
	}

	/* ── Mini-carte ── */
	.map-card {
		position: relative;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		overflow: hidden;
		flex-shrink: 0;
	}

	.world-map {
		display: block;
		width: 100%;
		height: auto;
	}

	.flight-line {
		fill: none;
		stroke: var(--accent);
		stroke-width: 1.5;
		stroke-dasharray: 6 4;
		opacity: 0.5;
	}

	.pin {
		stroke: var(--on-accent);
		stroke-width: 1.5;
	}

	.pin-paris { fill: #ED2939; }
	.pin-pp    { fill: #E00025; }

	.pin-label {
		font-size: 18px;
		font-weight: 600;
		fill: var(--text);
		font-family: inherit;
	}

	/* "9074 km · Jour N" est le cœur du produit — traité en héros Fredoka plutôt qu'en petite
	   ligne muted sous le SVG (plan de modernisation P5, 22/09/2026). */
	.map-footer {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3) var(--space-3);
	}

	.map-hero {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		font-family: var(--font-display);
	}

	.map-dist {
		font-size: var(--fs-2xl);
		font-weight: 700;
		color: var(--accent-text);
		letter-spacing: 0.2px;
	}

	.map-sep {
		color: var(--muted);
		opacity: 0.5;
	}

	.map-together {
		font-size: var(--fs-lg);
		font-weight: 600;
		color: var(--text-secondary);
	}

	.map-offset {
		font-size: var(--fs-xs);
		font-weight: 700;
		color: var(--accent-text);
		background: color-mix(in srgb, var(--accent) 12%, transparent);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 1px var(--space-2);
	}

	/* ── Cartes ── */
	.clock-card {
		position: relative;
		/* Fenêtre sur le ciel local de la ville (--sky-top/mid/bot posés en style inline depuis
		   cardSky()) + un voile clair pour garder le texte lisible à tous les paliers, y compris
		   nuit — plan de modernisation P5, 22/09/2026. */
		background:
			linear-gradient(180deg, color-mix(in srgb, var(--bg) 78%, transparent), color-mix(in srgb, var(--bg) 88%, transparent)),
			linear-gradient(160deg, var(--sky-top), var(--sky-mid) 55%, var(--sky-bot));
		border: 1px solid var(--border-soft);
		border-radius: var(--radius-pebble);
		padding: var(--space-6) var(--space-6) calc(var(--space-6) + 3.5rem);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		overflow: hidden;
		flex: 1;
		transition: background 4s ease-in-out;
	}

	.landmark {
		position: absolute;
		bottom: var(--space-2);
		right: var(--space-3);
		opacity: 0.14;
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

	.card-header {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		padding-bottom: var(--space-1);
	}

	.name-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.person-name {
		font-size: var(--fs-2xl);
		font-weight: 700;
		color: var(--text);
		letter-spacing: 0.5px;
	}

	.bridge {
		color: var(--accent-text);
		font-size: 0.85rem;
		opacity: 0.65;
	}

	.name-sub {
		font-size: var(--fs-xs);
		color: var(--muted);
		letter-spacing: 0.02em;
	}

	.time {
		font-family: var(--font-display);
		font-size: clamp(3.2rem, 15vw, 5rem);
		font-weight: 600;
		color: var(--accent-text);
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.01em;
		line-height: 1;
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
		font-size: var(--fs-base);
		color: var(--muted);
		line-height: var(--lh-kh);
	}

	.status {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-2);
		padding: 6px 14px;
		border-radius: var(--radius-sm);
		background: var(--raised);
		border: 1px solid var(--border);
		width: fit-content;
	}

	.status-icon {
		font-size: var(--fs-xl);
		line-height: 1;
	}

	.status-text {
		font-size: var(--fs-md);
		color: var(--text-secondary);
		line-height: 1.4;
	}



</style>
