<!-- Avertissements affichés avec le résultat (T5.4) : limites, détections non appliquées, NER, parties non traitées. -->
<script lang="ts">
  import { app } from "../state.svelte.ts";
  import { buildWarnings } from "./ResultLogic.ts";

  /** `situational` : avis de cette analyse ; `limits` : limites permanentes, repliées. */
  let { part = "all" }: { part?: "all" | "situational" | "limits" } = $props();

  const items = $derived(
    buildWarnings({
      mode: app.mode,
      detectionCount: app.detectionCount,
      discardedCount: app.discarded.length,
      removedCount: app.corrections.removedIds.length,
      // L'absence de modèle est déjà annoncée en tête de page : pas de doublon (#38).
      analysisWarnings: app.newWarnings,
      transformErrors: app.transformed?.errors ?? [],
    }),
  );

  /*
   * Deux poids : ce qui tient à cette analyse (NER absent, passages écartés, parties non traitées)
   * reste dans l'encadré d'alerte ; les limites permanentes de l'outil, identiques à chaque fois,
   * passent en texte d'aide. Sans avis propre à l'analyse, l'encadré disparaît.
   */
  const situational = $derived(items.filter((item) => item.kind !== "limit"));
  const limits = $derived(items.filter((item) => item.kind === "limit"));
</script>

<section aria-label="À savoir avant de copier">
  {#if part !== "limits" && situational.length > 0}
    <ul class="warnings">
      {#each situational as item, i (i)}
        <li class:untreated={item.kind === "untreated"}>{item.text}</li>
      {/each}
    </ul>
  {/if}
  {#if part !== "situational"}
    <details class="limits-details">
      <summary class="hint">Limites à garder en tête</summary>
      <ul class="limits hint">
        {#each limits as item, i (i)}
          <li>{item.text}</li>
        {/each}
      </ul>
    </details>
  {/if}
</section>

<style>
  .warnings {
    margin: 0 0 0.75rem;
    padding: 0.6rem 0.9rem 0.6rem 2rem;
    border: 1px solid var(--warn-border);
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

  .limits-details summary {
    cursor: pointer;
    font-size: var(--text-small);
  }

  .limits {
    margin: 0.35rem 0 0;
    padding-left: 1.25rem;
  }
</style>
