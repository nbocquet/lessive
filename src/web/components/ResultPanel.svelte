<!--
  T5.4 — Aperçu et sortie : vue avant/après, avertissements, validation obligatoire avant copie,
  copie (avec ou sans la consigne pour l'IA), téléchargement. Le texte transformé est calculé ici
  (app.refreshTransform) puis effacé par l'état à toute modification.
-->
<script lang="ts">
  import CleaningCategories from "./CleaningCategories.svelte";
  import { untrack } from "svelte";
  import { CLEANING_CATEGORIES } from "../cleaning-categories.ts";
  import { app } from "../state.svelte.ts";
  import ResultBeforeAfter from "./ResultBeforeAfter.svelte";
  import ResultCopy from "./ResultCopy.svelte";
  import type { NoticeLanguage } from "./ResultLogic.ts";
  import ResultNotice from "./ResultNotice.svelte";
  import ResultWarnings from "./ResultWarnings.svelte";

  // Langue de la consigne : français par défaut, anglais en option. Purement visuel.
  let language = $state<NoticeLanguage>("fr");

  const categoriesSummary = $derived.by(() => {
    const total = CLEANING_CATEGORIES.length;
    const count = app.cleaningCategories.length;
    if (count === total) return `toutes (${total})`;
    if (count === 0) return "aucune : le texte reste inchangé";
    return `${count} sur ${total}`;
  });

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
  <!-- Repliées par défaut : le résumé dit l'état, le parcours principal reste lire → valider → copier. -->
  <details class="categories">
    <summary>
      <span class="summary-label">Catégories remplacées</span>
      <span class="hint">{categoriesSummary}</span>
    </summary>
    <CleaningCategories />
  </details>
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
    <ResultCopy {language} />
    {#if app.mode === "pseudonymization"}
      <ResultNotice bind:language />
    {/if}
  {/if}
</div>

<style>
  .result {
    display: grid;
    gap: 1.5rem;
  }

  .categories {
    border-bottom: 1px solid var(--border-soft);
    padding-bottom: 0.75rem;
  }

  .categories summary {
    padding: 0.6rem 0 0;
    cursor: pointer;
  }

  .categories .summary-label {
    margin-right: 0.75rem;
    font-weight: 600;
  }

  .categories[open] summary {
    margin-bottom: 0.25rem;
  }
</style>
