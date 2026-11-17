<!--
  Écran 3 — Résultat. Fichier figé en T5.1 : il assemble deux composants et ne change plus.
  T5.4 complète components/ResultPanel.svelte ;
  T5.5 complète components/PseudonymsPanel.svelte (affiché en mode Pseudonymisation).
-->
<script lang="ts">
  import PseudonymsPanel from "../components/PseudonymsPanel.svelte";
  import ResultPanel from "../components/ResultPanel.svelte";
  import { app } from "../state.svelte.ts";
</script>

<section aria-labelledby="h-result">
  <h2 id="h-result">3. Résultat</h2>
  {#if app.analysis}
    <ResultPanel />
    {#if app.mode === "pseudonymization"}
      <PseudonymsPanel />
    {/if}
    <div class="actions">
      <button type="button" onclick={() => app.goTo("review")}>Retour à la vérification</button>
      <button type="button" onclick={() => app.goTo("reidentify")}>Réponse du LLM</button>
    </div>
  {:else}
    <p class="notice">Aucune analyse : commencez par l'écran « Texte ».</p>
    <button type="button" onclick={() => app.goTo("text")}>Aller au texte</button>
  {/if}
</section>

<style>
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1rem;
  }
</style>
