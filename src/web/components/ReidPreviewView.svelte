<!--
  Aperçu de la réidentification (T5.6) : texte avec les noms remis en évidence, puis repères inconnus
  et ambigus. Le titre et le compteur sont dans ResponsePane, alignés sur la réponse collée (#38).
  Le texte est affiché en nœuds de texte, jamais en HTML.
-->
<script lang="ts">
  import { countLabel, type ReidPreview } from "./ReidPreview.ts";

  let { preview }: { preview: ReidPreview } = $props();
</script>

<!-- Région défilante : le focus clavier permet de la faire défiler. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="preview" tabindex="0" role="region" aria-labelledby="h-restored">
  {#each preview.segments as seg, i (i)}
    {#if seg.pseudonym !== undefined}
      <mark title={`Remplace ${seg.pseudonym}`}>{seg.text}</mark>
    {:else}
      {seg.text}
    {/if}
  {/each}
</div>

{#if preview.unknownCount > 0}
  <div class="notice" role="note">
    <p>
      <strong
        >{countLabel(
          preview.unknownCount,
          "repère inconnu laissé tel quel",
          "repères inconnus laissés tels quels",
        )}.</strong
      >
      Ces repères sont dans la réponse mais pas dans la session : l'assistant en a peut-être inventé ou
      modifié un.
    </p>
    <ul>
      {#each preview.unknown as g (g.pseudonym)}
        <li>
          <code class="token">{g.pseudonym}</code> ({countLabel(g.occurrences, "fois", "fois")})
        </li>
      {/each}
    </ul>
  </div>
{/if}

{#if preview.ambiguousCount > 0}
  <div class="notice" role="note">
    <p>
      <strong
        >{countLabel(
          preview.ambiguousCount,
          "repère ambigu laissé tel quel",
          "repères ambigus laissés tels quels",
        )}.</strong
      >
      Après un rattachement ou une séparation, ces repères ne désignent plus une seule personne ou chose
      : vérifiez-les à la main.
    </p>
    <ul>
      {#each preview.ambiguous as g (g.pseudonym)}
        <li>
          <code class="token">{g.pseudonym}</code> ({countLabel(g.occurrences, "fois", "fois")})
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .preview {
    height: var(--response-height, 16rem);
    overflow: auto;
    padding: 0.85rem;
    border: 1px solid var(--border);
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

  .notice {
    margin-top: 0.75rem;
  }
</style>
