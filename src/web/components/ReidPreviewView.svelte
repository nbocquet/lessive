<!--
  Aperçu de la réidentification (T5.6) : texte avec les noms remis en évidence, compteurs, jetons
  inconnus et ambigus. Le texte est affiché en nœuds de texte, jamais en HTML.
-->
<script lang="ts">
  import { countLabel, type ReidPreview } from "./ReidPreview.ts";

  let { preview }: { preview: ReidPreview } = $props();
</script>

<div class="summary" role="status">
  <p>
    <strong>{countLabel(preview.replacedCount, "jeton remplacé", "jetons remplacés")}</strong>
    ({countLabel(preview.entityCount, "entité", "entités")}).
  </p>
</div>

{#if preview.unknownCount > 0}
  <div class="notice" role="alert">
    <p>
      <strong
        >{countLabel(
          preview.unknownCount,
          "jeton inconnu laissé tel quel",
          "jetons inconnus laissés tels quels",
        )}.</strong
      >
      Ces pseudonymes sont dans la réponse mais pas dans la session : le LLM a peut-être inventé ou modifié
      un pseudonyme.
    </p>
    <ul>
      {#each preview.unknown as g (g.pseudonym)}
        <li><code>{g.pseudonym}</code> ({countLabel(g.occurrences, "fois", "fois")})</li>
      {/each}
    </ul>
  </div>
{/if}

{#if preview.ambiguousCount > 0}
  <div class="notice" role="alert">
    <p>
      <strong
        >{countLabel(
          preview.ambiguousCount,
          "jeton ambigu laissé tel quel",
          "jetons ambigus laissés tels quels",
        )}.</strong
      >
      Après une fusion ou une scission d'entités, ces pseudonymes ne désignent plus une seule personne
      ou chose : à vérifier manuellement.
    </p>
    <ul>
      {#each preview.ambiguous as g (g.pseudonym)}
        <li><code>{g.pseudonym}</code> ({countLabel(g.occurrences, "fois", "fois")})</li>
      {/each}
    </ul>
  </div>
{/if}

<h3 id="reid-preview-title">Aperçu</h3>
<!-- Région défilante : le focus clavier permet de la faire défiler. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="preview" tabindex="0" role="region" aria-labelledby="reid-preview-title">
  {#each preview.segments as seg, i (i)}
    {#if seg.pseudonym !== undefined}
      <mark title={`Remplace ${seg.pseudonym}`}>{seg.text}</mark>
    {:else}
      {seg.text}
    {/if}
  {/each}
</div>

<style>
  .preview {
    max-height: 24rem;
    overflow: auto;
    padding: 0.75rem;
    border: 2px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  mark {
    padding: 0 0.15rem;
    border-radius: 3px;
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 600;
  }

  ul {
    margin: 0.25rem 0 0;
  }
</style>
