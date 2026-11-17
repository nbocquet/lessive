<!--
  Import chiffré de la table de correspondance (T5.5). Le fichier est lu en local (FileReader),
  déchiffré, puis remplace la session après confirmation si la session courante n'est pas vide.
  La phrase de passe est un champ local, vidé après chaque tentative.
-->
<script lang="ts">
  import type { Session } from "../../core/index.ts";
  import { app } from "../state.svelte.ts";
  import { readFileAsText } from "./PseudoDom.ts";
  import {
    MAX_IMPORT_BYTES,
    describeSessionError,
    importSession,
    isSessionEmpty,
  } from "./PseudoLogic.ts";

  let file = $state.raw<File | null>(null);
  let passphrase = $state("");
  let busy = $state(false);
  let error = $state("");
  let done = $state("");
  /** Session déchiffrée, en attente de confirmation du remplacement. */
  let pending = $state.raw<Session | null>(null);
  let fileInput: HTMLInputElement | undefined = $state();

  function onFile(event: Event & { currentTarget: HTMLInputElement }): void {
    file = event.currentTarget.files?.[0] ?? null;
    error = "";
    done = "";
    pending = null;
  }

  function apply(session: Session): void {
    app.replaceSession(session);
    pending = null;
    file = null;
    if (fileInput) fileInput.value = "";
    done = `Session importée : ${session.entities().length} ${
      session.entities().length === 1 ? "entité" : "entités"
    }. Le résultat va être recalculé avec ces pseudonymes ; relisez-le et validez-le.`;
  }

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    error = "";
    done = "";
    pending = null;
    if (!file) {
      error = "Choisissez d'abord un fichier de correspondances.";
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      error = "Fichier trop volumineux pour être un fichier de correspondances Lessive.";
      return;
    }
    busy = true;
    try {
      const content = await readFileAsText(file);
      const session = await importSession(content, passphrase);
      if (isSessionEmpty(app.session)) apply(session);
      else pending = session;
    } catch (err) {
      error = describeSessionError(err);
    } finally {
      busy = false;
      passphrase = "";
    }
  }
</script>

<section aria-labelledby="h-import">
  <h4 id="h-import">Importer des correspondances (chiffré)</h4>
  <form onsubmit={submit} aria-busy={busy}>
    <label>
      Fichier de correspondances (.json)
      <input
        type="file"
        accept=".json,application/json"
        bind:this={fileInput}
        onchange={onFile}
        disabled={busy}
      />
    </label>
    <label>
      Phrase de passe
      <input
        type="password"
        bind:value={passphrase}
        autocomplete="current-password"
        disabled={busy}
        required
      />
    </label>
    <div class="actions">
      <button type="submit" class="primary" disabled={busy || !file}> Importer </button>
      {#if busy}
        <label class="progress">
          Déchiffrement en cours, quelques secondes…
          <progress></progress>
        </label>
      {/if}
    </div>
  </form>
  {#if error}
    <p class="notice error" role="alert">{error}</p>
  {/if}
  {#if pending}
    <div class="notice" role="alertdialog" aria-labelledby="h-import-confirm">
      <p id="h-import-confirm">
        <strong>Remplacer la session actuelle ?</strong>
        Elle contient des correspondances : celles qui n'ont pas été exportées seront perdues.
      </p>
      <div class="actions">
        <button type="button" class="primary" onclick={() => pending && apply(pending)}>
          Remplacer la session
        </button>
        <button type="button" onclick={() => (pending = null)}>Annuler</button>
      </div>
    </div>
  {/if}
  {#if done}
    <p role="status">{done}</p>
  {/if}
</section>

<style>
  h4 {
    margin: 0 0 0.25rem;
  }

  form {
    display: grid;
    gap: 0.5rem;
    max-width: 32rem;
  }

  input[type="password"] {
    display: block;
    width: 100%;
    padding: 0.5rem;
    border: 2px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
  }

  .progress {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
</style>
