<!--
  Validation obligatoire avant copie (NF-12), copie, téléchargement (T5.4).
  `app.canCopy` fait foi : tant que le résultat n'est pas validé et à jour, rien ne sort.
-->
<script lang="ts">
  import { tick, type Snippet } from "svelte";
  import { app } from "../state.svelte.ts";
  import { copyToClipboard, downloadTextFile } from "./ResultDom.ts";
  import { buildCopyText, resultFileName, type NoticeLanguage } from "./ResultLogic.ts";

  /** `notice` : réglage de la consigne (langue), affiché sous la case « Inclure la consigne ». */
  let { language, notice }: { language: NoticeLanguage; notice?: Snippet } = $props();

  /** En pseudonymisation, la consigne accompagne le texte par défaut : elle permet la réidentification. */
  let withNotice = $state(true);
  /** La validation retirée par une modification est annoncée (elle n'est pas sous les yeux). */
  let wasValidated = false;

  let message = $state("");
  /** Texte à copier à la main quand le presse-papiers est refusé. */
  let fallbackText = $state<string | null>(null);
  let fallbackField: HTMLTextAreaElement | undefined = $state();

  // Un nouvel aperçu invalide aussi le champ de copie manuelle d’un ancien résultat.
  $effect(() => {
    void app.transformed;
    message = "";
    fallbackText = null;
  });

  $effect(() => {
    const validated = app.validated;
    if (wasValidated && !validated) {
      message = "Le résultat a changé : relisez-le, puis cochez de nouveau la case.";
    }
    wasValidated = validated;
  });

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
    const copied = await copyToClipboard(text);
    // Le navigateur peut répondre après une modification du résultat ou le retrait de la validation.
    if (app.transformed !== result || !app.canCopy) return;
    if (copied) {
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
    if (app.transformed !== result || !app.canCopy) return;
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

<section class="copy" aria-label="Validation et copie">
  {#if app.modelLimitShown}
    <!-- Au moment de valider : sans modèle, les noms sont ce qui échappe le plus. -->
    <p class="names-warning">
      Sans reconnaissance des noms, les personnes, lieux et organisations ne sont pas détectés :
      relisez-les.
    </p>
  {/if}
  <label class="validate">
    <input
      type="checkbox"
      checked={app.validated}
      disabled={!canValidate}
      onchange={onValidationChange}
    />
    <span>J'ai relu le résultat et les passages non détectés</span>
  </label>
  <p class="hint">Toute modification demande une nouvelle validation.</p>

  <div class="actions">
    <button
      type="button"
      class="primary"
      disabled={!app.canCopy}
      onclick={() => copy(pseudonymization && withNotice)}
    >
      Copier le texte pour l'IA
    </button>
    <button type="button" class="link" disabled={!app.canCopy} onclick={download}>
      Télécharger (.txt)
    </button>
  </div>
  {#if pseudonymization}
    <label class="with-notice">
      <input type="checkbox" bind:checked={withNotice} />
      <span>Inclure la consigne pour l'IA</span>
    </label>
    {@render notice?.()}
  {/if}

  <p class="status" role="status" aria-live="polite">{message}</p>

  {#if fallbackText !== null}
    <label class="fallback">
      <span class="visually-hidden">Texte à copier</span>
      <textarea readonly rows="8" bind:this={fallbackField} value={fallbackText}></textarea>
    </label>
  {/if}
</section>

<style>
  /* Point d'arrivée de l'étape : un seul bloc teinté, juste sous l'aperçu « après ». */
  .copy {
    display: grid;
    gap: 0.6rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border-soft);
  }

  .validate {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.75rem;
    font-weight: 600;
    cursor: pointer;
  }

  .validate input {
    width: 1.25rem;
    height: 1.25rem;
  }

  .copy .hint {
    margin: -0.4rem 0 0;
    font-size: var(--text-small);
  }

  /* Désactivé, le bouton principal garde sa forme : la hiérarchie se lit avant la coche. */
  .actions button.primary:disabled {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-text);
    opacity: 0.45;
  }

  .names-warning {
    margin: 0;
    padding: 0.45rem 0.7rem;
    border-left: 3px solid var(--warn-border);
    background: var(--warn-bg);
    color: var(--warn-text);
    font-size: var(--text-small);
  }

  .with-notice {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: var(--text-small);
    cursor: pointer;
  }

  .actions button.link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    text-decoration: underline;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  /* Étroit : boutons pleine largeur, cibles égales empilées. */
  @media (max-width: 40rem) {
    .actions button {
      flex: 1 1 100%;
    }
  }

  .status {
    min-height: 1.5rem;
    margin: 0.75rem 0 0;
  }

  .status:empty {
    min-height: 0;
    margin: 0;
  }

  .fallback textarea {
    margin-top: 0.25rem;
  }
</style>
