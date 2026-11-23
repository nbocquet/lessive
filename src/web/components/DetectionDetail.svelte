<!--
  T5.2 — Panneau de détail de la détection sélectionnée (app.selectedDetectionId) :
  catégorie, score, origine, explication, opérateur appliqué ; détections écartées sur demande.
  Rendu en texte uniquement. Aucune valeur dans les logs (R5) : la valeur n'est affichée
  qu'à l'écran, relue dans le texte original.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { categoryLabel, type Detection } from "../../core/index.ts";
  import { app } from "../state.svelte.ts";
  import {
    OPERATOR_NAMES,
    SOURCE_NAMES,
    excerpt,
    formatScore,
    typeName,
    typeToken,
  } from "./review-labels.ts";

  type Kind = "kept" | "removed" | "discarded";

  let { children }: { children?: Snippet } = $props();
  let showDiscarded = $state(false);

  const removed = $derived.by<Detection[]>(() => {
    const ids = app.corrections.removedIds;
    return (app.analysis?.detections ?? []).filter((d) => ids.includes(d.id));
  });

  const selected = $derived.by<{ detection: Detection; kind: Kind } | null>(() => {
    const id = app.selectedDetectionId;
    if (id === null) return null;
    const kept = app.detections.find((d) => d.id === id);
    if (kept) return { detection: kept, kind: "kept" };
    const gone = removed.find((d) => d.id === id);
    if (gone) return { detection: gone, kind: "removed" };
    const out = app.discarded.find((d) => d.id === id);
    return out ? { detection: out, kind: "discarded" } : null;
  });

  /** Type d'origine du moteur si l'utilisateur l'a changé. */
  const originalType = $derived.by(() => {
    if (!selected) return null;
    const raw = app.analysis?.detections.find((d) => d.id === selected.detection.id);
    return raw && raw.entityType !== selected.detection.entityType ? raw.entityType : null;
  });

  const operator = $derived.by(() => {
    if (!selected || selected.kind !== "kept") return null;
    const { id, entityType } = selected.detection;
    const plan = app.plan;
    if (plan.byDetectionId?.[id]) {
      return { id: plan.byDetectionId[id], why: "choisi pour cette détection" };
    }
    if (plan.byEntityType?.[entityType]) {
      return { id: plan.byEntityType[entityType], why: "choisi pour cette catégorie" };
    }
    return { id: plan.defaultOperator, why: "par défaut du mode" };
  });

  function valueOf(d: Detection): string {
    return app.text.slice(d.start, d.end);
  }

  function reasonOf(d: Detection): string {
    const last = d.explanation[d.explanation.length - 1] ?? "raison non précisée";
    const winner = d.supersededBy ? app.detections.find((x) => x.id === d.supersededBy) : undefined;
    return winner ? `${last} (au profit de « ${excerpt(valueOf(winner), 30)} »)` : last;
  }
</script>

