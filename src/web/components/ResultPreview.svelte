<!--
  Aperçu du texte à copier (#38) : le texte transformé seul, le texte original étant affiché dans la
  colonne voisine. Rendu en nœuds de texte (jamais {@html}) : aucune injection depuis le texte collé.
-->
<script lang="ts">
  import { ENTITY_LABELS, type TransformResult } from "../../core/index.ts";
  import { outputSegments } from "./ResultLogic.ts";

  let { result }: { result: TransformResult } = $props();

  const segments = $derived(outputSegments(result));
</script>

<!-- Région défilante en lecture seule : le focus clavier permet de la faire défiler. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="text" tabindex="0" role="region" aria-label="Aperçu du texte transformé">
  {#each segments as seg, i (i)}{#if seg.marked}<mark
        class="token"
        title={seg.entityType ? ENTITY_LABELS[seg.entityType] : ""}>{seg.text}</mark
      >{:else}{seg.text}{/if}{/each}
</div>

<style>
  .text {
    min-height: 8rem;
    max-height: var(--pane-height, 24rem);
    overflow: auto;
    padding: 0.85rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
