<!--
  État de l'analyse dans la barre d'outils (#38) : progression, réglages changés, erreur. Le nombre de
  passages est dans la colonne « À vérifier », les avertissements avec le résultat.
-->
<script lang="ts">
  import { app } from "../state.svelte.ts";

  const stageLabel = $derived(
    app.analysisStage === "ner" ? "Chargement de la reconnaissance des noms" : "Analyse en cours",
  );
</script>

<div class="status" role="status" aria-live="polite">
  {#if app.analysisStatus === "running"}
    <label>
      {stageLabel}…
      <progress max="1" value={app.progress && app.progress > 0 ? app.progress : undefined}
      ></progress>
    </label>
  {:else if app.analysisStale}
    <p class="hint">Les réglages ont changé : l'analyse va être mise à jour.</p>
  {/if}
</div>

{#if app.analysisStatus === "error" && app.errorMessage}
  <p class="notice error" role="alert">{app.errorMessage}</p>
{/if}

<style>
  progress {
    display: block;
    width: 100%;
    max-width: 24rem;
    margin-top: 0.25rem;
  }

  p {
    margin: 0.25rem 0;
  }
</style>
