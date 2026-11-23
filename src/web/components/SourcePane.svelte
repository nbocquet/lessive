<!--
  Colonne « Texte original » du parcours sur une page (#38).
  Sans correction : zone de saisie ; le collage et l'import lancent l'analyse tout de suite, la
  frappe après une pause (app.setText). Dès qu'une correction existe, le texte est figé et affiché
  surligné ; « Modifier le texte » abandonne les corrections après confirmation.
  Une sélection, dans la zone de saisie comme dans le texte surligné, peut être ajoutée aux données
  à remplacer, avec toutes ses occurrences. Rien n'est stocké ni journalisé (R5).
-->
<script lang="ts">
  import { ENTITY_TYPES, MAX_INPUT_LENGTH, type EntityType } from "../../core/index.ts";
  import { app } from "../state.svelte.ts";
  import { confirmFocus } from "./confirm-focus.ts";
  import HighlightedText from "./HighlightedText.svelte";
  import { checkImportFile, normalizeImportedText } from "./review-import.ts";
  import { typeName } from "./review-labels.ts";
  import { planManualSpans, snapToCodePoints } from "./review-selection.ts";

  let { onSelectDetection }: { onSelectDetection?: () => void } = $props();

  let textarea: HTMLTextAreaElement | undefined = $state();
  let editTrigger: HTMLButtonElement | undefined = $state();
  let confirming = $state(false);
  let importError = $state<string | null>(null);
  let importing = $state(false);
  let selectionType = $state<EntityType>("PERSON");
  let message = $state("");
  /** Le prochain `input` vient d'un collage : analyse immédiate. */
  let pasted = false;

  const frozen = $derived(app.hasCorrections);
  const tooLong = $derived(app.text.length > MAX_INPUT_LENGTH);
  const nearLimit = $derived(!tooLong && app.text.length > MAX_INPUT_LENGTH * 0.9);
  const selectionText = $derived(
    app.textSelection ? app.text.slice(app.textSelection.start, app.textSelection.end) : "",
  );
  const canTake = $derived(
    app.analysis !== null && selectionText.trim().length > 0 && app.analysisStatus !== "running",
  );

  function onInput(event: Event & { currentTarget: HTMLTextAreaElement }): void {
    message = "";
    app.setText(event.currentTarget.value, { immediate: pasted });
    pasted = false;
  }

  /** Sélection dans la zone de saisie, en positions UTF-16 du texte original (R7). */
  function onTextareaSelect(): void {
    if (!textarea) return;
    const { selectionStart: a, selectionEnd: b } = textarea;
    if (a === b) {
      app.setTextSelection(null);
      return;
    }
    const range = snapToCodePoints(app.text, Math.min(a, b), Math.max(a, b));
    app.setTextSelection(range.end > range.start ? range : null);
  }

  function takeSelection(): void {
    if (!app.textSelection || !canTake) return;
    const plan = planManualSpans(app.text, app.textSelection, "", selectionType, true);
    if (plan.spans.length === 0) return;
    try {
      app.addManualMany(plan.spans);
      app.setTextSelection(null);
      message =
        plan.spans.length === 1
          ? "Passage ajouté. Le résultat est mis à jour."
          : `${plan.spans.length} occurrences ajoutées. Le résultat est mis à jour.`;
    } catch {
      message = "Ajout impossible pour cette sélection.";
    }
  }

  function requestEdit(): void {
    confirming = true;
  }

  function cancelEdit(): void {
    confirming = false;
    editTrigger?.focus();
  }

  async function confirmEdit(): Promise<void> {
    confirming = false;
    app.discardCorrections();
    message = "Corrections abandonnées : le texte est de nouveau modifiable.";
    // La zone de saisie remplace le texte surligné : on y place le curseur.
    await Promise.resolve();
    textarea?.focus();
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
      if (typeof reader.result === "string") {
        app.setText(normalizeImportedText(reader.result), { immediate: true });
      }
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

<div class="source">
  <div class="pane-title">
    <h3 id="h-source">
      <span class="step" aria-hidden="true">1</span><span class="visually-hidden"
        >Étape 1 :
      </span>Collez le texte
    </h3>
    <span id="source-count" class="hint" class:over={tooLong}>
      {app.text.length.toLocaleString("fr-CH")} / {MAX_INPUT_LENGTH.toLocaleString("fr-CH")}
    </span>
  </div>

  {#if frozen}
    <HighlightedText onSelect={onSelectDetection} />
  {:else}
    <label for="source-text" class="visually-hidden">Texte à protéger</label>
    <textarea
      id="source-text"
      bind:this={textarea}
      placeholder="Collez votre texte ici…"
      spellcheck="false"
      autocomplete="off"
      aria-describedby="source-count"
      value={app.text}
      onpaste={() => (pasted = true)}
      oninput={onInput}
      onselect={onTextareaSelect}
      onkeyup={onTextareaSelect}
      onmouseup={onTextareaSelect}></textarea>
  {/if}

  {#if tooLong}
    <p class="notice error" role="alert">
      Texte trop long : le moteur accepte au maximum {MAX_INPUT_LENGTH.toLocaleString("fr-CH")} caractères.
      Raccourcissez-le ou traitez-le en plusieurs fois.
    </p>
  {:else if nearLimit}
    <p class="notice" role="status">Le texte approche de la limite du moteur.</p>
  {/if}

  <div class="below">
    {#if selectionText.trim() && app.analysis}
      <!-- Une sélection : l'ajouter, avec toutes ses occurrences, au type choisi. -->
      <div class="selection-tools">
        <span class="selection" title={selectionText}
          >« {selectionText.length > 30 ? `${selectionText.slice(0, 30)}…` : selectionText} »</span
        >
        <label for="selection-type" class="visually-hidden">Type de la sélection</label>
        <select id="selection-type" bind:value={selectionType}>
          {#each ENTITY_TYPES as type (type)}
            <option value={type}>{typeName(type)}</option>
          {/each}
        </select>
        <button type="button" class="primary" disabled={!canTake} onclick={takeSelection}
          >Prendre la sélection</button
        >
      </div>
    {:else if app.analysis}
      <span class="hint">Une donnée oubliée ? Sélectionnez-la dans le texte.</span>
    {:else}
      <span></span>
    {/if}

    {#if frozen}
      <button
        type="button"
        class="link"
        bind:this={editTrigger}
        onclick={requestEdit}
        disabled={confirming}>Modifier le texte</button
      >
    {:else}
      <label class="import" class:disabled={importing}>
        Importer un fichier
        <input
          id="source-file"
          class="visually-hidden"
          type="file"
          accept=".txt,.md,text/plain,text/markdown"
          disabled={importing}
          onchange={importFile}
        />
      </label>
    {/if}
  </div>

  {#if confirming}
    <div
      class="notice"
      role="group"
      aria-labelledby="h-edit-confirm"
      tabindex="-1"
      {@attach confirmFocus(cancelEdit)}
    >
      <p id="h-edit-confirm">
        <strong>Modifier le texte ?</strong> Vos corrections seront perdues et l'analyse sera relancée.
      </p>
      <div class="actions">
        <button type="button" class="primary" onclick={() => void confirmEdit()}>
          Oui, modifier
        </button>
        <button type="button" onclick={cancelEdit}>Annuler</button>
      </div>
    </div>
  {/if}
  {#if importError}
    <p class="notice error" role="alert">{importError}</p>
  {/if}
  <p class="hint" role="status" aria-live="polite">{message}</p>
</div>

<style>
  .source {
    display: grid;
    gap: 0.6rem;
    min-width: 0;
  }

  .pane-title {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
  }

  h3 {
    margin: 0;
  }

  .pane-title .hint {
    font-size: var(--text-meta);
    font-variant-numeric: tabular-nums;
  }

  [role="status"] {
    margin: 0;
    font-size: var(--text-small);
  }

  [role="status"]:empty {
    display: none;
  }

  textarea {
    display: block;
    min-height: var(--pane-height, 24rem);
    padding: 0.85rem;
  }

  textarea::placeholder {
    color: var(--muted);
    opacity: 1;
  }

  .below {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    min-height: 2.25rem;
    font-size: var(--text-small);
  }

  .selection-tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }

  .selection {
    max-width: 14rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .selection-tools select {
    width: auto;
    max-width: 100%;
    padding-block: 0.25rem;
    font-size: var(--text-small);
  }

  .selection-tools button {
    padding: 0.3rem 0.7rem;
    font-size: var(--text-small);
  }

  button.link,
  .import {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }

  .import:focus-within {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  .import.disabled {
    opacity: 0.6;
    cursor: default;
  }

  .notice p {
    margin: 0;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.6rem;
  }

  .over {
    color: var(--danger-text);
    font-weight: 700;
  }
</style>
