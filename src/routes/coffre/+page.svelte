<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { userStore, auth } from '$lib/auth';
	import { ogImageUrl } from '$lib/api';
	import YearList from './components/YearList.svelte';
	import MonthList from './components/MonthList.svelte';
	import DayList from './components/DayList.svelte';
	import DayFiles from './components/DayFiles.svelte';
	import Breadcrumb from './components/Breadcrumb.svelte';

	let { data } = $props();

	let year = $state<string | null>(null);
	let month = $state<string | null>(null);
	let day = $state<string | null>(null);
	let initialFile = $state<string | null>(null); // consommé une seule fois au deep link
	let deepLinkApplied = false; // empêche de réappliquer le deep link si on revient à year=null
	let skipPush = false; // éviter de pousser quand on revient via popstate

	// Niveau de navigation pour les transitions (0=années, 1=mois, 2=jours)
	const navLevel = $derived(day !== null ? 2 : month !== null ? 1 : year !== null ? 1 : 0);
	let prevNavLevel = 0;
	let slideDir = $state<'left' | 'right'>('left');
	$effect(() => {
		slideDir = navLevel >= prevNavLevel ? 'left' : 'right';
		prevNavLevel = navLevel;
	});

	// Handle deep link on first load — une seule fois
	$effect(() => {
		if (!deepLinkApplied && data.y && data.m && data.d) {
			deepLinkApplied = true;
			year = data.y;
			month = data.m;
			day = data.d;
			initialFile = data.f ?? null;
		}
	});

	// Preview publique : lien partagé + non connecté
	const isSharedLink = $derived(!!(data.y && data.m && data.d && data.f));
	const previewSrc = $derived(
		isSharedLink ? ogImageUrl(`${data.y}/${data.m}/${data.d}/${data.f}`, 1200) : null
	);

	function pushState() {
		if (skipPush) { skipPush = false; return; }
		history.pushState({ year, month, day }, '');
	}

	function selectYear(y: string) { year = y; month = null; day = null; initialFile = null; pushState(); }
	function selectMonth(m: string) { month = m; day = null; initialFile = null; pushState(); }
	function selectDay(d: string) { day = d; initialFile = null; pushState(); }

	function goToCoffre() { year = null; month = null; day = null; initialFile = null; pushState(); }
	function goToYear() { month = null; day = null; initialFile = null; pushState(); }
	function goToMonth() { day = null; initialFile = null; pushState(); }

	function goToday() {
		const now = new Date();
		year = String(now.getFullYear());
		month = String(now.getMonth() + 1).padStart(2, '0');
		day = String(now.getDate()).padStart(2, '0');
		pushState();
	}

	function onPopState(e: PopStateEvent) {
		skipPush = true;
		const s = e.state;
		if (s && typeof s === 'object') {
			year = s.year ?? null;
			month = s.month ?? null;
			day = s.day ?? null;
		} else {
			year = null; month = null; day = null;
		}
	}

	onMount(() => {
		window.addEventListener('popstate', onPopState);
		// Initialiser l'état history après que le deep link ait été appliqué
		// (le $effect du deep link tourne avant onMount)
		history.replaceState({ year, month, day }, '');
	});

	onDestroy(() => {
		window.removeEventListener('popstate', onPopState);
	});
</script>

<svelte:head>
	<title>Chet & Lys · Coffre</title>
</svelte:head>

