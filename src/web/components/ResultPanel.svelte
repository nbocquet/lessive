<!--
  T5.4 — Aperçu et sortie : vue avant/après, avertissements, validation obligatoire avant copie,
  copie (avec ou sans la consigne pour l'IA), téléchargement. Le texte transformé est calculé ici
  (app.refreshTransform) puis effacé par l'état à toute modification.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import { app } from "../state.svelte.ts";
  import ResultBeforeAfter from "./ResultBeforeAfter.svelte";
  import ResultCopy from "./ResultCopy.svelte";
  import type { NoticeLanguage } from "./ResultLogic.ts";
  import ResultNotice from "./ResultNotice.svelte";
  import ResultWarnings from "./ResultWarnings.svelte";

  // Langue de la consigne : français par défaut, anglais en option. Purement visuel.
  let language = $state<NoticeLanguage>("fr");

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
  {#if app.analysisStale}
    <p class="notice">
      Les réglages ont changé depuis l'analyse : relancez-la (écran « Texte ») pour obtenir un
      résultat à jour.
    </p>
  {:else if app.transformError}
    <p class="notice error" role="alert">
      {app.transformError}
      <button type="button" onclick={() => app.refreshTransform()}>Réessayer</button>
    </p>
  {:else if app.transformed === null}
    <p role="status">Calcul du résultat…</p>
  {/if}

  {#if app.transformed}
    <ResultWarnings />
    <ResultBeforeAfter original={app.text} result={app.transformed} />
    {#if app.mode === "pseudonymization"}
      <ResultNotice bind:language />
    {/if}
    <ResultCopy {language} />
  {/if}
</div>

<style>
  .result {
    display: grid;
    gap: 1rem;
  }
</style>
