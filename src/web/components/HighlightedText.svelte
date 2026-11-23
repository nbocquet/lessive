<!--
  T5.2 — Texte source avec détections surlignées par catégorie.
  Lit app.text et app.detections ; sélection via app.selectDetection / app.setTextSelection.
  Rendu en nœuds de texte Svelte uniquement : jamais {@html} (aucune injection HTML).

  Chaque segment porte `data-start` (position UTF-16 de son premier caractère dans le texte
  original) : c'est ce qui permet de convertir une sélection du navigateur, même sur
  plusieurs nœuds, en positions du texte original (T5.3). Les retours à la ligne sont
  rendus par `white-space: pre-wrap`, donc aucun texte parasite n'est inséré entre segments.
-->
<script lang="ts">
  import { app } from "../state.svelte.ts";
  import { typeName, typeToken } from "./review-labels.ts";
  import { buildSegments } from "./review-segments.ts";
  import { boundaryPosition, resolveSelection, rootBoundaryPosition } from "./review-selection.ts";

  let root: HTMLElement | undefined = $state();
  let { onSelect }: { onSelect?: () => void } = $props();

  const segments = $derived(buildSegments(app.text.length, app.detections));
  const byId = $derived(new Map(app.detections.map((d) => [d.id, d])));

  function select(id: string): void {
    app.selectDetection(id);
    onSelect?.();
  }

  function onKey(event: KeyboardEvent, id: string): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(id);
    }
  }

  /** Convertit une borne du DOM (nœud, décalage) en position UTF-16 du texte original. */
  function toPosition(node: Node, offset: number): number | null {
    if (!root || !root.contains(node)) return null;
    if (node === root) {
      const kids = Array.from(root.childNodes).slice(0, offset);
      const index = kids.filter((n) => n instanceof HTMLElement).length;
      const starts = Array.from(root.children, (c) => Number((c as HTMLElement).dataset.start));
      return rootBoundaryPosition(starts, app.text.length, index);
    }
    const element = node instanceof Element ? node : node.parentElement;
    const seg = element?.closest<HTMLElement>("[data-start]");
    if (!seg || !root.contains(seg)) return null;
    return boundaryPosition(
      Number(seg.dataset.start),
      seg.textContent?.length ?? 0,
      offset,
      node.nodeType === Node.TEXT_NODE,
    );
  }

  /**
   * Suit la sélection du navigateur. Une sélection hors de ce composant (par exemple dans
   * un champ de la barre de corrections) est ignorée : on conserve la dernière sélection.
   */
  function onSelectionChange(): void {
    const sel = window.getSelection();
    if (!root || !sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
    if (range.collapsed) {
      app.setTextSelection(null);
      return;
    }
    const a = toPosition(range.startContainer, range.startOffset);
    const b = toPosition(range.endContainer, range.endOffset);
    app.setTextSelection(a === null || b === null ? null : resolveSelection(app.text, a, b));
  }
</script>

<svelte:document onselectionchange={onSelectionChange} />

<div
  id="review-text"
  class="text"
  role="group"
  aria-label="Texte avec détections surlignées"
  tabindex="-1"
  bind:this={root}
>
  {#each segments as seg (seg.start)}
    {#if seg.detectionId !== null}
      {@const det = byId.get(seg.detectionId)}
      {#if det}
        {@const token = typeToken(det.entityType)}
        <span
          class="mark"
          class:selected={app.selectedDetectionId === det.id}
          role="button"
          tabindex="0"
          aria-pressed={app.selectedDetectionId === det.id}
          aria-label="{typeName(det.entityType)} : {app.text.slice(seg.start, seg.end)}"
          data-start={seg.start}
          style:--h={token.hue}
          style:--ul={token.underline}
          onclick={() => select(det.id)}
          onkeydown={(e) => onKey(e, det.id)}>{app.text.slice(seg.start, seg.end)}</span
        >
      {/if}
    {:else}
      <span data-start={seg.start}>{app.text.slice(seg.start, seg.end)}</span>
    {/if}
  {/each}
</div>

<style>
  .text {
    padding: 0.75rem 1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    height: var(--review-text-height, 32rem);
    line-height: 1.8;
    scrollbar-gutter: stable;
    overflow-y: auto;
  }

  .text:focus {
    outline: none;
  }

  .mark {
    --c: hsl(var(--h) 75% 32%);
    padding: 0 0.1rem;
    border-radius: 3px;
    background: color-mix(in srgb, var(--c) 22%, transparent);
    text-decoration-line: underline;
    text-decoration-style: var(--ul);
    text-decoration-color: var(--c);
    text-decoration-thickness: 2px;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .mark.selected {
    background: color-mix(in srgb, var(--c) 45%, transparent);
    outline: 2px solid var(--text);
    outline-offset: 1px;
  }

  :global(:root[data-theme="dark"]) .mark {
    --c: hsl(var(--h) 80% 68%);
  }
</style>
