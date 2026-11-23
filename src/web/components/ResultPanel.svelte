<!--
  Colonne « Texte à copier » (T5.4, page unique depuis #38) : aperçu du texte transformé,
  avertissements, validation obligatoire avant copie, copie (avec ou sans la consigne pour l'IA),
  téléchargement. Le texte transformé est calculé ici (app.refreshTransform) puis effacé par l'état
  à toute modification ; il se recalcule aussitôt.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import { app } from "../state.svelte.ts";
  import ResultCopy from "./ResultCopy.svelte";
  import type { NoticeLanguage } from "./ResultLogic.ts";
  import ResultNotice from "./ResultNotice.svelte";
  import ResultPreview from "./ResultPreview.svelte";
  import ResultWarnings from "./ResultWarnings.svelte";

  // Langue de la consigne : français par défaut, anglais en option. Purement visuel.
  let language = $state<NoticeLanguage>("fr");

  const count = $derived(app.transformed?.applied.length ?? 0);

  // Calcule le texte transformé à l'affichage et après toute invalidation (corrections, session…).
  $effect(() => {
    if (
      app.analysis &&
      app.transformed === null &&
      !app.analysisStale &&
      app.analysisStatus !== "running"
    ) {
      untrack(() => {
        app.refreshTransform();
      });
    }
  });
</script>

<div class="result">
  <div class="pane-title">
    <h3 id="h-result">
      <span class="step" aria-hidden="true">3</span><span class="visually-hidden"
        >Étape 3 :
      </span>Copiez pour l'IA
    </h3>
    {#if app.transformed}
      <span class="hint">{count === 1 ? "1 remplacement" : `${count} remplacements`}</span>
    {/if}
  </div>

  {#if !app.analysis}
    <p class="hint empty">
      {app.analysisStatus === "running" || app.analysisScheduled
        ? "Analyse en cours…"
        : "Le résultat apparaîtra ici."}
    </p>
  {:else if app.analysisStale || app.analysisStatus === "running"}
    <p class="hint" role="status">Mise à jour de l'analyse…</p>
  {:else if app.transformError}
    <p class="notice error" role="alert">
      {app.transformError}
      <button type="button" onclick={() => app.refreshTransform()}>Réessayer</button>
    </p>
  {:else if app.transformed === null}
    <p role="status">Calcul du résultat…</p>
  {/if}

  {#if app.transformed && !app.analysisStale}
    <ResultPreview result={app.transformed} />
    <ResultWarnings part="situational" />
    <ResultCopy {language}>
      {#snippet notice()}
        <ResultNotice bind:language />
      {/snippet}
    </ResultCopy>
    <ResultWarnings part="limits" />
  {/if}
</div>

<style>
  .result {
    display: grid;
    gap: 0.9rem;
    align-content: start;
    min-width: 0;
  }

  .pane-title {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
  }

  h3 {
    margin: 0;
  }

  .pane-title .hint,
  .empty,
  [role="status"] {
    margin: 0;
    font-size: var(--text-small);
  }
</style>
