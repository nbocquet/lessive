<!--
  Validation obligatoire avant copie (NF-12), copie, téléchargement (T5.4).
  `app.canCopy` fait foi : tant que le résultat n'est pas validé et à jour, rien ne sort.
-->
<script lang="ts">
  import { tick } from "svelte";
  import { app } from "../state.svelte.ts";
  import { copyToClipboard, downloadTextFile } from "./ResultDom.ts";
  import { buildCopyText, resultFileName, type NoticeLanguage } from "./ResultLogic.ts";

  let { language }: { language: NoticeLanguage } = $props();

  let message = $state("");
  /** Texte à copier à la main quand le presse-papiers est refusé. */
  let fallbackText = $state<string | null>(null);
  let fallbackField: HTMLTextAreaElement | undefined = $state();

  const canValidate = $derived(app.transformed !== null && !app.analysisStale);
  const pseudonymization = $derived(app.mode === "pseudonymization");

  function onValidationChange(event: Event & { currentTarget: HTMLInputElement }): void {
    const box = event.currentTarget;
    message = "";
    fallbackText = null;
    if (box.checked) app.validate();
    else app.unvalidate();
    // L'état fait foi : la case reflète le résultat réel de validate().
    box.checked = app.validated;
  }

  async function copy(withNotice: boolean): Promise<void> {
    fallbackText = null;
    const result = app.transformed;
    if (!app.canCopy || result === null) {
      message = "Validez d'abord le résultat (case « J'ai relu le résultat »).";
      return;
    }
    const text = buildCopyText(result.text, { withNotice, language });
    if (await copyToClipboard(text)) {
      message = withNotice
        ? "Texte copié avec la consigne pour l'IA."
        : "Texte copié dans le presse-papiers.";
      return;
    }
    // Repli : le texte est proposé dans un champ sélectionné, à copier avec Ctrl+C.
    fallbackText = text;
    message =
      "La copie automatique est impossible ici : le texte est sélectionné ci-dessous, copiez-le avec Ctrl+C (ou Cmd+C).";
    await tick();
    fallbackField?.focus();
    fallbackField?.select();
  }

  function download(): void {
    const result = app.transformed;
    if (!app.canCopy || result === null) return;
    downloadTextFile(resultFileName(), result.text);
    message = "Fichier du résultat téléchargé (aucun envoi : tout reste dans ce navigateur).";
  }
</script>

<section aria-labelledby="h-copy">
  <h3 id="h-copy">Validation et copie</h3>
  <label class="validate">
    <input
      type="checkbox"
      checked={app.validated}
      disabled={!canValidate}
      onchange={onValidationChange}
    />
    <span>J'ai relu le résultat</span>
  </label>
  <p class="hint">
    La copie reste bloquée tant que vous n'avez pas coché cette case. Toute modification (texte,
    corrections, mode, session) la décoche.
  </p>

  <div class="actions">
    <button type="button" class="primary" disabled={!app.canCopy} onclick={() => copy(false)}>
      Copier le texte
    </button>
    {#if pseudonymization}
      <button type="button" disabled={!app.canCopy} onclick={() => copy(true)}>
        Copier avec la consigne pour l'IA
      </button>
    {/if}
    <button type="button" disabled={!app.canCopy} onclick={download}>
      Télécharger le résultat (.txt)
    </button>
  </div>

  <p class="status" role="status" aria-live="polite">{message}</p>

  {#if fallbackText !== null}
    <label class="fallback">
      <span class="visually-hidden">Texte à copier</span>
      <textarea readonly rows="8" bind:this={fallbackField} value={fallbackText}></textarea>
    </label>
  {/if}
</section>

<style>
  h3 {
    margin: 0 0 0.25rem;
    font-size: 1rem;
  }

  .validate {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
  }

  .validate input {
    width: 1.25rem;
    height: 1.25rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .status {
    min-height: 1.5rem;
    margin: 0.5rem 0 0;
  }

  .fallback textarea {
    margin-top: 0.25rem;
  }
</style>
