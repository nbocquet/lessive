<!-- Modèle NER chargé par l'utilisateur (ADR 0003) : choix du dossier, état, oubli. -->
<script lang="ts">
  import { formatBytes, type PickedFile } from "../model-store.ts";
  import { app } from "../state.svelte.ts";
  import SettingsModelHelp from "./SettingsModelHelp.svelte";

  let folderInput = $state<HTMLInputElement>();
  let filesInput = $state<HTMLInputElement>();

  const statusLabel: Record<typeof app.modelStatus, string> = {
    absent: "Aucun modèle chargé",
    stored: "Modèle chargé, prêt à l'emploi",
    loading: "Modèle en cours de chargement dans le moteur…",
    ready: "Modèle chargé et prêt",
    error: "Modèle inutilisable",
  };

  async function onPick(e: Event & { currentTarget: HTMLInputElement }): Promise<void> {
    const input = e.currentTarget;
    const picked: PickedFile[] = [...(input.files ?? [])];
    // Le sélecteur garde ses fichiers tant qu'on ne le vide pas : on le vide pour pouvoir rechoisir le même dossier.
    await app.loadModelFromFiles(picked);
    input.value = "";
  }
</script>

<div class="model" aria-live="polite">
  <p class="status" data-status={app.modelStatus}>
    <strong>{statusLabel[app.modelStatus]}</strong>
    {#if app.modelBusy}— lecture et vérification des fichiers…{/if}
  </p>

  {#if app.ner && (app.modelStatus === "absent" || app.modelStatus === "error")}
    <p class="warn" role="alert">
      La reconnaissance des noms est activée, mais aucun modèle utilisable n'est chargé : elle sera
      ignorée à l'analyse. Chargez d'abord le modèle (bouton ci-dessous).
    </p>
  {/if}

  {#if app.modelError}<p class="error" role="alert">{app.modelError}</p>{/if}
  {#if app.modelNotice}<p class="hint">{app.modelNotice}</p>{/if}

  {#if app.modelInfo}
    <dl class="info">
      <dt>Nom</dt>
      <dd>{app.modelInfo.name}</dd>
      {#if app.modelInfo.sizeBytes > 0}
        <dt>Taille</dt>
        <dd>{formatBytes(app.modelInfo.sizeBytes)}</dd>
      {/if}
      {#if app.modelInfo.labels.length > 0}
        <dt>Étiquettes</dt>
        <dd>{app.modelInfo.labels.join(", ")}</dd>
      {/if}
      <dt>Conservation</dt>
      <dd>
        {app.modelInfo.origin === "cache"
          ? "Stockage du navigateur (cache local de cette application)"
          : app.modelInfo.origin === "memory"
            ? "Mémoire de cette session seulement"
            : "Dossier de développement"}
      </dd>
    </dl>
    {#each app.modelInfo.warnings as warning (warning)}
      <p class="hint warn-text">{warning}</p>
    {/each}
  {/if}

  <div class="actions">
    <input
      bind:this={folderInput}
      class="visually-hidden"
      type="file"
      webkitdirectory
      multiple
      tabindex="-1"
      aria-hidden="true"
      onchange={onPick}
    />
    <input
      bind:this={filesInput}
      class="visually-hidden"
      type="file"
      multiple
      accept=".json,.onnx"
      tabindex="-1"
      aria-hidden="true"
      onchange={onPick}
    />
    <button type="button" disabled={app.modelBusy} onclick={() => folderInput?.click()}>
      Charger le modèle depuis mon ordinateur
    </button>
    <button type="button" class="link" disabled={app.modelBusy} onclick={() => filesInput?.click()}>
      ou choisir les fichiers un par un
    </button>
    {#if app.modelInfo}
      <button type="button" disabled={app.modelBusy} onclick={() => void app.forgetModel()}>
        Oublier le modèle
      </button>
    {/if}
    {#if app.devModelAvailable && app.modelInfo?.origin !== "dev"}
      <button type="button" onclick={() => void app.useDevModel()}>
        Utiliser le modèle de développement
      </button>
    {/if}
  </div>

  <SettingsModelHelp />
</div>

<style>
  .model {
    display: grid;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  p {
    margin: 0;
  }

  .warn,
  .error {
    padding: 0.4rem 0.6rem;
    border-left: 3px solid currentColor;
  }

  .info {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.15rem 0.75rem;
    margin: 0;
  }

  .info dt {
    font-weight: 600;
  }

  .info dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }

  .link {
    border: 0;
    background: none;
    text-decoration: underline;
    padding: 0.25rem;
  }
</style>
