<!--
  T5.3 — Corrections : ajout manuel par sélection (avec propagation à toutes les occurrences),
  suppression et restauration, changement de catégorie, changement d'opérateur.
  Méthodes d'état : app.addManualMany, removeDetection, restoreDetection,
  setDetectionType, setDetectionOperator, setOperatorForType.

  Tout est utilisable au clavier : la sélection à la souris a pour équivalent la saisie du
  texte à ajouter. Chaque action est annoncée dans une zone `aria-live`.
-->
<script lang="ts">
  import {
    ENTITY_TYPES,
    type Detection,
    type EntityType,
    type OperatorId,
  } from "../../core/index.ts";
  import { app } from "../state.svelte.ts";
  import {
    OPERATOR_NAMES,
    excerpt,
    operatorsForMode,
    typeName,
    typeNameWithTag,
  } from "./review-labels.ts";
  import { planManualSpans } from "./review-selection.ts";

  // ---- État purement visuel ----
  let newType = $state<EntityType>("PERSON");
  let applyAll = $state(true);
  let query = $state("");
  let typeChoice = $state<EntityType>("PERSON");
  let opChoice = $state<OperatorId | "default">("default");
  let scope = $state<"one" | "type">("one");
  let message = $state("");
  let flip = false;
  let awaitingUpdate = $state(false);
  let adding = $state(false);

  $effect(() => {
    if (app.textSelection) adding = true;
  });

  const busy = $derived(app.analysisStatus === "running");
  const operators = $derived(operatorsForMode(app.mode));

  const selected = $derived<Detection | null>(
    app.detections.find((d) => d.id === app.selectedDetectionId) ?? null,
  );
  const removed = $derived<Detection[]>(
    (app.analysis?.detections ?? []).filter((d) => app.corrections.removedIds.includes(d.id)),
  );

  const selectionText = $derived(
    app.textSelection ? app.text.slice(app.textSelection.start, app.textSelection.end) : "",
  );
  const usingQuery = $derived(query.trim().length > 0);
  const plan = $derived(
    usingQuery || app.textSelection
      ? planManualSpans(app.text, usingQuery ? null : app.textSelection, query, newType, applyAll)
      : null,
  );

  // La catégorie proposée suit la détection sélectionnée.
  $effect(() => {
    if (selected) typeChoice = selected.entityType;
  });

  // Après un ajout, l'analyse est relancée : on annonce la fin de la mise à jour.
  $effect(() => {
    if (!awaitingUpdate) return;
    if (app.analysisStatus === "done") {
      awaitingUpdate = false;
      announce(`Analyse mise à jour : ${countText(app.detectionCount)}.`);
    } else if (app.analysisStatus === "error") {
      awaitingUpdate = false;
    }
  });

  function countText(n: number): string {
    return n === 1 ? "1 détection" : `${n} détections`;
  }

  /** Alterne un espace final pour que le lecteur d'écran ré-annonce un message identique. */
  function announce(text: string): void {
    flip = !flip;
    message = flip ? `${text} ` : text;
  }

  function focusText(): void {
    document.getElementById("review-text")?.focus();
  }

  function addManual(): void {
    if (!plan || plan.spans.length === 0) {
      announce(
        usingQuery
          ? "Texte introuvable : rien à ajouter."
          : "Sélectionnez d'abord du texte à ajouter.",
      );
      return;
    }
    const before = app.corrections.added.length;
    try {
      app.addManualMany(plan.spans);
    } catch {
      announce("Ajout impossible : la sélection est invalide.");
      return;
    }
    const added = app.corrections.added.length - before;
    query = "";
    app.setTextSelection(null);
    window.getSelection()?.removeAllRanges();
    if (added === 0) {
      announce("Ces occurrences étaient déjà ajoutées.");
      return;
    }
    awaitingUpdate = true;
    announce(
      `${added === 1 ? "1 détection ajoutée" : `${added} détections ajoutées`} en ${typeName(newType)}. Mise à jour de l'analyse en cours.`,
    );
  }

  function removeSelected(): void {
    if (!selected) return;
    const wasManual = selected.source === "manual";
    const label = typeName(selected.entityType);
    app.removeDetection(selected.id);
    if (wasManual) awaitingUpdate = true;
    announce(`Détection supprimée : ${label}.`);
    focusText();
  }

  function restore(d: Detection): void {
    app.restoreDetection(d.id);
    app.selectDetection(d.id);
    announce(`Détection restaurée : ${typeName(d.entityType)}.`);
  }

  function changeType(): void {
    if (!selected) return;
    app.setDetectionType(selected.id, typeChoice);
    announce(`Catégorie changée en ${typeName(typeChoice)}.`);
  }

  function resetType(): void {
    if (!selected) return;
    app.setDetectionType(selected.id, null);
    announce("Catégorie d'origine rétablie.");
  }

  function applyOperator(): void {
    if (!selected) return;
    const op = opChoice === "default" ? null : opChoice;
    try {
      if (scope === "type") app.setOperatorForType(selected.entityType, op);
      else app.setDetectionOperator(selected.id, op);
    } catch {
      announce("Cet opérateur n'est pas disponible dans le mode actuel.");
      return;
    }
    const where =
      scope === "type" ? `toute la catégorie ${typeName(selected.entityType)}` : "cette détection";
    announce(
      op === null
        ? `Transformation par défaut rétablie pour ${where}.`
        : `Transformation « ${OPERATOR_NAMES[op]} » appliquée à ${where}.`,
    );
  }

  const typeOverridden = $derived(
    selected !== null && selected.id in app.corrections.typeOverrides,
  );
</script>

