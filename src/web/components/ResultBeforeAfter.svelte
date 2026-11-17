<!--
  Vue avant/après (T5.4). Deux colonnes sur écran large, un choix Avant / Après sur écran étroit.
  Le texte est rendu en nœuds de texte (jamais {@html}) : aucune injection possible depuis le texte collé.
-->
<script lang="ts">
  import { ENTITY_LABELS, type TransformResult } from "../../core/index.ts";
  import { originalSegments, outputSegments } from "./ResultLogic.ts";

  let { original, result }: { original: string; result: TransformResult } = $props();

  let side = $state<"before" | "after">("after");

  const before = $derived(originalSegments(original, result));
  const after = $derived(outputSegments(result));
</script>

<div class="switch" role="group" aria-label="Affichage">
  <button type="button" aria-pressed={side === "before"} onclick={() => (side = "before")}>
    Avant
  </button>
  <button type="button" aria-pressed={side === "after"} onclick={() => (side = "after")}>
    Après
  </button>
</div>

<div class="columns">
  <section class="col" class:inactive={side !== "before"} aria-labelledby="h-before">
    <h3 id="h-before">Avant (texte original)</h3>
    <div
      class="text"
      tabindex="0"
      role="textbox"
      aria-readonly="true"
      aria-multiline="true"
      aria-label="Texte original"
    >
      {#each before as seg, i (i)}{#if seg.marked}<mark
            title={seg.entityType ? ENTITY_LABELS[seg.entityType] : ""}>{seg.text}</mark
          >{:else}{seg.text}{/if}{/each}
    </div>
  </section>
  <section class="col" class:inactive={side !== "after"} aria-labelledby="h-after">
    <h3 id="h-after">Après (texte transformé)</h3>
    <div
      class="text"
      tabindex="0"
      role="textbox"
      aria-readonly="true"
      aria-multiline="true"
      aria-label="Texte transformé"
    >
      {#each after as seg, i (i)}{#if seg.marked}<mark
            title={seg.entityType ? ENTITY_LABELS[seg.entityType] : ""}>{seg.text}</mark
          >{:else}{seg.text}{/if}{/each}
    </div>
  </section>
</div>
<p class="hint">
  Les passages remplacés sont soulignés. Relisez le texte « après » en entier : c'est lui qui sera
  copié.
</p>

<style>
  .columns {
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .switch {
    display: none;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .switch button[aria-pressed="true"] {
    background: var(--accent);
    color: var(--accent-text);
  }

  h3 {
    margin: 0 0 0.25rem;
    font-size: 1rem;
  }

  .text {
    max-height: 24rem;
    overflow: auto;
    padding: 0.6rem 0.8rem;
    border: 2px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  mark {
    padding: 0 0.15em;
    border-bottom: 3px double var(--accent);
    border-radius: 2px;
    background: var(--warn-bg);
    color: var(--warn-text);
    font-weight: 600;
  }

  @media (max-width: 48rem) {
    .columns {
      grid-template-columns: minmax(0, 1fr);
    }

    .switch {
      display: flex;
    }

    .col.inactive {
      display: none;
    }
  }
</style>
