<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { toZonedTime, format } from 'date-fns-tz';
	import { fr } from 'date-fns/locale';
	import { getStatus, getDaysTogether, TZ_PARIS, TZ_PP, DISTANCE_KM } from '$lib/i18n';
	import Flag from '$lib/Flag.svelte';
	import { Plane } from 'lucide-svelte';
	import { ARRIVAL_PARIS, getCountdown, showArrivalCard, getJourney } from '$lib/countdown';
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

	// Compte à rebours de l'arrivée de Lys à Paris (2 novembre 2026) — carte visible jusqu'à 7 jours après.
	const countdown = $derived(getCountdown(now));
	const arrivalVisible = $derived(showArrivalCard(countdown));
	const pad2 = (n: number) => String(n).padStart(2, '0');

	// Trajet Phnom Penh → Paris : l'avion avance sur l'arc de la mini-carte (position lue sur le tracé SVG
	// lui-même, donc exactement sur la ligne), les points du calendrier se remplissent jour après jour.
	const journey = $derived(getJourney(now));
	let arcEl: SVGPathElement | undefined = $state();
	const plane = $derived.by(() => {
		if (!arcEl) return { x: 680, y: 160, a: 180 };
		const len = arcEl.getTotalLength();
		const d = journey.progress * len;
		const p0 = arcEl.getPointAtLength(Math.max(0, d - 1));
		const p1 = arcEl.getPointAtLength(Math.min(len, d + 1));
		return { x: p1.x, y: p1.y, a: (Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180) / Math.PI };
	});

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

	// « 2 nov. » (date courte d'arrivée, fuseau de Paris)
	function fmtShortDate(d: Date) {
		return format(toZonedTime(d, TZ_PARIS), 'd MMM', { locale: fr });
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

	<!-- Compte à rebours 1/3 : « vol en cours » — l'avion avance sur l'arc, compteur FR + khmer -->
	<div class="map-card">
		<svg class="world-map" viewBox="0 30 800 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
			<path class="flight-line" d="M 680,160 C 520,20 280,20 120,160" pathLength="1" bind:this={arcEl}/>
			{#if arrivalVisible}
				<path class="flight-done" d="M 680,160 C 520,20 280,20 120,160" pathLength="1" stroke-dasharray="{journey.progress} 1"/>
			{/if}
			<circle class="pin pin-paris" cx="120" cy="160" r="6"/>
			<text class="pin-label" x="120" y="145" text-anchor="middle">Paris</text>
			<circle class="pin pin-pp" cx="680" cy="160" r="6"/>
			<text class="pin-label" x="680" y="145" text-anchor="middle">Phnom Penh</text>
			{#if arrivalVisible}
				<g transform="translate({plane.x} {plane.y}) rotate({plane.a})">
					<circle r="15" class="plane-bg"/>
					<path d="M9,0 L-6,-7 L-3,0 L-6,7 Z" class="plane-shape"/>
				</g>
			{/if}
		</svg>
		<div class="map-footer">
			<div class="map-hero">
				<span class="map-dist">{DISTANCE_KM.toLocaleString('fr-FR')} km</span>
				<span class="map-sep">·</span>
				<span class="map-together">Jour {daysTogether}</span>
				<span class="map-offset">+{hourDiff}h</span>
			</div>
			{#if arrivalVisible}
				<div class="cd-line" role="timer" aria-live="off">
					{#if countdown.arrived}
						<b>Lys est arrivée à Paris !</b>
						<span class="cd-kh" lang="km">Lys មកដល់ប៉ារីសហើយ! ទីបំផុតយើងបាននៅជាមួយគ្នាហើយ</span>
					{:else}
						<span class="cd-time">{countdown.days}<small>{countdown.days > 1 ? 'jours' : 'jour'}</small> {pad2(countdown.hours)}<small>h</small> {pad2(countdown.minutes)}<small>min</small> {pad2(countdown.seconds)}<small>s</small></span>
						<b>Lys arrive à Paris</b>
						<span class="cd-kh" lang="km">Lys នឹងមកដល់ប៉ារីស · នៅសល់ {countdown.days} ថ្ងៃទៀត</span>
					{/if}
				</div>
			{/if}
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


	<!-- Sous les horloges : les deux autres vues du compte à rebours (Lys arrive à Paris le 2 novembre) -->
	{#if arrivalVisible}
		<div class="cd-extras">
			<!-- Compte à rebours 2/3 : carte d'embarquement PNH → CDG -->
			<div class="cd-card">
				<div class="bp">
					<div class="bp-main">
						<div class="bp-tag">Carte d'embarquement</div>
						<div class="bp-route">
							<div><div class="bp-code">PNH</div><div class="bp-city">Phnom Penh</div></div>
							<div class="bp-line"><Plane size={20} strokeWidth={1.75} style="transform: rotate(-90deg)" aria-hidden="true" /></div>
							<div class="bp-right"><div class="bp-code">CDG</div><div class="bp-city">Paris</div></div>
						</div>
						<div class="bp-meta">
							<div><span class="bp-label">Passagère</span>LYS</div>
							<div><span class="bp-label">Date</span>{fmtShortDate(ARRIVAL_PARIS)}</div>
							<div><span class="bp-label">Distance</span>{DISTANCE_KM.toLocaleString('fr-FR')} km</div>
						</div>
						<div class="bp-bar" aria-hidden="true"></div>
						<div class="bp-kh" lang="km">ប័ណ្ណឡើងយន្តហោះ · Lys នឹងមកដល់ប៉ារីស</div>
					</div>
					<div class="bp-stub">
						{#if countdown.arrived}
							<b class="bp-done">✓</b>
							<span>Arrivée</span>
							<span lang="km">មកដល់ហើយ</span>
						{:else}
							<span>Embarquement dans</span>
							<b>{countdown.days}</b>
							<span>{countdown.days > 1 ? 'jours' : 'jour'}</span>
							<span class="bp-hms">{pad2(countdown.hours)} : {pad2(countdown.minutes)} : {pad2(countdown.seconds)}</span>
							<span lang="km">នៅសល់ថ្ងៃទៀត</span>
						{/if}
					</div>
				</div>
			</div>

			<!-- Compte à rebours 3/3 : un point par jour, le dernier est Paris -->
			<div class="cd-card cd-dots-card">
				<div class="dots-top">
					<b>{countdown.arrived ? 'Arrivée !' : `${countdown.days} ${countdown.days > 1 ? 'jours' : 'jour'}`}</b>
					<span>Lys arrive à Paris · {fmtShortDate(ARRIVAL_PARIS)}</span>
				</div>
				<div class="dots" aria-hidden="true">
					{#each Array(journey.totalDays) as _, i}
						<i class="dot" class:on={i < journey.doneDays} class:now={i === journey.doneDays && !countdown.arrived} class:end={i === journey.totalDays - 1}>{i === journey.totalDays - 1 ? '♥' : ''}</i>
					{/each}
				</div>
				<div class="cd-kh dots-kh" lang="km">Lys នឹងមកដល់ប៉ារីស · នៅសល់ {countdown.days} ថ្ងៃទៀត</div>
			</div>
		</div>
	{/if}

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
		flex-wrap: wrap;
		justify-content: center;
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

	/* ── Compte à rebours : vues 2 et 3 empilées sous les horloges ── */
	.cd-extras {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin-top: var(--space-3);
		flex-shrink: 0;
	}

	.flight-done {
		fill: none;
		stroke: var(--accent-text);
		stroke-width: 2.5;
		stroke-linecap: round;
	}
	.plane-bg { fill: var(--surface); stroke: var(--accent); stroke-width: 1.5; }
	.plane-shape { fill: var(--accent-text); }

	.cd-line {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1px;
		margin-top: var(--space-1);
		text-align: center;
		font-size: var(--fs-base);
		color: var(--text-secondary);
	}
	.cd-line b { font-family: var(--font-display); font-weight: 600; color: var(--text); font-size: var(--fs-md); }
	.cd-time {
		font-family: var(--font-display);
		font-size: var(--fs-2xl);
		font-weight: 700;
		color: var(--accent-text);
		font-variant-numeric: tabular-nums;
	}
	.cd-time small { font-size: var(--fs-sm); font-weight: 500; color: var(--muted); margin: 0 var(--space-1) 0 2px; }
	.cd-kh { font-size: var(--fs-base); color: var(--muted); line-height: var(--lh-kh); }

	/* vues 2 et 3 : même enveloppe que la mini-carte */
	.cd-card {
		display: flex;
		flex-direction: column;
		justify-content: center;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		overflow: hidden;
		flex-shrink: 0;
	}

	/* carte d'embarquement */
	.bp { display: flex; align-items: stretch; flex: 1; }
	.bp-main { flex: 1; min-width: 0; padding: var(--space-3) var(--space-3) var(--space-2); border-right: 2px dashed var(--border); }
	.bp-tag { font-family: var(--font-display); font-size: var(--fs-xs); font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
	.bp-route { display: flex; align-items: center; gap: var(--space-2); margin: var(--space-2) 0 var(--space-1); }
	.bp-right { text-align: right; }
	.bp-code { font-family: var(--font-display); font-size: 1.9rem; font-weight: 700; line-height: 1; color: var(--text); }
	.bp-city { font-size: var(--fs-xs); color: var(--muted); }
	.bp-line { flex: 1; display: flex; justify-content: center; align-items: center; color: var(--accent-text); border-top: 2px dotted var(--accent); height: 0; }
	.bp-line :global(svg) { background: var(--surface); padding: 0 var(--space-1); box-sizing: content-box; }
	.bp-meta div { white-space: nowrap; }
	.bp-meta { display: flex; gap: var(--space-3); margin-top: var(--space-2); font-family: var(--font-display); font-size: var(--fs-md); font-weight: 600; color: var(--text); }
	.bp-label { display: block; font-family: inherit; font-size: var(--fs-xs); font-weight: 500; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
	.bp-bar { height: 16px; margin-top: var(--space-2); opacity: .5; border-radius: 2px; background: repeating-linear-gradient(90deg, var(--text) 0 2px, transparent 2px 4px, var(--text) 4px 5px, transparent 5px 9px, var(--text) 9px 12px, transparent 12px 14px); }
	.bp-kh { margin-top: var(--space-1); font-size: var(--fs-base); color: var(--muted); line-height: var(--lh-kh); }
	.bp-stub { width: 7.2rem; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: var(--space-2); text-align: center; background: color-mix(in srgb, var(--accent) 10%, transparent); font-family: var(--font-display); font-size: var(--fs-sm); font-weight: 600; color: var(--text-secondary); }
	.bp-stub b { font-size: 2.4rem; font-weight: 700; line-height: 1; color: var(--accent-text); }
	.bp-stub .bp-hms { font-size: var(--fs-md); color: var(--accent-text); font-variant-numeric: tabular-nums; margin-top: 2px; }
	.bp-stub [lang='km'] { font-family: inherit; font-size: var(--fs-base); font-weight: 400; color: var(--muted); line-height: var(--lh-kh); }
	.bp-done { font-size: 2.6rem !important; }

	/* un point par jour */
	.cd-dots-card { padding: var(--space-3) var(--space-4); gap: var(--space-2); }
	.dots-top { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-2); }
	.dots-top b { font-family: var(--font-display); font-size: var(--fs-3xl); font-weight: 700; color: var(--accent-text); }
	.dots-top span { font-family: var(--font-display); font-size: var(--fs-md); font-weight: 600; color: var(--text-secondary); }
	.dots { display: grid; grid-template-columns: repeat(14, 1fr); gap: 5px; }
	.dot { aspect-ratio: 1; border-radius: 50%; background: var(--raised); border: 1px solid var(--border-soft); display: grid; place-items: center; font-style: normal; font-size: 0.6rem; color: var(--on-accent); }
	.dot.on { background: var(--accent); border-color: var(--accent); }
	.dot.now { background: var(--surface); border: 2px solid var(--accent-text); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent); }
	.dot.end { background: var(--accent-text); border-color: var(--accent-text); color: #fff; }
	.dots-kh { text-align: center; }

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
		/* marge basse réduite (3.5rem → 1rem) : la bande de compte à rebours a pris ~4 rem en haut de page et les deux
		   horloges doivent tenir ensemble sur un iPhone ; les silhouettes (opacité .14) peuvent passer sous le statut */
		padding: var(--space-6) var(--space-6) calc(var(--space-6) + 1rem);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		overflow: hidden;
		/* 1 0 auto : les cartes grandissent pour remplir l'écran mais ne sont jamais écrasées (avant : `flex: 1`, qui
		   rognait l'heure et la date quand la page gagnait une ligne) — la page défile si l'écran est trop court. */
		flex: 1 0 auto;
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
