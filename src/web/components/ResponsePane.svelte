<!--
  Réponse de l'assistant (T5.6, page unique depuis #38). La réidentification se fait en direct :
  app.reidentification suit la saisie et les corrections de la table. Le texte réidentifié contient
  de nouveau des données personnelles : il n'est ni stocké ni journalisé (R5), seulement copié ou
  téléchargé à la demande.
-->
<script lang="ts">
  import { app } from "../state.svelte.ts";
  import PseudoImport from "./PseudoImport.svelte";
  import { countLabel, prepareReidentifyPreview } from "./ReidPreview.ts";
  import ReidPreviewView from "./ReidPreviewView.svelte";

  let feedback = $state("");

  const sessionEmpty = $derived.by(() => {
    void app.sessionRevision;
    return app.session === null || app.session.entities().length === 0;
  });
  const result = $derived(app.reidentification);
  const preview = $derived(result ? prepareReidentifyPreview(result) : null);

  async function copy(): Promise<void> {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.text);
      feedback = "Texte copié.";
    } catch {
      feedback = "Copie impossible : sélectionnez le texte de l'aperçu et copiez-le à la main.";
    }
  }

  function download(): void {
    if (!result) return;
    const blob = new Blob([result.text], { type: "text/plain;charset=utf-8" });
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

<div class="response-heading">
  <div>
    <h2 id="h-response">
      <span class="step" aria-hidden="true">4</span><span class="visually-hidden"
        >Étape 4 :
      </span>Retrouvez les données dans la réponse
    </h2>
    <p class="hint">Après votre échange avec l'assistant, collez sa réponse ci-dessous.</p>
  </div>
  <span class="hint">Facultatif</span>
</div>

{#if app.mode === "masking" && sessionEmpty}
  <div class="notice" role="note">
    <p>
      <strong>Rien à retrouver en masquage.</strong> Ce mode ne garde aucune correspondance : les valeurs
      masquées ne peuvent pas être remises dans la réponse de l'assistant.
    </p>
    <div class="actions">
      <button type="button" onclick={() => app.setMode("pseudonymization")}>
        Passer en pseudonymisation
      </button>
    </div>
  </div>
{:else}
  <div class="grid">
    <div class="field">
      <div class="col-title">
        <label for="llm-response">Réponse de l'assistant</label>
      </div>
      <textarea
        id="llm-response"
        spellcheck="false"
        autocomplete="off"
        placeholder="Collez une réponse contenant les repères (PERSONNE_001…)"
        value={app.llmResponse}
        oninput={(e) => {
          feedback = "";
          app.setLlmResponse(e.currentTarget.value);
        }}></textarea>
      <p class="hint">
        Les repères sont retrouvés même légèrement déformés (casse, espaces, crochets).
      </p>
    </div>

    <div class="restored">
      <!-- Même ligne de titre que la réponse collée : les deux zones commencent à la même hauteur. -->
      <div class="col-title">
        <h3 id="h-restored">Réponse réidentifiée</h3>
        {#if preview}
          <span class="hint" role="status">
            {countLabel(preview.replacedCount, "repère retrouvé", "repères retrouvés")}
          </span>
        {/if}
      </div>
      {#if preview && result}
        <ReidPreviewView {preview} />
        <p class="hint">
          Ce texte contient de nouveau des données personnelles. Il reste dans ce navigateur.
        </p>
        <div class="actions">
          <button type="button" onclick={() => void copy()}>Copier la réponse</button>
          <button type="button" onclick={download}>Télécharger (.txt)</button>
        </div>
        <p class="hint" role="status" aria-live="polite">{feedback}</p>
      {:else}
        <div class="placeholder hint">
          {#if sessionEmpty}
            Aucune correspondance en mémoire : traitez d'abord un texte en pseudonymisation, ou
            reprenez une session sauvegardée ci-dessous. Les correspondances disparaissent au
            rechargement de la page.
          {:else}
            La réponse réidentifiée apparaîtra ici, en direct.
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- Sans correspondance en mémoire (après un rechargement), la table chiffrée se reprend ici. -->
{#if sessionEmpty}
  <details class="resume">
    <summary>Reprendre une session sauvegardée <span class="hint">fichier chiffré</span></summary>
    <div class="resume-content">
      <PseudoImport />
    </div>
  </details>
{/if}

<style>
  .response-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    justify-content: space-between;
    gap: 0.5rem 1.5rem;
    margin-bottom: 1rem;
  }

  h2 {
    margin: 0 0 0.25rem;
  }

  .response-heading p {
    margin: 0;
  }

  .grid {
    --response-height: clamp(14rem, 40dvh, 26rem);
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 1.5rem;
    align-items: start;
  }

  .field {
    display: grid;
    gap: 0.75rem;
  }

  /* Titres des deux colonnes : même hauteur, pour aligner la saisie et l'aperçu. */
  .col-title {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.25rem 1rem;
    min-height: 1.5rem;
    margin-bottom: -0.25rem;
  }

  .col-title label,
  .col-title h3 {
    margin: 0;
    font-size: var(--text-small);
    font-weight: 700;
    line-height: 1.5;
  }

  .col-title .hint {
    font-size: var(--text-small);
  }

  textarea {
    display: block;
    height: var(--response-height);
    min-height: 8rem;
    padding: 0.85rem;
  }

  .placeholder {
    display: grid;
    place-items: center;
    height: var(--response-height);
    padding: 1rem;
    border: 1px dashed var(--border-soft);
    border-radius: var(--radius);
    text-align: center;
  }

  .restored {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
  }

  .restored p,
  .notice p {
    margin: 0;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .notice .actions {
    margin-top: 0.75rem;
  }

  [role="status"]:empty {
    display: none;
  }

  .resume summary {
    padding: 0.6rem 0;
    font-weight: 600;
    cursor: pointer;
  }

  .resume summary .hint {
    margin-left: 0.5rem;
    font-weight: 400;
  }

  .resume-content {
    padding: 0.25rem 0 0 1.2rem;
  }

  @media (max-width: 54rem) {
    .grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
