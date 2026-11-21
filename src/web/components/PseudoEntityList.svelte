<!--
  Liste des entités de la session (T5.5) : pseudonyme, catégorie, formes rencontrées (affichage
  local seulement), marque « À vérifier » mise en avant, fusion et scission. Chaque action modifie
  la session puis invalide la sortie (app.replaceSession) : le résultat est recalculé et la
  validation retirée.
-->
<script lang="ts">
  import { app } from "../state.svelte.ts";
  import { countNeedingReview, entityRows, mergeCandidates } from "./PseudoLogic.ts";
  import PseudoMergeForm from "./PseudoMergeForm.svelte";

  /** Les méthodes de la session modifient l'objet en place : ce compteur force le recalcul de la liste. */
  let revision = $state(0);
  let mergingId = $state<string | null>(null);
  let message = $state("");

  const rows = $derived.by(() => {
    void revision;
    void app.transformed;
    return entityRows(app.session?.entities() ?? []);
  });
  const reviewCount = $derived(countNeedingReview(rows));

  /**
   * Au-delà de ce seuil, la liste est écourtée : un long document (des centaines de courriels)
   * repousserait sinon la suite de l'écran de plusieurs dizaines d'écrans. Les entités à vérifier
   * et celle en cours de fusion restent toujours affichées.
   */
  const INITIAL_ROWS = 20;
  let showAll = $state(false);
  const visibleRows = $derived(
    showAll ? rows : rows.filter((r, i) => i < INITIAL_ROWS || r.needsReview || r.id === mergingId),
  );
  const hiddenCount = $derived(rows.length - visibleRows.length);

  function changed(): void {
    revision++;
    // Même objet de session : l'appel invalide texte transformé et validation, l'aperçu se recalcule.
    if (app.session) app.replaceSession(app.session);
  }

  function merge(targetId: string, sourceId: string): void {
    if (!app.session) return;
    try {
      app.session.merge(targetId, sourceId);
      mergingId = null;
      message =
        "Entités fusionnées. Le résultat a été recalculé : relisez-le et validez-le à nouveau.";
      changed();
    } catch {
      message = "Fusion impossible (les entités doivent être de même catégorie).";
    }
  }

  function split(entityId: string, form: string): void {
    if (!app.session) return;
    try {
      app.session.split(entityId, form);
      message =
        "Forme détachée dans une nouvelle entité. Le résultat a été recalculé : relisez-le et validez-le à nouveau.";
      changed();
    } catch {
      message = "Scission impossible.";
    }
  }
</script>

<section aria-labelledby="h-entities">
  <h4 id="h-entities">Entités de la session ({rows.length})</h4>
  <p class="hint">
    Les formes d'origine restent dans ce navigateur : seuls les pseudonymes figurent dans le texte
    copié.
  </p>
  {#if reviewCount > 0}
    <p class="notice" role="note">
      {reviewCount === 1 ? "1 entité est à vérifier" : `${reviewCount} entités sont à vérifier`} : le
      rattachement de certaines formes est incertain. Fusionnez ou scindez si besoin.
    </p>
  {/if}
  {#if rows.length === 0}
    <p>Aucune entité pour l'instant : la table se remplit au calcul du résultat.</p>
  {:else}
    <ul class="entities">
      {#each visibleRows as row (row.id)}
        <li class:review={row.needsReview}>
          <div class="head">
            <strong class="token">{row.pseudonym}</strong>
            <span class="category">{row.categoryLabel}</span>
            {#if row.needsReview}
              <span class="badge">À vérifier</span>
            {/if}
          </div>
          <ul class="forms" aria-label={`Formes rencontrées pour ${row.pseudonym}`}>
            {#each row.forms as form (form)}
              <li>
                <span class="form">{form}</span>
                {#if row.splittable}
                  <button
                    type="button"
                    onclick={() => split(row.id, form)}
                    aria-label={`Scinder la forme « ${form} » de ${row.pseudonym}`}
                  >
                    Scinder
                  </button>
                {/if}
              </li>
            {/each}
          </ul>
          {#if mergeCandidates(rows, row.id).length > 0}
            {#if mergingId === row.id}
              <PseudoMergeForm
                entity={row}
                candidates={mergeCandidates(rows, row.id)}
                onmerge={merge}
                oncancel={() => (mergingId = null)}
              />
            {:else}
              <button
                type="button"
                onclick={() => (mergingId = row.id)}
                aria-label={`Fusionner ${row.pseudonym} avec une autre entité`}
              >
                Fusionner…
              </button>
            {/if}
          {/if}
        </li>
      {/each}
    </ul>
    <!-- Un seul bouton dont le libellé change : le focus clavier reste en place au basculement. -->
    {#if hiddenCount > 0 || (showAll && rows.length > INITIAL_ROWS)}
      <button
        type="button"
        class="more"
        aria-expanded={showAll}
        onclick={() => (showAll = !showAll)}
      >
        {#if showAll}
          Réduire la liste
        {:else}
          Afficher les {hiddenCount.toLocaleString("fr-CH")}
          {hiddenCount === 1 ? "autre entité" : "autres entités"}
        {/if}
      </button>
    {/if}
  {/if}
  <p class="status" role="status" aria-live="polite">{message}</p>
</section>

<style>
  h4 {
    margin: 0 0 0.25rem;
  }

  .entities {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* Même trait que les autres conteneurs (1 px) ; l'état « à vérifier » s'épaissit sans décaler. */
  .entities > li {
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .entities > li > :last-child {
    margin-bottom: 0;
  }

  .entities > li.review {
    border-color: var(--warn-border);
    box-shadow: inset 0 0 0 1px var(--warn-border);
    background: var(--warn-bg);
    color: var(--warn-text);
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  .category {
    color: var(--muted);
    font-size: var(--text-small);
  }

  .review .category {
    color: inherit;
  }

  .badge {
    padding: 0 0.5rem;
    border: 2px solid var(--warn-border);
    border-radius: 999px;
    background: var(--bg);
    color: var(--warn-text);
    font-size: var(--text-small);
    font-weight: 700;
  }

  .forms {
    margin: 0.25rem 0 0.5rem;
    padding: 0;
    list-style: none;
  }

  .forms li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.1rem 0;
  }

  .form {
    overflow-wrap: anywhere;
  }

  .more {
    margin-top: 0.5rem;
  }

  .status {
    min-height: 1.5rem;
    margin: 0.5rem 0 0;
  }

  /* Vide, la région reste annoncée mais ne creuse pas de trou avant « Nouvelle session ». */
  .status:empty {
    min-height: 0;
    margin: 0;
  }
</style>