<section class="tools" aria-label="Corrections">
  <p class="status" class:empty={!message} role="status" aria-live="polite">{message}</p>
  {#if busy}
    <p class="hint" role="status">Mise à jour de l'analyse en cours…</p>
  {/if}
  {#if app.analysisStatus === "error" && app.errorMessage}
    <p class="notice error" role="alert">{app.errorMessage}</p>
  {/if}

  {#if selected}
    <fieldset disabled={busy || selected === null}>
      <legend>Modifier ce passage</legend>

      <div class="field">
        <label for="rv-type">Catégorie</label>
        <select id="rv-type" bind:value={typeChoice}>
          {#each ENTITY_TYPES as t (t)}
            <option value={t}>{typeNameWithTag(t)}</option>
          {/each}
        </select>
        <div class="row">
          <button
            type="button"
            onclick={changeType}
            disabled={!selected || typeChoice === selected.entityType}
          >
            Changer la catégorie
          </button>
          {#if typeOverridden}
            <button type="button" onclick={resetType}>Rétablir l'origine</button>
          {/if}
        </div>
      </div>

      <details class="advanced">
        <summary>Changer le remplacement</summary>
        <div class="field">
          <label for="rv-op">Transformation</label>
          <select id="rv-op" bind:value={opChoice}>
            <option value="default">Par défaut du mode</option>
            {#each operators as op (op)}
              <option value={op}>{OPERATOR_NAMES[op]}</option>
            {/each}
          </select>
          <label class="check">
            <input type="radio" name="rv-scope" value="one" bind:group={scope} />
            Cette détection
          </label>
          <label class="check">
            <input type="radio" name="rv-scope" value="type" bind:group={scope} />
            Toutes les détections de la catégorie{selected
              ? ` « ${typeName(selected.entityType)} »`
              : ""}
          </label>
          <button type="button" onclick={applyOperator}>Appliquer la transformation</button>
        </div>
      </details>
      <button type="button" class="danger" onclick={removeSelected}
        >Laisser ce passage en clair</button
      >
    </fieldset>
  {/if}

  <details class="add-missing" bind:open={adding}>
    <summary>Ajouter une donnée manquante</summary>
    <fieldset disabled={busy}>
      <legend class="visually-hidden">Donnée manquante</legend>
      <p class="hint">
        Sélectionnez du texte dans le document ou saisissez la valeur à ajouter ci-dessous.
      </p>
      <p class="selection" aria-live="polite">
        {#if usingQuery}
          Texte saisi utilisé à la place de la sélection.
        {:else if selectionText}
          Sélection : « {excerpt(selectionText, 60)} »
        {:else}
          Aucune sélection.
        {/if}
      </p>

      <div class="field">
        <label for="rv-query">Texte à ajouter (facultatif)</label>
        <input id="rv-query" type="text" autocomplete="off" spellcheck="false" bind:value={query} />
      </div>

      <div class="field">
        <label for="rv-new-type">Catégorie</label>
        <select id="rv-new-type" bind:value={newType}>
          {#each ENTITY_TYPES as t (t)}
            <option value={t}>{typeNameWithTag(t)}</option>
          {/each}
        </select>
      </div>

      <label class="check">
        <input type="checkbox" bind:checked={applyAll} />
        Appliquer à toutes les occurrences
      </label>
      <p class="hint">
        {#if applyAll}
          Sans tenir compte de la casse, mots entiers.
        {:else if usingQuery}
          Seule la première occurrence sera ajoutée.
        {:else}
          Seule la sélection sera ajoutée.
        {/if}
        {#if plan && plan.found > 0}
          {plan.found === 1 ? "1 occurrence trouvée." : `${plan.found} occurrences trouvées.`}
        {/if}
        {#if plan?.truncated}
          Liste limitée aux premières occurrences.
        {/if}
      </p>

      <button type="button" class="primary" onclick={addManual}>Ajouter</button>
    </fieldset>
  </details>

  {#if removed.length > 0}
    <details>
      <summary>Passages laissés en clair ({removed.length})</summary>
      <fieldset disabled={busy}>
        <legend class="visually-hidden">Restaurer les remplacements</legend>
        <ul>
          {#each removed as d (d.id)}
            <li>
              <span
                >{typeName(d.entityType)} : « {excerpt(app.text.slice(d.start, d.end), 30)} »</span
              >
              <button type="button" onclick={() => restore(d)}>Restaurer</button>
            </li>
          {/each}
        </ul>
      </fieldset>
    </details>
  {/if}
</section>

<style>
  .tools {
    display: grid;
    gap: 1rem;
  }

  fieldset {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }

  .field {
    display: grid;
    gap: 0.25rem;
  }

  input[type="text"] {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg);
  }

  .check {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .check input {
    width: 1.1rem;
    height: 1.1rem;
    margin-top: 0.2rem;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  p {
    margin: 0;
  }

  .hint {
    color: var(--muted);
    font-size: var(--text-small);
  }

  .status {
    font-weight: 600;
  }

  .status.empty {
    margin: 0;
    height: 0;
    overflow: hidden;
  }

  summary {
    cursor: pointer;
    font-weight: 600;
    font-size: var(--text-small);
  }

  details > fieldset,
  .advanced .field {
    margin-top: 0.75rem;
  }

  fieldset {
    padding: 0;
    border: 0;
  }

  legend {
    padding: 0;
    margin-bottom: 0.5rem;
    font-size: var(--text-small);
  }

  .add-missing {
    padding-top: 0.75rem;
    border-top: 1px solid var(--border-soft);
  }

  .selection {
    overflow-wrap: anywhere;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  li + li {
    margin-top: 0.5rem;
  }

  button.danger {
    border-color: var(--danger-border);
    color: var(--danger-text);
    background: var(--danger-bg);
  }
</style>
