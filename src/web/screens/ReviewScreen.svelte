<!--
  Écran 2 — texte à relire et panneau de correction contextuel.
-->
<script lang="ts">
  import { tick } from "svelte";
  import CorrectionsToolbar from "../components/CorrectionsToolbar.svelte";
  import DetectionDetail from "../components/DetectionDetail.svelte";
  import HighlightedText from "../components/HighlightedText.svelte";
  import ReviewLegend from "../components/ReviewLegend.svelte";
  import { app } from "../state.svelte.ts";

  let side: HTMLElement | undefined = $state();

  // Chaque clic rend les commandes visibles, même si le passage était déjà sélectionné.
  async function showCorrections(): Promise<void> {
    await tick();
    if (!side) return;
    side.scrollTo({ top: 0 });
    if (window.matchMedia("(max-width: 54rem)").matches) {
      side.scrollIntoView({ block: "start" });
    }
  }
</script>

<section aria-labelledby="h-review">
  {#if app.analysis}
    <div class="review-header">
      <div>
        <h2 id="h-review">Vérification</h2>
        <p class="hint">
          {app.detectionCount === 1
            ? "1 passage repéré"
            : `${app.detectionCount} passages repérés`}. Relisez aussi les passages non surlignés.
        </p>
      </div>
      <div class="actions">
        <button type="button" onclick={() => app.goTo("text")}>Retour au texte</button>
        <button
          type="button"
          class="primary"
          disabled={app.analysisStale || app.analysisStatus === "running"}
          onclick={() => app.goTo("result")}>Voir le résultat</button
        >
      </div>
    </div>
    {#if app.analysisStale}
      <p class="notice" role="status">
        Les réglages ont changé. Revenez au texte et relancez l’analyse avant de continuer.
      </p>
    {/if}
    <ReviewLegend />
    <div class="layout">
      <section class="document" aria-labelledby="h-review-document">
        <h3 id="h-review-document">Texte original</h3>
        <p class="hint instructions">
          Cliquez sur un passage surligné pour le modifier. Sélectionnez du texte pour ajouter une
          donnée manquante.
        </p>
        <HighlightedText onSelect={() => void showCorrections()} />
      </section>
      <aside class="side" aria-label="Correction des passages" bind:this={side}>
        <DetectionDetail><CorrectionsToolbar /></DetectionDetail>
      </aside>
    </div>
  {:else}
    <h2 id="h-review">Vérification</h2>
    <p class="notice">Aucune analyse : commencez par l'écran « Texte ».</p>
    <button type="button" onclick={() => app.goTo("text")}>Aller au texte</button>
  {/if}
</section>

<style>
  .review-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem 1.5rem;
    margin-bottom: 1rem;
  }

  h2 {
    margin: 0 0 0.35rem;
  }

  .review-header p {
    margin: 0;
  }

  .layout {
    --review-text-height: clamp(22rem, 57dvh, 44rem);
    display: grid;
    gap: 1.5rem;
    grid-template-columns: minmax(0, 1fr) minmax(20rem, 0.48fr);
    align-items: start;
  }

  .document {
    min-width: 0;
  }

  h3 {
    margin: 0 0 0.35rem;
  }

  .instructions {
    margin: 0 0 0.75rem;
    font-size: var(--text-small);
  }

  .side {
    min-width: 0;
    scroll-margin-top: 1rem;
    max-height: calc(var(--review-text-height) + 5rem);
    overflow-y: auto;
    padding: 0 0.5rem 0 1.25rem;
    border-left: 1px solid var(--border-soft);
    scrollbar-gutter: stable;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  @media (max-width: 54rem) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }

    .side {
      max-height: none;
      overflow: visible;
      padding: 1rem 0 0;
      border-left: 0;
      border-top: 1px solid var(--border-soft);
    }
  }
</style>
