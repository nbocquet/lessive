<!--
  Proposition d'installer le modèle NER fourni par la version publiée (ADR 0004). N'apparaît que si la
  version en contient un et qu'aucun modèle n'est encore conservé. Rien n'est téléchargé sans clic.
-->
<script lang="ts">
  import { BUNDLED_DIR, bundledSize } from "../bundled-model.ts";
  import { formatBytes } from "../model-store.ts";
  import { app } from "../state.svelte.ts";

  let { compact = false }: { compact?: boolean } = $props();

  const manifest = $derived(app.bundledModel);
  const visible = $derived(
    manifest !== null &&
      app.modelInfo === null &&
      (app.modelStatus === "absent" || app.modelStatus === "error"),
  );
  const percent = $derived(
    app.bundledProgress === null ? null : Math.round(app.bundledProgress * 100),
  );
</script>

{#if visible && manifest}
  <div class="offer" class:compact aria-live="polite">
    <p>
      <strong>Reconnaissance des noms :</strong> installez le modèle fourni pour repérer les noms de
      personnes, de lieux et d'organisations ({formatBytes(bundledSize(manifest))}, téléchargé une
      seule fois depuis ce site puis conservé dans ce navigateur). Il fonctionne surtout en
      français.
    </p>
    <p class="hint">
      {manifest.attribution} Licence {manifest.license} :
      <a href={`${BUNDLED_DIR}${manifest.licenseFile}`} target="_blank" rel="noopener">texte</a>.
      Votre texte n'est jamais envoyé.
    </p>
    <div class="actions">
      <button
        type="button"
        class="primary"
        disabled={app.modelBusy}
        onclick={() => void app.installBundledModel()}
      >
        Installer le modèle fourni
      </button>
      {#if percent !== null}
        <progress max="100" value={percent} aria-label="Téléchargement du modèle"></progress>
        <span class="hint">{percent} %</span>
      {/if}
    </div>
  </div>
{/if}

<style>
  .offer {
    display: grid;
    gap: 0.4rem;
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    margin: 0.5rem 0 1rem;
  }

  /* Dans l'encadré d'état du modèle : un simple séparateur, pas un second cadre. */
  .offer.compact {
    margin: 0.75rem 0 0;
    padding: 0.75rem 0 0;
    border: 0;
    border-top: 1px solid color-mix(in srgb, currentColor 35%, transparent);
    border-radius: 0;
  }

  p {
    margin: 0;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }
</style>