<section class="detail" aria-labelledby="h-detail">
  <h3 id="h-detail">Passage sélectionné</h3>

  <p class="visually-hidden" role="status" aria-live="polite">
    {#if selected}
      Sélection : {typeName(selected.detection.entityType)}, score {formatScore(
        selected.detection.score,
      )}.
    {/if}
  </p>

  {#if selected}
    {@const d = selected.detection}
    {@const token = typeToken(d.entityType)}
    <dl>
      <dt>Valeur</dt>
      <dd class="value">{excerpt(valueOf(d), 120)}</dd>

      <dt>Catégorie</dt>
      <dd>
        <span class="swatch" style:--h={token.hue} style:--ul={token.underline}
          >{typeName(d.entityType)}</span
        >
        {#if originalType}
          <span class="hint">(modifiée ; le moteur proposait « {typeName(originalType)} »)</span>
        {/if}
      </dd>

      <dt>Transformation</dt>
      <dd>
        {#if selected.kind === "kept" && operator}
          {OPERATOR_NAMES[operator.id]}
          <span class="hint">{operator.why}</span>
          {#if operator.id === "categorize"}
            <span class="hint">Remplacement : {categoryLabel(d.entityType)}</span>
          {/if}
        {:else if selected.kind === "removed"}
          Aucune : détection supprimée par vous (voir « Restaurer » dans les corrections).
        {:else}
          Aucune : détection écartée par le moteur.
        {/if}
      </dd>

      {#if selected.kind === "discarded"}
        <dt>Raison de l'écart</dt>
        <dd>{reasonOf(d)}</dd>
      {/if}
    </dl>
  {:else}
    <p class="hint">
      Sélectionnez une détection dans le texte (clic, ou Entrée au clavier) pour voir sa catégorie,
      son remplacement et les actions de correction.
    </p>
  {/if}

  {@render children?.()}
  {#if selected}
    {@const d = selected.detection}
    <details class="technical">
      <summary>Pourquoi ce passage a été repéré ?</summary>
      <dl>
        <dt>Score</dt>
        <dd>
          {formatScore(d.score)}
          <span class="hint"
            >Indicatif : ce n'est pas une probabilité (0,90 ne signifie pas 90 % de chances).</span
          >
        </dd>

        <dt>Origine</dt>
        <dd>
          {SOURCE_NAMES[d.source]}
          {#if d.source !== "manual"}
            <span class="hint">règle « {d.recognizerId} », pack « {d.packId} »</span>
          {/if}
          {#if d.validated}
            <span class="hint">Contrôle algorithmique réussi.</span>
          {/if}
        </dd>

        <dt>Explication</dt>
        <dd>
          {#if d.explanation.length > 0}
            <ol class="explain">
              {#each d.explanation as line, i (i)}
                <li>{line}</li>
              {/each}
            </ol>
          {:else}
            <span class="hint">Aucune explication fournie.</span>
          {/if}
        </dd>
      </dl>
    </details>
  {/if}

  <details class="discarded" bind:open={showDiscarded}>
    <summary>Passages écartés par l’analyse ({app.discarded.length})</summary>
    <p class="hint">
      Ces passages ne seront pas remplacés. Consultez les raisons de leur exclusion si nécessaire.
    </p>
    {#if showDiscarded}
      {#if app.discarded.length === 0}
        <p class="hint">Aucune détection écartée.</p>
      {:else}
        <ul>
          {#each app.discarded as d (d.id)}
            <li>
              <button
                type="button"
                class="link"
                aria-pressed={app.selectedDetectionId === d.id}
                onclick={() => app.selectDetection(d.id)}
              >
                {typeName(d.entityType)} : « {excerpt(valueOf(d), 30)} »
              </button>
              <span class="hint">score {formatScore(d.score)} — {reasonOf(d)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </details>
</section>

<style>
  .detail {
    display: grid;
    gap: 0.85rem;
  }

  h3 {
    margin: 0;
  }

  dl {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 0.4rem 0.65rem;
    margin: 0;
    font-size: var(--text-small);
  }

  dt {
    margin: 0;
    color: var(--muted);
    font-size: var(--text-meta);
    font-weight: 500;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .value {
    font-family: ui-monospace, monospace;
    white-space: pre-wrap;
  }

  .detail > p {
    margin: 0;
  }

  .hint {
    display: block;
    color: var(--muted);
    font-size: var(--text-small);
  }

  .explain {
    margin: 0;
    padding-left: 1.25rem;
  }

  .swatch {
    --c: hsl(var(--h) 75% 32%);
    padding: 0 0.2rem;
    background: color-mix(in srgb, var(--c) 22%, transparent);
    text-decoration-line: underline;
    text-decoration-style: var(--ul);
    text-decoration-color: var(--c);
    text-decoration-thickness: 2px;
    text-underline-offset: 3px;
  }

  .discarded {
    padding-top: 0.75rem;
    border-top: 1px solid var(--border-soft);
  }

  summary {
    cursor: pointer;
    font-size: var(--text-small);
    font-weight: 600;
  }

  .technical {
    padding-top: 0.75rem;
    border-top: 1px solid var(--border-soft);
  }

  .technical dl {
    margin-top: 0.75rem;
  }

  .discarded ul {
    margin: 0.5rem 0 0;
    padding: 0;
    list-style: none;
  }

  .discarded li + li {
    margin-top: 0.5rem;
  }

  button.link {
    min-height: 0;
    padding: 0;
    border: none;
    background: none;
    text-align: left;
    text-decoration: underline;
  }

  button.link[aria-pressed="true"] {
    font-weight: 700;
  }

  :global(:root[data-theme="dark"]) .swatch {
    --c: hsl(var(--h) 80% 68%);
  }
</style>
