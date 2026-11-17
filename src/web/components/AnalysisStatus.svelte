<!-- État de l'analyse : progression, nombre de détections, avertissements, erreur (T5.1). -->
<script lang="ts">
  import { app } from "../state.svelte.ts";

  const stageLabel = $derived(
    app.analysisStage === "ner" ? "Chargement de la reconnaissance des noms" : "Analyse en cours",
  );
  const countLabel = $derived(
    app.detectionCount === 0
      ? "Aucune détection."
      : app.detectionCount === 1
        ? "1 détection."
        : `${app.detectionCount} détections.`,
  );
</script>

<div class="status" role="status" aria-live="polite">
  {#if app.analysisStatus === "running"}
    <label>
      {stageLabel}…
      <progress max="1" value={app.progress && app.progress > 0 ? app.progress : undefined}
      ></progress>
    </label>
  {:else if app.analysisStatus === "done" && app.analysis}
    <p><strong>{countLabel}</strong></p>
    {#if app.analysisStale}
      <p class="notice">
        Les réglages ont changé depuis cette analyse : relancez l'analyse pour les appliquer.
      </p>
    {/if}
  {/if}
</div>

{#if app.analysisStatus === "error" && app.errorMessage}
  <p class="notice error" role="alert">{app.errorMessage}</p>
{/if}

{#if app.analysisStatus === "done" && app.warnings.length > 0}
  <ul class="warnings" aria-label="Avertissements de l'analyse">
    {#each app.warnings as warning (warning)}
      <li class="notice">{warning}</li>
    {/each}
  </ul>
{/if}

<style>
  progress {
    display: block;
    width: 100%;
    max-width: 24rem;
    margin-top: 0.25rem;
  }

  .warnings {
    margin: 0.5rem 0 0;
    padding: 0;
    list-style: none;
  }

  .warnings li + li {
    margin-top: 0.4rem;
  }

  p {
    margin: 0.25rem 0;
  }
</style>