<div class="page">
	{#if !$userStore}
		{#if isSharedLink && previewSrc}
			<!-- Preview publique : photo partagée visible sans connexion -->
			<div class="preview-page">
				<div class="preview-photo">
					<img src={previewSrc} alt="Souvenir partagé" />
				</div>
				<div class="preview-footer">
					<div class="preview-label">
						<span class="preview-title">Chet & Lys</span>
						<span class="preview-date">{data.d}/{data.m}/{data.y}</span>
					</div>
					<button class="btn-google" onclick={() => auth.signIn()}>
						<svg width="16" height="16" viewBox="0 0 24 24">
							<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
							<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
							<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
							<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
						</svg>
						Ouvrir le coffre · ប្រអប់
					</button>
				</div>
			</div>
		{:else}
			<!-- Auth gate standard -->
			<div class="auth-gate">
				<div class="lock">🗝️</div>
				<h2>Coffre · ប្រអប់</h2>
				<p>Connecte-toi pour accéder aux souvenirs</p>
				<button class="btn-google" onclick={() => auth.signIn()}>
					<svg width="18" height="18" viewBox="0 0 24 24">
						<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
						<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
						<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
						<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
					</svg>
					Se connecter avec Google
				</button>
			</div>
		{/if}
	{:else}
		<!-- Header -->
		<header class="header">
			<Breadcrumb
				{year} {month} {day}
				onCoffre={goToCoffre}
				onYear={goToYear}
				onMonth={goToMonth}
			/>
			<div class="header-actions">
				{#if year === null}
					<button class="icon-btn" onclick={goToday} title="Aujourd'hui · ថ្ងៃនេះ">📅</button>
				{/if}
				<button class="icon-btn" onclick={() => auth.signOut()} title="Déconnexion">
					<img src={$userStore.picture} alt={$userStore.name} class="avatar" />
				</button>
			</div>
		</header>

		<!-- Content -->
		<div class="content">
			{#if day !== null}
				<DayFiles
					{year} {month} {day}
					{initialFile}
					onDayChange={selectDay}
					onDateChange={(y, m, d) => { year = y; month = m; day = d; initialFile = null; pushState(); }}
				/>
			{:else}
				<div class="list-scroll">
					{#key `${year}-${month}`}
						<div class="slide-in slide-{slideDir}">
							{#if year === null}
								<YearList onSelect={selectYear} />
							{:else if month === null}
								<MonthList {year} onSelect={selectMonth} />
							{:else}
								<DayList {year} {month} onSelect={selectDay} />
							{/if}
						</div>
					{/key}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	/* Preview publique (lien partagé, non connecté) */
	.preview-page {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #000;
	}

	.preview-photo {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.preview-photo img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		display: block;
	}

	.preview-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		padding-bottom: calc(var(--space-3) + env(safe-area-inset-bottom));
		background: var(--card);
		border-top: 1px solid var(--border);
		flex-shrink: 0;
	}

	.preview-label {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.preview-title {
		font-size: var(--fs-md);
		font-weight: 600;
		color: var(--accent);
	}

	.preview-date {
		font-size: var(--fs-sm);
		color: var(--muted);
	}

	/* Auth gate */
	.auth-gate {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		gap: var(--space-4);
		padding: var(--space-8);
		text-align: center;
	}

	.lock { font-size: 3rem; }

	h2 {
		font-size: var(--fs-2xl);
		color: var(--accent);
	}

	p {
		color: var(--muted);
		font-size: var(--fs-md);
	}

	.btn-google {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: var(--radius-2xl);
		padding: var(--space-3) var(--space-4);
		font-size: var(--fs-md);
		color: var(--text);
		margin-top: var(--space-2);
		transition: border-color 0.2s;
	}

	.btn-google:hover {
		border-color: var(--accent);
	}

	/* Header */
	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.icon-btn {
		font-size: var(--fs-xl);
		padding: var(--space-1);
		border-radius: var(--radius-full);
		background: none;
	}

	.avatar {
		width: 1.75rem;
		height: 1.75rem;
		border-radius: var(--radius-full);
		border: 1.5px solid var(--border);
		display: block;
	}

	/* Content */
	.content {
		flex: 1;
		overflow: hidden;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	/* Scroll pour les vues liste (Year/Month/Day) */
	.list-scroll {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
		-webkit-overflow-scrolling: touch;
	}

	@keyframes slide-from-left {
		from { transform: translateX(-18px); opacity: 0; }
		to   { transform: translateX(0);     opacity: 1; }
	}

	@keyframes slide-from-right {
		from { transform: translateX(18px); opacity: 0; }
		to   { transform: translateX(0);    opacity: 1; }
	}

	.slide-in.slide-left  { animation: slide-from-right 0.22s ease-out; }
	.slide-in.slide-right { animation: slide-from-left  0.22s ease-out; }
</style>
