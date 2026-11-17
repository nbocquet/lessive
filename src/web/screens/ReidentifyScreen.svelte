<!--
  Écran 4 — Réponse du LLM (T5.6). La réidentification est une action explicite : jamais
  automatique (SPECIFICATIONS §10.4). Le texte réidentifié contient de nouveau des données
  personnelles ; il n'est ni stocké ni journalisé (R5), seulement copié ou téléchargé à la demande.
-->
<script lang="ts">
  import { reidentify, type ReidentifyResult } from "../../core/index.ts";
  import { prepareReidentifyPreview } from "../components/ReidPreview.ts";
  import ReidPreviewView from "../components/ReidPreviewView.svelte";
  import { app } from "../state.svelte.ts";

  // Un texte réidentifié resté en mémoire n'est pas réutilisé : on repart d'un aperçu vide.
  if (app.reidentified !== null) app.setReidentified(null);

  let result = $state.raw<ReidentifyResult | null>(null);
  let feedback = $state("");

  const sessionEmpty = $derived(app.session === null || app.session.entities().length === 0);
  // L'aperçu n'est valable que tant que le texte réidentifié de l'état correspond.
  const current = $derived(result !== null && app.reidentified === result.text ? result : null);
  const preview = $derived(current ? prepareReidentifyPreview(current) : null);
  const canRun = $derived(!sessionEmpty && app.llmResponse.trim().length > 0);

  function run(): void {
    if (!app.session) return;
    const res = reidentify(app.llmResponse, app.session);
    result = res;
    app.setReidentified(res.text);
    feedback = "";
  }

  async function copy(): Promise<void> {
    if (app.reidentified === null) return;
    try {
      await navigator.clipboard.writeText(app.reidentified);
      feedback = "Texte copié.";
    } catch {
      feedback = "Copie impossible : sélectionnez le texte de l'aperçu et copiez-le à la main.";
    }
  }

  function download(): void {
    if (app.reidentified === null) return;
    const blob = new Blob([app.reidentified], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "reponse-reidentifiee.txt";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    feedback = "Fichier enregistré localement.";
  }
</script>

<section aria-labelledby="h-reidentify">
  <h2 id="h-reidentify">4. Réponse du LLM</h2>

  {#if sessionEmpty}
    <p class="notice">
      Aucune correspondance en mémoire : pseudonymisez d'abord un texte (mode Pseudonymisation), ou
      importez une table de correspondance chiffrée depuis l'écran « Résultat ».
    </p>
    <div class="actions">
      <button type="button" onclick={() => app.goTo("text")}>Aller au texte</button>
      <button type="button" disabled={!app.canGoTo("result")} onclick={() => app.goTo("result")}>
        Aller au résultat
      </button>
    </div>
  {/if}

  <div class="field">
    <label for="llm-response"><strong>Réponse du LLM</strong></label>
    <textarea
      id="llm-response"
      rows="10"
      spellcheck="false"
      autocomplete="off"
      value={app.llmResponse}
      oninput={(e) => app.setLlmResponse(e.currentTarget.value)}></textarea>
    <p class="hint">
      Collez la réponse telle quelle. Les pseudonymes sont retrouvés même s'ils ont été légèrement
      déformés (casse, espaces, crochets).
    </p>
  </div>

  <div class="actions">
    <button type="button" class="primary" disabled={!canRun} onclick={run}>
      Remettre les vrais noms
    </button>
  </div>

  {#if preview && app.reidentified !== null}
    <div class="notice" role="note">
      Ce texte contient de nouveau des données personnelles. Il reste dans ce navigateur : ne le
      partagez qu'avec des personnes autorisées.
    </div>
    <ReidPreviewView {preview} />
    <div class="actions">
      <button type="button" onclick={() => void copy()}>Copier le texte réidentifié</button>
      <button type="button" onclick={download}>Télécharger (.txt)</button>
    </div>
    <p class="hint" role="status" aria-live="polite">{feedback}</p>
  {/if}

  <div class="actions">
    <button type="button" disabled={!app.canGoTo("result")} onclick={() => app.goTo("result")}>
      Retour au résultat
    </button>
  </div>
</section>

<style>
  .field,
  .actions {
    margin: 1rem 0;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
</style>
