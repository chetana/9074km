<script lang="ts">
  // Page de récupération post-incident 02/10/2026 : envoie le contenu du cache
  // localStorage (messages de chat, notes, réactions, méta, listes coffre) au serveur
  // qui recrée ce qui manque dans le bucket. Idempotent, ne supprime rien.
  let enCours = $state(false)
  let fait = $state(false)
  let erreur = $state('')
  let resume = $state<any>(null)
  let demande = $state<any>(null)

  function collecter() {
    const messages: { day: string; msgs: unknown[] }[] = []
    const notes: { day: string; text: string }[] = []
    const reactions: { day: string; data: unknown }[] = []
    const metas: { day: string; data: unknown }[] = []
    const lists: { prefix: string; names: string[] }[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k?.startsWith('lys_cache_')) continue
      let v: any
      try { v = JSON.parse(localStorage.getItem(k) ?? '') } catch { continue }
      let m = k.match(/^lys_cache_msg_(\d{4})_(\d{2})_(\d{2})$/)
      if (m && Array.isArray(v)) { messages.push({ day: `${m[1]}-${m[2]}-${m[3]}`, msgs: v }); continue }
      m = k.match(/^lys_cache_cnote_(\d{4})_(\d{2})_(\d{2})$/)
      if (m && typeof v === 'string') { notes.push({ day: `${m[1]}-${m[2]}-${m[3]}`, text: v }); continue }
      m = k.match(/^lys_cache_creact_(\d{4})_(\d{2})_(\d{2})$/)
      if (m && v && typeof v === 'object') { reactions.push({ day: `${m[1]}-${m[2]}-${m[3]}`, data: v }); continue }
      m = k.match(/^lys_cache_cmeta_(\d{4})_(\d{2})_(\d{2})$/)
      if (m && v && typeof v === 'object') { metas.push({ day: `${m[1]}-${m[2]}-${m[3]}`, data: v }); continue }
      m = k.match(/^lys_cache_clist_(.+)$/)
      if (m) {
        const items = Array.isArray(v) ? v : v?.items
        const names = (items ?? []).map((x: any) => x?.name).filter((n: unknown) => typeof n === 'string')
        if (names.length) lists.push({ prefix: m[1], names })
      }
    }
    return { messages, notes, reactions, metas, lists }
  }

  async function restaurer() {
    enCours = true; erreur = ''; fait = false
    try {
      demande = collecter()
      const r = await fetch('/api/recuperation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(demande),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      resume = await r.json()
      fait = true
    } catch (e: any) {
      erreur = e?.message === 'HTTP 401' ? 'Connecte-toi d\'abord sur lys.chetana.fr, puis reviens sur cette page.' : (e?.message ?? String(e))
    } finally {
      enCours = false
    }
  }

  function telecharger() {
    const blob = new Blob([JSON.stringify({ demande, resume }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'recuperation-lys.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const nbJours = $derived(
    demande ? demande.messages.length + demande.notes.length + demande.reactions.length + demande.metas.length : 0,
  )
  const nbMessages = $derived(demande ? demande.messages.reduce((s: number, j: any) => s + j.msgs.length, 0) : 0)
  const nbManquants = $derived(resume ? resume.missingFiles.reduce((s: number, p: any) => s + p.names.length, 0) : 0)
</script>

<div class="recup">
  <h1>🛟 Récupération</h1>
  <p>
    Cette page envoie le contenu enregistré localement sur cet appareil (conversations,
    notes, réactions, listes du coffre) vers le serveur, qui recrée ce qui manque.
    Rien n'est supprimé.
  </p>

  {#if !fait}
    <button class="go" onclick={restaurer} disabled={enCours}>
      {enCours ? 'Envoi en cours…' : 'Récupérer les données de cet appareil'}
    </button>
    {#if erreur}<p class="err">⚠️ {erreur}</p>{/if}
  {:else}
    <div class="ok">
      <p>✅ Terminé. Ce qui a été recréé depuis cet appareil :</p>
      <ul>
        <li>{resume.messagesRestored.reduce((s: number, j: any) => s + j.added, 0)} messages de chat (sur {nbMessages} envoyés, {nbJours} jours de cache)</li>
        <li>{resume.notesRestored.length} notes du coffre</li>
        <li>{resume.reactionsMerged.length} jours de réactions</li>
        <li>{resume.metasRestored.length} métadonnées de jour</li>
        <li><b>{nbManquants} fichiers du coffre manquent encore</b> (ils étaient dans les listes de cet appareil mais n'existent plus sur le serveur)</li>
      </ul>
      {#if nbManquants > 0}
        <p class="warn">📸 Liste des fichiers manquants (photos/vidéos à re-envoyer depuis les téléphones) :</p>
        <pre>{resume.missingFiles.map((p: any) => p.names.join('\n')).join('\n')}</pre>
      {/if}
      <button class="go" onclick={telecharger}>Télécharger le rapport complet</button>
      <p class="tip">Fais aussi tourner cette page sur l'autre téléphone — les caches se complètent.</p>
    </div>
  {/if}
</div>

<style>
  .recup { max-width: 640px; margin: 0 auto; padding: 24px 16px 96px; font-size: 16px; line-height: 1.5; }
  h1 { font-size: 28px; margin-bottom: 12px; }
  .go { display: block; width: 100%; margin: 16px 0; padding: 18px; font-size: 19px; font-weight: bold; border: none; border-radius: 14px; background: var(--jaune, #fbbf24); cursor: pointer; }
  .ok { background: #ecfdf5; border: 1px solid #86efac; border-radius: 14px; padding: 16px; }
  .err { color: #dc2626; font-weight: 600; }
  .warn { margin-top: 12px; font-weight: 600; }
  pre { max-height: 240px; overflow: auto; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; font-size: 12px; white-space: pre-wrap; }
  .tip { color: #64748b; font-size: 14px; margin-top: 12px; }
  ul { margin: 8px 0 8px 20px; }
</style>
