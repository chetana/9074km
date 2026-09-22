<script lang="ts">
	import { Smile, Camera, Mic, Send } from 'lucide-svelte';
	interface Props {
		inputText: string;
		sending: boolean;
		recording: boolean;
		speaking: boolean;
		vadLoading: boolean;
		transcribing: boolean;
		showEmojis: boolean;
		placeholder: string;
		emojis: string[];
		onInput: () => void;
		onKeydown: (e: KeyboardEvent) => void;
		onSend: () => void;
		onToggleEmojis: () => void;
		onInsertEmoji: (emoji: string) => void;
		onPickImage: () => void;
		onToggleRecording: () => void;
	}

	let {
		inputText = $bindable(), sending, recording, speaking, vadLoading, transcribing,
		showEmojis, placeholder, emojis,
		onInput, onKeydown, onSend, onToggleEmojis, onInsertEmoji, onPickImage, onToggleRecording
	}: Props = $props();
</script>

{#if showEmojis}
	<div class="emoji-bar">
		{#each emojis as e}
			<button class="emoji-btn" onclick={() => onInsertEmoji(e)}>{e}</button>
		{/each}
	</div>
{/if}

<div class="input-bar">
	<div class="composer-pill">
		<button class="action-btn" class:active={showEmojis} onclick={onToggleEmojis} aria-label="Emojis"><Smile size={20} /></button>
		<button class="action-btn" onclick={onPickImage} disabled={sending || recording || transcribing} aria-label="Image"><Camera size={20} /></button>
		<button
			class="action-btn"
			class:recording={recording && !speaking}
			class:speaking
			onclick={onToggleRecording}
			disabled={sending || transcribing}
			aria-label={vadLoading ? 'Chargement…' : recording ? 'Arrêter' : 'Vocal'}
		>
			{#if recording || speaking}
				<span class="wav-bars" class:wav-active={speaking}><span></span><span></span><span></span><span></span><span></span></span>
			{:else}
				{#if transcribing}…{:else if vadLoading}⏳{:else}<Mic size={20} />{/if}
			{/if}
		</button>
		<textarea
			class="input"
			bind:value={inputText}
			oninput={onInput}
			onkeydown={onKeydown}
			{placeholder}
			rows="1"
			disabled={sending}
		></textarea>
		<button
			class="send-btn"
			class:is-sending={sending}
			onclick={onSend}
			disabled={!inputText.trim() || sending}
			aria-label="Envoyer"
		>
			{#if sending}
				<span class="send-sparkle">✦</span>
			{:else}
				<span class="send-arrow"><Send size={18} /></span>
			{/if}
		</button>
	</div>
</div>

<style>
	.emoji-bar {
		display: grid;
		grid-template-rows: 1fr 1fr;
		grid-auto-flow: column;
		overflow-x: auto;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3);
		background: var(--surface);
		border-top: 1px solid var(--border);
		flex-shrink: 0;
		scrollbar-width: none;
	}
	.emoji-bar::-webkit-scrollbar { display: none; }
	.emoji-btn {
		font-size: 1.5rem;
		line-height: 1;
		width: 2.5rem;
		height: 2.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-sm);
		transition: transform 0.12s;
	}
	.emoji-btn:active { transform: scale(0.82); }

	.input-bar {
		padding: var(--space-2) var(--space-3) calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
		/* Même opacité de base que .glass (app.css), mais en dégradé montant depuis transparent :
		   l'input-bar n'a pas de bord net comme un header, elle se fond dans le fil de discussion
		   au-dessus. Sky (voile compris) reste visible en transparence dans le dégradé. */
		background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--bg) 40%, transparent) 30%, color-mix(in srgb, var(--bg) 72%, transparent) 55%);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
		flex-shrink: 0;
	}

	/* Pilule unique regroupant emoji/photo/micro/texte/envoi — plus des
	   éléments séparés flottant sur le fond, esprit "papier à lettres". */
	.composer-pill {
		display: flex;
		align-items: flex-end;
		gap: var(--space-1);
		background: var(--raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		padding: var(--space-1);
		box-shadow: var(--shadow-sm);
	}

	.action-btn {
		width: 2.625rem;
		height: 2.625rem;
		border-radius: var(--radius-full);
		background: transparent;
		border: none;
		color: var(--text-secondary);
		font-size: 1.15rem;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: opacity 0.15s, transform 0.15s, color 0.15s, background 0.15s;
	}
	.action-btn:hover { color: var(--text); background: color-mix(in srgb, var(--accent) 8%, transparent); }
	.action-btn:active { transform: scale(0.9); }
	.action-btn:disabled { opacity: 0.35; }
	.action-btn.active { color: var(--accent-deep); background: color-mix(in srgb, var(--accent) 12%, transparent); }

	.action-btn.recording {
		background: #e53935;
		color: #fff;
		border-color: #e53935;
		animation: pulse-rec 1.2s ease-in-out infinite;
	}
	.action-btn.speaking {
		background: #2e7d32;
		color: #fff;
		border-color: #2e7d32;
		animation: pulse-speak 0.6s ease-in-out infinite;
	}
	@keyframes pulse-rec {
		0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, #e53935 40%, transparent); }
		50% { box-shadow: 0 0 0 6px color-mix(in srgb, #e53935 0%, transparent); }
	}
	@keyframes pulse-speak {
		0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, #2e7d32 50%, transparent); }
		50% { box-shadow: 0 0 0 8px color-mix(in srgb, #2e7d32 0%, transparent); }
	}

	.wav-bars { display: inline-flex; align-items: center; gap: 2px; height: 20px; }
	.wav-bars span { display: block; width: 3px; height: 3px; border-radius: 2px; background: #fff; animation: wav 1.4s ease-in-out infinite; }
	.wav-bars span:nth-child(1) { animation-delay: 0ms; }
	.wav-bars span:nth-child(2) { animation-delay: 160ms; }
	.wav-bars span:nth-child(3) { animation-delay: 80ms; }
	.wav-bars span:nth-child(4) { animation-delay: 220ms; }
	.wav-bars span:nth-child(5) { animation-delay: 40ms; }
	.wav-bars.wav-active span { animation-duration: 0.4s; }
	@keyframes wav { 0%, 100% { height: 3px; } 50% { height: 18px; } }

	.input {
		flex: 1;
		background: transparent;
		border: none;
		padding: var(--space-2) var(--space-1);
		font-size: 1rem;
		color: var(--text);
		font-family: inherit;
		resize: none;
		min-height: 2.625rem;
		max-height: 8rem;
		overflow-y: auto;
		line-height: 1.5;
	}
	.input::placeholder { color: var(--muted); }
	.input:focus {
		outline: none;
	}

	.send-btn {
		width: 2.625rem;
		height: 2.625rem;
		border-radius: var(--radius-full);
		background: linear-gradient(150deg, var(--accent), var(--accent-warm));
		color: var(--on-accent);
		font-size: var(--fs-lg);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: opacity 0.15s, transform 0.15s;
		box-shadow: var(--shadow-accent);
	}
	.send-btn:not(:disabled):hover { transform: scale(1.07); }
	.send-btn:not(:disabled):active { transform: scale(0.89); }
	.send-btn:disabled { opacity: 0.35; box-shadow: none; }
	.send-btn.is-sending { opacity: 1; animation: send-pulse 1.2s ease-in-out infinite; }

	@keyframes send-pulse {
		0%, 100% { box-shadow: 0 0 10px color-mix(in srgb, var(--accent) 30%, transparent); }
		50% { box-shadow: 0 0 20px color-mix(in srgb, var(--accent) 50%, transparent); }
	}
	.send-sparkle { display: inline-block; animation: sparkle-spin 0.8s linear infinite; font-size: var(--fs-lg); }
	@keyframes sparkle-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
	.send-arrow { display: inline-block; transition: transform 0.15s; }
	.send-btn:not(:disabled):hover .send-arrow { transform: translateX(2px); }
</style>
