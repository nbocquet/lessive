<!--
  T5.2 — Légende des catégories présentes dans le texte, avec le nombre de détections.
  Chaque catégorie combine une couleur ET un style de soulignement : la couleur seule
  ne porte jamais l'information.
-->
<script lang="ts">
  import { ENTITY_TYPES, type EntityType } from "../../core/index.ts";
  import { app } from "../state.svelte.ts";
  import { typeName, typeToken } from "./review-labels.ts";

  const entries = $derived.by(() => {
    const counts: Partial<Record<EntityType, number>> = {};
    for (const d of app.detections) counts[d.entityType] = (counts[d.entityType] ?? 0) + 1;
    return ENTITY_TYPES.flatMap((type) => {
      const count = counts[type];
      return count ? [{ type, count, token: typeToken(type) }] : [];
    });
  });
</script>

{#if entries.length > 0}
  <ul class="legend" aria-label="Légende des catégories">
    {#each entries as e (e.type)}
      <li>
        <span class="mark" style:--h={e.token.hue} style:--ul={e.token.underline}
          >{typeName(e.type)}</span
        > <span class="count">({e.count})</span>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    margin: 0 0 1.25rem;
    padding: 0;
    list-style: none;
    font-size: var(--text-small);
  }

  .count {
    color: var(--muted);
  }

  .mark {
    --c: hsl(var(--h) 75% 32%);
    padding: 0 0.2rem;
    background: color-mix(in srgb, var(--c) 22%, transparent);
    text-decoration-line: underline;
    text-decoration-style: var(--ul);
    text-decoration-color: var(--c);
    text-decoration-thickness: 2px;
    text-underline-offset: 3px;
  }

  @media (prefers-color-scheme: dark) {
    .mark {
      --c: hsl(var(--h) 80% 68%);
    }
  }
</style>
