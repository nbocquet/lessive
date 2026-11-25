<!-- Sélection par catégorie : mêmes choix avant l’analyse et dans l’aperçu du résultat. -->
<script lang="ts">
  import { CLEANING_CATEGORIES } from "../cleaning-categories.ts";
  import { app } from "../state.svelte.ts";

  const selected = $derived(
    CLEANING_CATEGORIES.filter((c) => app.cleaningCategories.includes(c.id)),
  );
  const kept = $derived(CLEANING_CATEGORIES.filter((c) => !app.cleaningCategories.includes(c.id)));
</script>

<fieldset class="cleaning-categories" aria-describedby="cleaning-help cleaning-summary">
  <legend>Que voulez-vous nettoyer ?</legend>
  <p id="cleaning-help" class="hint">
    Cochez les catégories à remplacer. Les autres resteront lisibles.
  </p>
  <div class="choices">
    {#each CLEANING_CATEGORIES as category (category.id)}
      <label>
        <input
          id={`cleaning-${category.id}`}
          type="checkbox"
          checked={app.cleaningCategories.includes(category.id)}
          onchange={(e) => app.setCleaningCategory(category.id, e.currentTarget.checked)}
          aria-describedby={`cleaning-help-${category.id}`}
        />
        <span
          ><strong>{category.label}</strong><small id={`cleaning-help-${category.id}`}
            >{category.help}</small
          ></span
        >
      </label>
    {/each}
  </div>
  <div class="category-actions">
    <!-- Toutes les catégories sont cochées par défaut : « Tout sélectionner » rétablit aussi le défaut. -->
    <button type="button" onclick={() => app.resetCleaningCategories()}>Tout sélectionner</button>
    <button type="button" onclick={() => app.setCleaningCategories([])}>Tout désélectionner</button>
  </div>
  <div id="cleaning-summary" class="hint" aria-live="polite">
    {#if selected.length === CLEANING_CATEGORIES.length}
      <p>Toutes les catégories reconnues seront remplacées.</p>
    {:else}
      <p>
        <strong>À remplacer :</strong>
        {selected.map((c) => c.label).join(", ") || "aucune catégorie"}.
      </p>
      <p><strong>Laissé en clair :</strong> {kept.map((c) => c.label).join(", ")}.</p>
    {/if}
    {#if selected.length === 0}
      <p class="notice">
        Aucun remplacement automatique. Le texte restera inchangé, sauf vos ajouts et corrections
        manuels.
      </p>
    {/if}
  </div>
  {#if app.canRememberCategories}
    <label class="remember">
      <input
        id="cleaning-remember"
        type="checkbox"
        checked={app.rememberCategories}
        onchange={(e) => app.setRememberCategories(e.currentTarget.checked)}
        aria-describedby="cleaning-remember-help"
      />
      <span
        ><strong>Mémoriser ce choix sur cet appareil</strong><small id="cleaning-remember-help"
          >Seules les catégories décochées sont enregistrées dans ce navigateur, jamais votre texte.
          Décocher efface le choix enregistré.</small
        ></span
      >
    </label>
  {/if}
  {#if app.rememberCategories && kept.length > 0}
    <p class="notice" role="status">
      Choix enregistré sur cet appareil : {kept.length}
      {kept.length === 1 ? "catégorie reste lisible" : "catégories restent lisibles"} à chaque visite.
    </p>
  {/if}
  {#if app.preferencesError}
    <p class="notice" role="alert">{app.preferencesError}</p>
  {/if}
  <p class="hint policy">
    Les ajouts et corrections manuels par passage restent prioritaires. Les réglages avancés
    déterminent ce qui est détecté.
    {app.rememberCategories
      ? "Ce choix est enregistré sur cet appareil."
      : "Ce choix est conservé jusqu’au rechargement de la page."}
  </p>
</fieldset>

<style>
  .cleaning-categories {
    min-width: 0;
    margin: 1rem 0;
    padding: 1rem;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
  }
  legend {
    padding: 0 0.4rem;
    font-weight: 600;
  }
  .choices {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
    gap: 0.75rem 1.25rem;
    margin: 0.75rem 0;
  }
  label {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    cursor: pointer;
    min-width: 0;
  }
  input {
    flex: none;
    width: 1.1rem;
    height: 1.1rem;
    margin: 0.2rem 0 0;
  }
  strong {
    font-weight: 600;
  }
  small {
    display: block;
    font-size: var(--text-small);
    line-height: 1.5;
    color: var(--muted);
  }
  .category-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 1rem 0;
  }
  p {
    margin: 0.4rem 0;
  }
  .remember {
    margin: 0.75rem 0;
  }
  .policy {
    font-size: var(--text-small);
  }
</style>
