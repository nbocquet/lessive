<!--
  Colonne « À vérifier » du parcours sur une page (#38) : une ligne par entité, ses formes avec une
  case chacune (décocher garde la forme telle quelle), le type, et en pseudonymisation « Séparer »
  et « Rattacher à… » (session.split / session.merge). Chaque action invalide la sortie : le
  résultat est recalculé et la validation retirée. Les valeurs ne sont affichées qu'ici (R5).
-->
<script lang="ts">
  import { tick } from "svelte";
  import { ENTITY_TYPES, type EntityType } from "../../core/index.ts";
  import { app } from "../state.svelte.ts";
  import CorrectionsToolbar from "./CorrectionsToolbar.svelte";
  import DetectionDetail from "./DetectionDetail.svelte";
  import { entityGroups, mergeTargets, type ReviewGroup } from "./entity-review.ts";
  import { typeName } from "./review-labels.ts";
  import { snapToCodePoints } from "./review-selection.ts";

  let message = $state("");

  const groups = $derived(
    entityGroups({
      text: app.text,
      analysis: app.analysis,
      corrections: app.corrections,
      detections: app.detections,
      // En pseudonymisation, les pseudonymes viennent du résultat calculé.
      transformed: app.transformed,
      session: app.session,
      mode: app.mode,
    }),
  );
  const busy = $derived(app.analysisStatus === "running");
  const people = $derived.by(() => {
    void app.sessionRevision;
    return app.session?.entities().filter((e) => e.entityType === "PERSON") ?? [];
  });

  /** Contexte local pour distinguer deux occurrences dont la surface est identique. */
  function occurrenceContext(id: string): { before: string; value: string; after: string } {
    const d = app.analysis?.detections.find((d) => d.id === id);
    if (!d) return { before: "", value: "Passage indisponible", after: "" };
    const { start, end } = snapToCodePoints(
      app.text,
      Math.max(0, d.start - 24),
      Math.min(app.text.length, d.end + 24),
    );
    return {
      before: `${start > 0 ? "…" : ""}${app.text.slice(start, d.start)}`,
      value: app.text.slice(d.start, d.end),
      after: `${app.text.slice(d.end, end)}${end < app.text.length ? "…" : ""}`,
    };
  }

  async function assignOccurrence(id: string, pseudonym: string): Promise<void> {
    try {
      app.assignOccurrence(id, pseudonym || null);
      message = "Rattachement de ce passage mis à jour. Relisez le résultat.";
      await tick();
      document.getElementById(`occurrence-person-${id}`)?.focus();
    } catch {
      message = "Rattachement indisponible : choisissez une personne connue.";
    }
  }

  /**
   * Au-delà de ce seuil, la liste est écourtée : un long document repousserait sinon la suite de
   * la page. Les entités à vérifier restent toujours affichées.
   */
  const INITIAL_ROWS = 30;
  let showAll = $state(false);
  const visible = $derived(
    showAll ? groups : groups.filter((g, i) => i < INITIAL_ROWS || g.needsReview),
  );
  const hiddenCount = $derived(groups.length - visible.length);

  function label(group: ReviewGroup): string {
    return group.pseudonym ?? typeName(group.entityType);
  }

  /** Rang d'un ajout manuel (`m3` → 3), 0 pour une détection du moteur. */
  function manualRank(id: string): number {
    const m = /^m(\d+)$/.exec(id);
    return m ? Number(m[1]) : 0;
  }

  function toggleForm(detectionIds: readonly string[], checked: boolean): void {
    message = "";
    // Retirer un ajout manuel décale les suivants (`m3` devient `m2`) : du dernier au premier.
    const ordered = [...detectionIds].sort((a, b) => manualRank(b) - manualRank(a));
    for (const id of ordered) {
      if (checked) app.restoreDetection(id);
      else app.removeDetection(id);
    }
  }

  /** Case de l'entité : décochée, toutes ses formes restent en clair ; cochée, toutes sont remplacées. */
  function setGroupClear(group: ReviewGroup, clear: boolean): void {
    toggleForm(
      group.forms.flatMap((f) => f.detectionIds),
      !clear,
    );
    message = clear
      ? `${label(group)} laissé en clair. Relisez le résultat.`
      : `${label(group)} de nouveau remplacé.`;
  }

  /** État « partiel » de la case d'entité : propriété DOM, sans attribut HTML équivalent. */
  function indeterminate(partial: boolean) {
    return (el: HTMLInputElement) => {
      el.indeterminate = partial;
    };
  }

  function changeType(group: ReviewGroup, type: EntityType): void {
    message = "";
    for (const form of group.forms) {
      for (const id of form.detectionIds) {
        const original = app.analysis?.detections.find((d) => d.id === id)?.entityType;
        app.setDetectionType(id, type === original ? null : type);
      }
    }
  }

  /** La session est modifiée en place : replaceSession invalide la sortie, qui se recalcule. */
  function sessionChanged(): void {
    if (app.session) app.replaceSession(app.session);
  }

  function split(group: ReviewGroup, form: string): void {
    if (!app.session || !group.sessionEntityId) return;
    try {
      app.session.split(group.sessionEntityId, form);
      message = "Forme séparée dans une nouvelle entité. Relisez le résultat.";
      sessionChanged();
    } catch {
      message = "Séparation impossible.";
    }
  }

  function merge(group: ReviewGroup, targetEntityId: string): void {
    if (!app.session || !group.sessionEntityId || !targetEntityId) return;
    try {
      app.session.merge(targetEntityId, group.sessionEntityId);
      message = "Entités rattachées. Relisez le résultat.";
      sessionChanged();
    } catch {
      message = "Rattachement impossible (les entités doivent être de même type).";
    }
  }
</script>

<div class="entities">
  <div class="pane-title">
    <h3 id="h-entities">
      <span class="step" aria-hidden="true">2</span><span class="visually-hidden"
        >Étape 2 :
      </span>Vérifiez
    </h3>
    <span class="count" role="status" aria-label={`${groups.length} données à vérifier`}
      >{groups.length}</span
    >
  </div>
  <p class="hint help">Décochez ce qui peut rester en clair.</p>

  {#if groups.length === 0}
    <p class="empty hint">
      {#if busy}
        Analyse en cours…
      {:else if app.analysis}
        Aucune donnée repérée. Ajoutez depuis le texte les passages à remplacer.
      {:else}
        Les données repérées apparaîtront ici dès que vous aurez collé un texte.
      {/if}
    </p>
  {:else}
    <ul class="list" aria-labelledby="h-entities" aria-busy={busy}>
      {#each visible as group (group.key)}
        {@const targets = mergeTargets(groups, group)}
        {@const cleared = group.forms.every((f) => !f.active)}
        {@const partial = !cleared && group.forms.some((f) => !f.active)}
        <li class="entity" class:review={group.needsReview} class:cleared>
          <div class="entity-title">
            <label class="group-toggle">
              <input
                type="checkbox"
                checked={!cleared}
                disabled={busy}
                aria-label={`Remplacer ${label(group)}`}
                {@attach indeterminate(partial)}
                onchange={(e) => setGroupClear(group, !e.currentTarget.checked)}
              />
              <span class="token">{label(group)}</span>
            </label>
            <select
              aria-label={`Type de ${label(group)}`}
              value={group.entityType}
              disabled={busy}
              onchange={(e) => changeType(group, e.currentTarget.value as EntityType)}
            >
              {#each ENTITY_TYPES as type (type)}
                <option value={type}>{typeName(type)}</option>
              {/each}
            </select>
          </div>
          {#if group.needsReview}
            <p class="flag">À vérifier : rattachement incertain.</p>
          {/if}
          <ul class="forms">
            {#each group.forms as form (form.value)}
              <li>
                <!-- Une seule forme : la case de l'entité suffit ; plusieurs : une case par forme. -->
                <label class:single={group.forms.length === 1}>
                  {#if group.forms.length > 1}
                    <input
                      type="checkbox"
                      checked={form.active}
                      disabled={busy}
                      onchange={(e) => toggleForm(form.detectionIds, e.currentTarget.checked)}
                    />
                  {/if}
                  <span class="value">{form.value}</span>
                  {#if form.detectionIds.length > 1}
                    <span class="hint">×{form.detectionIds.length}</span>
                  {/if}
                </label>
                {#if group.sessionEntityId && group.forms.length > 1 && !form.detectionIds.some((id) => app.corrections.entityAssignments?.[id])}
                  <button
                    type="button"
                    class="link"
                    disabled={busy}
                    aria-label={`Séparer « ${form.value} »`}
                    onclick={() => split(group, form.value)}>Séparer</button
                  >
                {/if}
              </li>
            {/each}
          </ul>
          {#if app.mode === "pseudonymization" && group.entityType === "PERSON" && (group.needsReview || group.forms.some( (f) => f.detectionIds.some((id) => app.corrections.entityAssignments?.[id]) ))}
            <div class="occurrences">
              <p class="hint">
                Choisissez la personne pour chaque passage, sans fusionner les homonymes.
              </p>
              {#each group.forms as form (form.value)}
                {#each form.detectionIds as id (id)}
                  {#if group.needsReview || app.corrections.entityAssignments?.[id]}
                    {@const context = occurrenceContext(id)}
                    <label class="occurrence">
                      <span class="context"
                        >{context.before}<strong>{context.value}</strong>{context.after}</span
                      >
                      <select
                        id={`occurrence-person-${id}`}
                        aria-label={`Personne du passage ${id}`}
                        value={app.session?.byPseudonym(
                          app.corrections.entityAssignments?.[id] ?? "",
                        )?.pseudonym ??
                          app.corrections.entityAssignments?.[id] ??
                          ""}
                        disabled={busy || !app.detections.some((d) => d.id === id)}
                        onchange={(e) => assignOccurrence(id, e.currentTarget.value)}
                      >
                        <option value="">À vérifier (automatique)</option>
                        {#each people as person (person.id)}
                          <option value={person.pseudonym}>
                            {person.pseudonym} — {person.surfaceForms[0]}
                          </option>
                        {/each}
                      </select>
                    </label>
                  {/if}
                {/each}
              {/each}
            </div>
          {/if}
          {#if targets.length > 0}
            <select
              class="merge"
              aria-label={`Rattacher ${label(group)} à une autre entité`}
              value=""
              disabled={busy}
              onchange={(e) => merge(group, e.currentTarget.value)}
            >
              <option value="">Rattacher à…</option>
              {#each targets as target (target.key)}
                <option value={target.sessionEntityId}>{label(target)}</option>
              {/each}
            </select>
          {/if}
        </li>
      {/each}
    </ul>
    {#if hiddenCount > 0}
      <button type="button" onclick={() => (showAll = true)}>
        Afficher les {hiddenCount} autres entités
      </button>
    {/if}
  {/if}

  <p class="hint reminder">Relisez aussi les passages non surlignés.</p>
  <p class="hint" role="status" aria-live="polite">{message}</p>

  {#if app.analysis}
    <details class="detail">
      <summary>Détail et autres corrections</summary>
      <DetectionDetail><CorrectionsToolbar /></DetectionDetail>
    </details>
  {/if}
</div>

<style>
  .entities {
    display: grid;
    gap: 0.6rem;
    align-content: start;
    min-width: 0;
  }

  .pane-title {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
  }

  h3 {
    margin: 0;
  }

  .count {
    min-width: 1.75rem;
    padding: 0 0.5rem;
    border-radius: 999px;
    border: 1px solid var(--token-border);
    background: var(--token-bg);
    color: var(--token-text);
    font-size: var(--text-meta);
    font-weight: 700;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .help,
  .empty,
  .reminder,
  [role="status"] {
    margin: 0;
    font-size: var(--text-small);
  }

  [role="status"]:empty {
    display: none;
  }

  .list {
    display: grid;
    gap: 0.5rem;
    max-height: var(--pane-height, 24rem);
    margin: 0;
    padding: 0 0.25rem 0 0;
    overflow-y: auto;
    list-style: none;
    scrollbar-gutter: stable;
  }

  .entity {
    display: grid;
    gap: 0.35rem;
    padding: 0.6rem 0.7rem;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    background: var(--surface);
  }

  .entity.cleared {
    border-style: dashed;
    background: transparent;
  }

  .entity.cleared .token {
    opacity: 0.6;
    text-decoration: line-through;
  }

  .group-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    cursor: pointer;
  }

  .forms label.single {
    padding-left: 1.6rem;
  }

  .entity.review {
    border-color: var(--warn-border);
  }

  .entity-title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
  }

  .entity-title select {
    margin-left: auto;
    flex: 0 1 10rem;
    min-width: 0;
  }

  .entity-title select,
  .merge {
    padding: 0.15rem 0.4rem;
    border-color: var(--border-soft);
    width: auto;
    max-width: 100%;
    font-size: var(--text-meta);
  }

  .flag {
    margin: 0;
    color: var(--warn-text);
    font-size: var(--text-meta);
  }

  .forms {
    display: grid;
    gap: 0.2rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .forms li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .forms label {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    min-width: 0;
    font-size: var(--text-small);
  }

  .value {
    overflow-wrap: anywhere;
  }

  button.link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font-size: var(--text-meta);
    text-decoration: underline;
  }

  .detail summary {
    cursor: pointer;
    font-size: var(--text-small);
    font-weight: 600;
  }

  .occurrences,
  .occurrence {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }

  .occurrences {
    padding-top: 0.5rem;
    border-top: 1px solid var(--border-soft);
  }

  .occurrences p {
    margin: 0;
  }

  .context {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: var(--text-small);
  }

  .occurrence select {
    width: 100%;
    min-width: 0;
  }
</style>
