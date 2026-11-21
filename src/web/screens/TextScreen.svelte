<!--
  Écran 1 — rédaction et choix du traitement. Import local, compteur et avertissements de longueur.
-->
<script lang="ts">
  import { MAX_INPUT_LENGTH } from "../../core/index.ts";
  import CleaningCategories from "../components/CleaningCategories.svelte";
  import AnalysisStatus from "../components/AnalysisStatus.svelte";
  import ModelStatus from "../components/ModelStatus.svelte";
  import LanguageSelect from "../components/LanguageSelect.svelte";
  import ModeSelect from "../components/ModeSelect.svelte";
  import { checkImportFile, normalizeImportedText } from "../components/review-import.ts";
  import { app } from "../state.svelte.ts";

  let { onConfigureModel }: { onConfigureModel: () => void } = $props();

  const tooLong = $derived(app.text.length > MAX_INPUT_LENGTH);
  const nearLimit = $derived(!tooLong && app.text.length > MAX_INPUT_LENGTH * 0.9);
  const canContinue = $derived(
    app.analysis !== null && !app.analysisStale && app.analysisStatus !== "running",
  );

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
      app.newWarnings.length === 0 &&
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
  <h2 id="h-text">Texte à analyser</h2>
  <ModelStatus onConfigure={onConfigureModel} />
  <form onsubmit={submit}>
    <div class="workspace">
      <div class="editor">
        <div class="field writing-field">
          <label for="source-text"><strong>Texte à protéger</strong></label>
          <textarea
            id="source-text"
            rows="10"
            placeholder="Collez votre texte ici…"
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
              Texte trop long : le moteur accepte au maximum {MAX_INPUT_LENGTH.toLocaleString(
                "fr-CH",
              )} caractères. Raccourcissez-le ou analysez-le en plusieurs fois.
            </p>
          {:else if nearLimit}
            <p class="notice" role="status">Le texte approche de la limite du moteur.</p>
          {/if}
          {#if app.analysis}
            <p class="hint">Modifier le texte efface l'analyse et les corrections.</p>
          {/if}
        </div>

        <div class="field import-field">
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
      </div>

      <div class="options">
        <ModeSelect />
        <LanguageSelect />
      </div>
    </div>

    <CleaningCategories />

    <!-- Une analyse à jour fait de la vérification l'étape suivante : elle prend l'accent. -->
    <div class="actions">
      <button type="submit" class:primary={!canContinue} disabled={!app.canAnalyze}>
        {app.analysis ? "Analyser à nouveau" : "Analyser"}
      </button>
      {#if app.analysisStatus === "running"}
        <button type="button" onclick={() => app.cancelAnalysis()}>Annuler</button>
      {/if}
      {#if app.analysis && app.analysisStatus !== "running"}
        <button type="button" class:primary={canContinue} onclick={() => app.goTo("review")}
          >Passer à la vérification</button
        >
      {/if}
    </div>
  </form>

  <AnalysisStatus />
</section>

<style>
  .workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(16rem, 0.4fr);
    gap: 1.5rem;
    align-items: start;
  }

  .editor {
    min-width: 0;
  }

  .field {
    margin-bottom: 1rem;
  }

  .writing-field label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: var(--text-small);
  }

  textarea {
    display: block;
    min-height: 20rem;
    padding: 0.85rem;
  }

  textarea::placeholder {
    color: var(--muted);
    opacity: 1;
  }

  #source-count {
    margin: 0.35rem 0 0;
    text-align: right;
    font-size: var(--text-meta);
    font-variant-numeric: tabular-nums;
  }

  .import-field {
    font-size: var(--text-small);
  }

  .import-field label {
    display: block;
    margin-bottom: 0.5rem;
  }

  .import-field .hint {
    margin-bottom: 0;
  }

  .options {
    display: grid;
    gap: 1.25rem;
    padding-left: 1.5rem;
    border-left: 1px solid var(--border-soft);
    font-size: var(--text-small);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    margin: 0.75rem 0 1rem;
  }

  .over {
    color: var(--danger-text);
    font-weight: 700;
  }

  @media (max-width: 54rem) {
    .workspace {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.25rem;
    }

    .options {
      padding: 1rem 0;
      border-left: 0;
      border-top: 1px solid var(--border-soft);
    }

    textarea {
      min-height: 15rem;
    }
  }
</style>
