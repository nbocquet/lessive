<!-- Avertissements affichés avec le résultat (T5.4) : limites, détections non appliquées, NER, parties non traitées. -->
<script lang="ts">
  import { app } from "../state.svelte.ts";
  import { buildWarnings } from "./ResultLogic.ts";

  const items = $derived(
    buildWarnings({
      mode: app.mode,
      detectionCount: app.detectionCount,
      discardedCount: app.discarded.length,
      removedCount: app.corrections.removedIds.length,
      analysisWarnings: app.warnings,
      transformErrors: app.transformed?.errors ?? [],
    }),
  );
</script>

<section aria-labelledby="h-warnings">
  <h3 id="h-warnings">À savoir avant de copier</h3>
  <ul class="warnings">
    {#each items as item, i (i)}
      <li class:untreated={item.kind === "untreated"}>{item.text}</li>
    {/each}
  </ul>
</section>

<style>
  h3 {
    margin: 0 0 0.25rem;
    font-size: 1rem;
  }

  .warnings {
    margin: 0;
    padding: 0.6rem 0.9rem 0.6rem 2rem;
    border: 2px solid var(--warn-border);
    border-radius: var(--radius);
    background: var(--warn-bg);
    color: var(--warn-text);
  }

  li + li {
    margin-top: 0.25rem;
  }

  .untreated {
    font-weight: 600;
  }
</style>
