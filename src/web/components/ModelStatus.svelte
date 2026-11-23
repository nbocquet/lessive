<!-- État du modèle visible avant l'analyse, avec une action adaptée au problème. -->
<script lang="ts">
  import { app } from "../state.svelte.ts";
  import { bundledSize } from "../bundled-model.ts";
  import { formatBytes } from "../model-store.ts";
  import BundledModelOffer from "./BundledModelOffer.svelte";

  /** `compact` : une ligne en tête de la page unique (#38), le détail restant dans les réglages. */
  let { onConfigure, compact = false }: { onConfigure: () => void; compact?: boolean } = $props();

  const unavailable = $derived(app.modelStatus === "absent" || app.modelStatus === "error");
  const offerBundled = $derived(app.bundledModel !== null && app.modelInfo === null && unavailable);
  const percent = $derived(
    app.bundledProgress === null ? null : Math.round(app.bundledProgress * 100),
  );
</script>

{#if compact}
  <section
    class="model-line"
    class:warn={unavailable || !app.ner}
    aria-label="Reconnaissance des noms"
  >
    <p role="status" aria-live="polite">
      {#if app.modelBusy}
        <strong>Installation du modèle de reconnaissance des noms…</strong>
      {:else if app.modelStatus === "loading"}
        <strong>Chargement du modèle de reconnaissance des noms…</strong>
      {:else if app.modelStatus === "error"}
        <strong>Le modèle de reconnaissance des noms ne fonctionne pas</strong> : des noms risquent de
        rester en clair.
      {:else if unavailable}
        <strong>Aucun modèle de reconnaissance des noms n’est chargé</strong> : des noms risquent de rester
        en clair.
      {:else if !app.ner}
        <strong>Reconnaissance des noms désactivée</strong> : des noms risquent de rester en clair.
      {/if}
    </p>
    {#if !app.modelBusy && app.modelStatus !== "loading"}
      <div class="line-actions">
        {#if unavailable}
          {#if offerBundled && app.bundledModel}
            <button type="button" class="primary" onclick={() => void app.installBundledModel()}>
              Installer le modèle fourni
            </button>
            <span class="hint">{formatBytes(bundledSize(app.bundledModel))}, une seule fois</span>
          {/if}
          {#if app.devModelAvailable}
            <!-- Développement seulement : le modèle de `models/`, servi par Vite. -->
            <button type="button" onclick={() => void app.useDevModel()}>
              Utiliser le modèle du dépôt
            </button>
          {/if}
          <button type="button" class="link" onclick={onConfigure}>
            {app.modelStatus === "error"
              ? "Vérifier ou remplacer le modèle"
              : "Charger un modèle depuis mon ordinateur"}
          </button>
        {:else if !app.ner}
          <button type="button" onclick={() => app.setNer(true)}
            >Activer la reconnaissance des noms</button
          >
        {/if}
      </div>
      {#if app.modelError}<p class="error" role="alert">{app.modelError}</p>{/if}
    {:else if percent !== null}
      <progress max="100" value={percent} aria-label="Téléchargement du modèle"></progress>
    {/if}
  </section>
{:else}
  <section
    class="model-status"
    class:limited={unavailable || !app.ner}
    aria-label="Reconnaissance des noms"
  >
    <div role="status" aria-live="polite">
      {#if app.modelBusy}
        <p><strong>Installation du modèle en cours…</strong></p>
        <p>
          Attendez la fin de l’installation pour analyser aussi les noms de personnes, de lieux et
          d’organisations.
        </p>
      {:else if app.modelStatus === "loading"}
        <p><strong>Chargement du modèle de reconnaissance des noms…</strong></p>
        <p>
          Le premier chargement peut prendre quelques secondes. Votre texte reste dans ce
          navigateur.
        </p>
      {:else if app.modelStatus === "error"}
        <p><strong>Le modèle de reconnaissance des noms ne fonctionne pas.</strong></p>
        <p>
          L’analyse par règles reste disponible. Des noms de personnes, de lieux et d’organisations
          peuvent rester en clair dans le résultat.
        </p>
      {:else if app.modelStatus === "absent"}
        <p><strong>Aucun modèle de reconnaissance des noms n’est chargé.</strong></p>
        <p>
          Les règles intégrées peuvent repérer les courriels, téléphones et identifiants. Sans
          modèle, des noms de personnes, de lieux et d’organisations risquent de rester en clair.
        </p>
      {:else if !app.ner}
        <p><strong>La reconnaissance des noms est désactivée.</strong></p>
        <p>
          Un modèle est disponible, mais l’analyse utilisera seulement les règles intégrées. Des
          noms de personnes, de lieux et d’organisations risquent de rester en clair.
        </p>
      {:else}
        <p><strong>Reconnaissance des noms activée.</strong></p>
        <p>
          Le modèle et les règles intégrées seront utilisés. Relisez le résultat : certaines données
          peuvent échapper à la détection.
        </p>
      {/if}
    </div>

    {#if !app.modelBusy && app.modelStatus !== "loading"}
      {#if unavailable}
        <div class="actions">
          <button type="button" onclick={onConfigure}>
            {app.modelStatus === "error"
              ? "Vérifier ou remplacer le modèle"
              : "Charger un modèle depuis mon ordinateur"}
          </button>
          {#if app.devModelAvailable}
            <!-- Développement seulement : le modèle de `models/`, servi par Vite. -->
            <button type="button" onclick={() => void app.useDevModel()}>
              Utiliser le modèle du dépôt
            </button>
          {/if}
          <span class="hint"
            >Ou continuez avec les règles seules, puis vérifiez les noms à la main.</span
          >
        </div>
        {#if app.modelError}<p class="error" role="alert">{app.modelError}</p>{/if}
        <BundledModelOffer compact />
      {:else if !app.ner}
        <div class="actions">
          <button type="button" onclick={() => app.setNer(true)}
            >Activer la reconnaissance des noms</button
          >
        </div>
      {/if}
    {/if}
  </section>
{/if}

<style>
  /* Dans la barre d'outils : une ligne sans cadre, la couleur d'avertissement suffit. */
  .model-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.75rem;
    font-size: var(--text-small);
  }

  .model-line.warn [role="status"] {
    color: var(--warn-text);
  }

  .model-line.warn [role="status"]::before {
    content: "";
    display: inline-block;
    width: 0.5rem;
    height: 0.5rem;
    margin-right: 0.45rem;
    border-radius: 50%;
    background: var(--warn-border);
    vertical-align: 0.1em;
  }

  .model-line [role="status"] {
    margin: 0;
  }

  .line-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.75rem;
  }

  .line-actions button {
    padding: 0.3rem 0.7rem;
    font-size: var(--text-small);
  }

  .line-actions button.link {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    text-decoration: underline;
  }

  .model-line progress {
    flex: 1 1 100%;
  }

  .model-status {
    margin-bottom: 1.25rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    background: var(--surface);
    font-size: var(--text-small);
  }

  .limited {
    border-color: var(--warn-border);
    background: var(--warn-bg);
    color: var(--warn-text);
  }

  p {
    margin: 0;
  }

  p + p {
    margin-top: 0.35rem;
  }

  .actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    margin-top: 0.75rem;
  }

  .hint {
    color: inherit;
    font-size: var(--text-small);
  }

  .error {
    margin-top: 0.5rem;
    font-weight: 600;
  }
</style>
