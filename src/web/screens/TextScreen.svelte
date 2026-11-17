<!--
  Écran 1 — Texte. Squelette complet en T5.1 ; T5.2 le complète (importation de fichier,
  progression détaillée, aller directement à la vérification). Autres tâches : ne pas y toucher.
-->
<script lang="ts">
  import { MAX_INPUT_LENGTH } from "../../core/index.ts";
  import AnalysisStatus from "../components/AnalysisStatus.svelte";
  import LanguageSelect from "../components/LanguageSelect.svelte";
  import ModeSelect from "../components/ModeSelect.svelte";
  import { app } from "../state.svelte.ts";

  const tooLong = $derived(app.text.length > MAX_INPUT_LENGTH);

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    void app.analyze();
  }
</script>

<section aria-labelledby="h-text">
  <h2 id="h-text">1. Texte</h2>
  <form onsubmit={submit}>
    <div class="field">
      <label for="source-text"><strong>Texte à protéger</strong></label>
      <textarea
        id="source-text"
        rows="12"
        spellcheck="false"
        autocomplete="off"
        aria-describedby="source-count"
        value={app.text}
        oninput={(e) => app.setText(e.currentTarget.value)}></textarea>
      <p id="source-count" class="hint" class:over={tooLong}>
        {app.text.length.toLocaleString("fr-CH")} / {MAX_INPUT_LENGTH.toLocaleString("fr-CH")} caractères
        {#if tooLong}
          — texte trop long, raccourcissez-le.
        {/if}
      </p>
    </div>

    <div class="options">
      <ModeSelect />
      <LanguageSelect />
    </div>

    <div class="actions">
      <button type="submit" class="primary" disabled={!app.canAnalyze}>Analyser</button>
      {#if app.analysisStatus === "running"}
        <button type="button" onclick={() => app.cancelAnalysis()}>Annuler</button>
      {/if}
      {#if app.analysis && app.analysisStatus !== "running"}
        <button type="button" onclick={() => app.goTo("review")}>Passer à la vérification</button>
      {/if}
    </div>
  </form>

  <AnalysisStatus />
</section>

<style>
  .field {
    margin-bottom: 1rem;
  }

  .options {
    display: grid;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .over {
    color: var(--danger-text);
    font-weight: 700;
  }
</style>
