<!--
  Écran 1 — Texte. Squelette complet en T5.1 ; T5.2 le complète : importation d'un fichier
  texte local (FileReader, aucun envoi réseau), compteur et avertissement de longueur,
  passage direct à la vérification quand l'analyse n'a rien à signaler.
  Autres tâches : ne pas y toucher.
-->
<script lang="ts">
  import { MAX_INPUT_LENGTH } from "../../core/index.ts";
  import AnalysisStatus from "../components/AnalysisStatus.svelte";
  import BundledModelOffer from "../components/BundledModelOffer.svelte";
  import LanguageSelect from "../components/LanguageSelect.svelte";
  import ModeSelect from "../components/ModeSelect.svelte";
  import { checkImportFile, normalizeImportedText } from "../components/review-import.ts";
  import { app } from "../state.svelte.ts";

  const tooLong = $derived(app.text.length > MAX_INPUT_LENGTH);
  const nearLimit = $derived(!tooLong && app.text.length > MAX_INPUT_LENGTH * 0.9);

  let importError = $state<string | null>(null);
  let importing = $state(false);

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    importError = null;
    await app.analyze();
    // Sans avertissement à lire, on passe directement à la vérification.
    if (
      app.screen === "text" &&
      app.analysisStatus === "done" &&
      app.warnings.length === 0 &&
      !app.analysisStale
    ) {
      app.goTo("review");
    }
  }

  /** Lit un fichier local en mémoire (aucun envoi) ; les messages ne citent jamais son contenu. */
  function importFile(event: Event & { currentTarget: HTMLInputElement }): void {
    const input = event.currentTarget;
    const file = input.files?.[0];
    importError = null;
    if (!file) return;
    const problem = checkImportFile(file.name, file.size);
    if (problem) {
      importError = problem;
      input.value = "";
      return;
    }
    importing = true;
    const reader = new FileReader();
    reader.onload = () => {
      importing = false;
      if (typeof reader.result === "string") app.setText(normalizeImportedText(reader.result));
      input.value = "";
    };
    reader.onerror = () => {
      importing = false;
      importError = "Lecture du fichier impossible.";
      input.value = "";
    };
    reader.readAsText(file, "utf-8");
  }
</script>

<section aria-labelledby="h-text">
  <h2 id="h-text">1. Texte</h2>
  <BundledModelOffer />
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
      </p>
      {#if tooLong}
        <p class="notice error" role="alert">
          Texte trop long : le moteur accepte au maximum {MAX_INPUT_LENGTH.toLocaleString("fr-CH")} caractères.
          Raccourcissez-le ou analysez-le en plusieurs fois.
        </p>
      {:else if nearLimit}
        <p class="notice" role="status">Le texte approche de la limite du moteur.</p>
      {/if}
      {#if app.analysis}
        <p class="hint">Modifier le texte efface l'analyse et les corrections.</p>
      {/if}
    </div>

    <div class="field">
      <label for="source-file"><strong>Ou importer un fichier texte</strong> (.txt, .md)</label>
      <input
        id="source-file"
        type="file"
        accept=".txt,.md,text/plain,text/markdown"
        aria-describedby="source-file-help"
        disabled={importing}
        onchange={importFile}
      />
      <p id="source-file-help" class="hint">
        Le fichier est lu dans ce navigateur et n'est envoyé nulle part.
      </p>
      {#if importError}
        <p class="notice error" role="alert">{importError}</p>
      {/if}
    </div>

    <div class="options">
      <ModeSelect />
      <LanguageSelect />
    </div>

    <div class="actions">
      <button type="submit" class="primary" disabled={!app.canAnalyze}>
        {app.analysis ? "Analyser à nouveau" : "Analyser"}
      </button>
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
