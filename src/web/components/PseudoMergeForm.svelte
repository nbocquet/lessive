<!-- Fusion de deux entités (T5.5) : choix de l'autre entité, puis de celle dont le pseudonyme est conservé. -->
<script lang="ts">
  import type { EntityRow } from "./PseudoLogic.ts";

  let {
    entity,
    candidates,
    onmerge,
    oncancel,
  }: {
    entity: EntityRow;
    candidates: readonly EntityRow[];
    /** `targetId` garde son pseudonyme ; `sourceId` est absorbée. */
    onmerge: (targetId: string, sourceId: string) => void;
    oncancel: () => void;
  } = $props();

  let otherId = $state("");
  let keep = $state<"self" | "other">("self");

  const other = $derived(candidates.find((c) => c.id === otherId));

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    if (!other) return;
    if (keep === "self") onmerge(entity.id, other.id);
    else onmerge(other.id, entity.id);
  }
</script>

<form class="merge" onsubmit={submit} aria-label={`Fusionner ${entity.pseudonym}`}>
  <label>
    Fusionner {entity.pseudonym} avec
    <select bind:value={otherId} required>
      <option value="" disabled>Choisir une entité…</option>
      {#each candidates as c (c.id)}
        <option value={c.id}>{c.pseudonym} ({c.forms.join(", ")})</option>
      {/each}
    </select>
  </label>
  {#if other}
    <fieldset>
      <legend>Pseudonyme à conserver</legend>
      <label>
        <input type="radio" name={`keep-${entity.id}`} value="self" bind:group={keep} />
        {entity.pseudonym}
      </label>
      <label>
        <input type="radio" name={`keep-${entity.id}`} value="other" bind:group={keep} />
        {other.pseudonym}
      </label>
    </fieldset>
    <p class="hint">
      L'autre pseudonyme disparaît des nouveaux textes, mais les textes déjà produits avec lui
      restent réidentifiables.
    </p>
  {/if}
  <div class="actions">
    <button type="submit" class="primary" disabled={!other}>Fusionner</button>
    <button type="button" onclick={oncancel}>Annuler</button>
  </div>
</form>

<style>
  .merge {
    display: grid;
    gap: 0.5rem;
    margin-top: 0.5rem;
    padding: 0.6rem 0.8rem;
    border: 2px dashed var(--border);
    border-radius: var(--radius);
  }

  fieldset {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }
</style>
