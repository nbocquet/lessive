<!--
  Parcours sur une page (#38) : texte original, données à vérifier et texte à copier côte à côte,
  puis la réponse de l'assistant en dessous. Aucune navigation par étapes : l'analyse se lance au
  collage et chaque correction met le résultat à jour.
  Grand écran : trois colonnes. Écran intermédiaire : le texte au-dessus, vérification et résultat
  côte à côte. Téléphone : zones empilées, avec des liens d'accès directs.
-->
<script lang="ts">
  import { CLEANING_CATEGORIES } from "../cleaning-categories.ts";
  import AnalysisStatus from "../components/AnalysisStatus.svelte";
  import CleaningCategories from "../components/CleaningCategories.svelte";
  import EntityReviewList from "../components/EntityReviewList.svelte";
  import ModelStatus from "../components/ModelStatus.svelte";
  import ModeSelect from "../components/ModeSelect.svelte";
  import PseudonymsPanel from "../components/PseudonymsPanel.svelte";
  import ResponsePane from "../components/ResponsePane.svelte";
  import ResultPanel from "../components/ResultPanel.svelte";
  import SourcePane from "../components/SourcePane.svelte";
  import { app } from "../state.svelte.ts";

  let { onConfigureModel }: { onConfigureModel: () => void } = $props();

  let review: HTMLElement | undefined = $state();

  /** Modèle prêt et activé : l'encadré d'état s'efface, la page reste au plus simple. */
  const modelOk = $derived(
    !app.modelBusy && app.ner && (app.modelStatus === "ready" || app.modelStatus === "stored"),
  );

  const categoriesSummary = $derived.by(() => {
    const total = CLEANING_CATEGORIES.length;
    const count = app.cleaningCategories.length;
    if (count === total) return `toutes (${total})`;
    if (count === 0) return "aucune : le texte reste inchangé";
    return `${count} sur ${total}`;
  });

  /** Sur téléphone, un clic sur un passage amène au détail de la colonne « À vérifier ». */
  function showReview(): void {
    if (window.matchMedia("(max-width: 54rem)").matches) {
      review?.scrollIntoView({ block: "start" });
    }
  }
</script>

<section aria-labelledby="h-workspace">
  <h2 id="h-workspace" class="visually-hidden">Préparez votre texte pour l'IA</h2>

  <nav class="jump" aria-label="Zones de travail">
    <a href="#texte">1. Coller</a>
    <a href="#verifier">2. Vérifier</a>
    <a href="#resultat">3. Copier</a>
    <a href="#reponse">4. Réponse</a>
  </nav>

  <div class="toolbar">
    <ModeSelect compact />
    <details class="categories">
      <summary>
        <span class="summary-label">Catégories</span>
        <span class="hint">{categoriesSummary}</span>
      </summary>
      <div class="categories-body"><CleaningCategories /></div>
    </details>
    <div class="state">
      {#if !modelOk}
        <ModelStatus compact onConfigure={onConfigureModel} />
      {/if}
      <AnalysisStatus />
    </div>
  </div>

  <div class="workspace">
    <section id="texte" class="pane source" aria-labelledby="h-source">
      <SourcePane onSelectDetection={showReview} />
    </section>
    <section id="verifier" class="pane review" aria-labelledby="h-entities" bind:this={review}>
      <EntityReviewList />
    </section>
    <section id="resultat" class="pane result" aria-labelledby="h-result">
      <ResultPanel />
    </section>
  </div>

  <section id="reponse" class="response" aria-labelledby="h-response">
    <ResponsePane />
    {#if app.mode === "pseudonymization" && app.session}
      <details class="session">
        <summary>Session de pseudonymisation <span class="hint">nouvelle, sauvegarde</span></summary
        >
        <PseudonymsPanel />
      </details>
    {/if}
  </section>
</section>

<style>
  .jump {
    display: none;
    flex-wrap: wrap;
    gap: 0.4rem 1rem;
    margin: 0.75rem 0;
    font-size: var(--text-small);
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1.75rem;
    margin: 0.75rem 0 1rem;
    padding: 0.6rem 0;
    border-top: 1px solid var(--border-soft);
    border-bottom: 1px solid var(--border-soft);
    font-size: var(--text-small);
  }

  .categories summary {
    cursor: pointer;
  }

  .categories .summary-label {
    margin-right: 0.5rem;
    font-weight: 600;
  }

  /* Ouvertes, les catégories passent sous la barre, sur toute sa largeur. */
  .categories[open] {
    order: 1;
    flex-basis: 100%;
  }

  .categories-body {
    padding-top: 0.5rem;
  }

  .state {
    flex: 1 1 12rem;
    min-width: 0;
  }

  .session {
    margin-top: 1.25rem;
  }

  .session summary {
    cursor: pointer;
    font-weight: 600;
    font-size: var(--text-small);
  }

  .session summary .hint {
    margin-left: 0.5rem;
    font-weight: 400;
  }

  .workspace {
    --pane-height: clamp(18rem, 55dvh, 40rem);
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(16rem, 0.8fr) minmax(0, 1fr);
    grid-template-areas: "source review result";
    gap: 1.5rem;
    align-items: start;
    margin-top: 1rem;
  }

  .pane {
    min-width: 0;
    scroll-margin-top: 1rem;
  }

  .source {
    grid-area: source;
  }

  .review {
    grid-area: review;
    padding: 0 1.25rem;
    border-right: 1px solid var(--border-soft);
    border-left: 1px solid var(--border-soft);
  }

  .result {
    grid-area: result;
  }

  .response {
    margin-top: 2rem;
    padding-top: 1.25rem;
    border-top: 1px solid var(--border-soft);
    scroll-margin-top: 1rem;
  }

  /* Écran intermédiaire : le texte sur toute la largeur, vérification et résultat côte à côte. */
  @media (max-width: 72rem) {
    .workspace {
      grid-template-columns: minmax(16rem, 0.8fr) minmax(0, 1fr);
      grid-template-areas:
        "source source"
        "review result";
    }

    .review {
      padding: 0 1.25rem 0 0;
      border-left: 0;
    }
  }

  /* Téléphone : zones empilées, liens d'accès directs. */
  @media (max-width: 54rem) {
    .jump {
      display: flex;
    }

    .workspace {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        "source"
        "review"
        "result";
    }

    .review {
      padding: 1rem 0 0;
      border-top: 1px solid var(--border-soft);
      border-right: 0;
    }

    .result {
      padding-top: 1rem;
      border-top: 1px solid var(--border-soft);
    }
  }
</style>
