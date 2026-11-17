<!--
  Écran 2 — Vérification. Fichier figé en T5.1 : il assemble trois composants et ne change plus.
  T5.2 complète HighlightedText.svelte et DetectionDetail.svelte ;
  T5.3 complète CorrectionsToolbar.svelte. Chacun ne travaille que dans ses fichiers.
-->
<script lang="ts">
  import CorrectionsToolbar from "../components/CorrectionsToolbar.svelte";
  import DetectionDetail from "../components/DetectionDetail.svelte";
  import HighlightedText from "../components/HighlightedText.svelte";
  import { app } from "../state.svelte.ts";
</script>

<section aria-labelledby="h-review">
  <h2 id="h-review">2. Vérification</h2>
  {#if app.analysis}
    <p>
      {app.detectionCount === 1 ? "1 détection" : `${app.detectionCount} détections`} à vérifier avant
      de continuer.
    </p>
    <div class="layout">
      <div class="text"><HighlightedText /></div>
      <div class="side">
        <DetectionDetail />
        <CorrectionsToolbar />
      </div>
    </div>
    <div class="actions">
      <button type="button" onclick={() => app.goTo("text")}>Retour au texte</button>
      <button
        type="button"
        class="primary"
        disabled={app.analysisStale}
        onclick={() => app.goTo("result")}
      >
        Voir le résultat
      </button>
      {#if app.analysisStale}
        <span class="hint">Relancez l'analyse (écran 1) : les réglages ont changé.</span>
      {/if}
    </div>
  {:else}
    <p class="notice">Aucune analyse : commencez par l'écran « Texte ».</p>
    <button type="button" onclick={() => app.goTo("text")}>Aller au texte</button>
  {/if}
</section>

<style>
  .layout {
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  }

  .side {
    display: grid;
    gap: 1rem;
    align-content: start;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  @media (max-width: 48rem) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
