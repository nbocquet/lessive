<!-- État du modèle visible avant l'analyse, avec une action adaptée au problème. -->
<script lang="ts">
  import { app } from "../state.svelte.ts";
  import BundledModelOffer from "./BundledModelOffer.svelte";

  let { onConfigure }: { onConfigure: () => void } = $props();

  const unavailable = $derived(app.modelStatus === "absent" || app.modelStatus === "error");
</script>

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
        Le premier chargement peut prendre quelques secondes. Votre texte reste dans ce navigateur.
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
        Les règles intégrées peuvent repérer les courriels, téléphones et identifiants. Sans modèle,
        des noms de personnes, de lieux et d’organisations risquent de rester en clair.
      </p>
    {:else if !app.ner}
      <p><strong>La reconnaissance des noms est désactivée.</strong></p>
      <p>
        Un modèle est disponible, mais l’analyse utilisera seulement les règles intégrées. Des noms
        de personnes, de lieux et d’organisations risquent de rester en clair.
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

<style>
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
