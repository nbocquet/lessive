<!--
  Export chiffré de la table de correspondance (T5.5). La phrase de passe vit dans des champs locaux
  au composant : elle n'entre jamais dans l'état partagé, n'est jamais journalisée et les champs sont
  vidés dès la fin de l'opération.
-->
<script lang="ts">
  import { app } from "../state.svelte.ts";
  import {
    MIN_PASSPHRASE_LENGTH,
    describeSessionError,
    exportSession,
    isSessionEmpty,
    validateNewPassphrase,
  } from "./PseudoLogic.ts";
  import { downloadTextFile } from "./ResultDom.ts";

  let passphrase = $state("");
  let confirmation = $state("");
  let busy = $state(false);
  let error = $state("");
  let done = $state("");

  const empty = $derived(isSessionEmpty(app.session));

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    error = "";
    done = "";
    const session = app.session;
    if (!session || isSessionEmpty(session)) {
      error = "Aucune correspondance à exporter.";
      return;
    }
    const check = validateNewPassphrase(passphrase, confirmation);
    if (!check.ok) {
      error = check.message;
      return;
    }
    busy = true;
    try {
      const file = await exportSession(session, passphrase);
      downloadTextFile(file.fileName, file.content, "application/json");
      done = `Fichier ${file.fileName} téléchargé. Conservez-le avec la phrase de passe : l'un sans l'autre est inutilisable.`;
    } catch (err) {
      error = describeSessionError(err);
    } finally {
      busy = false;
      // La phrase de passe ne survit pas à l'opération.
      passphrase = "";
      confirmation = "";
    }
  }
</script>

<section aria-labelledby="h-export">
  <h4 id="h-export">Exporter les correspondances (chiffré)</h4>
  <p class="notice" role="note">
    <strong>Sans la phrase de passe, le fichier est irrécupérable.</strong>
    Elle n'est ni stockée ni récupérable. Notez-la dans un gestionnaire de mots de passe.
  </p>
  <form onsubmit={submit} aria-busy={busy}>
    <label>
      Phrase de passe ({MIN_PASSPHRASE_LENGTH} caractères au minimum)
      <input
        type="password"
        bind:value={passphrase}
        autocomplete="new-password"
        disabled={busy || empty}
        required
      />
    </label>
    <label>
      Confirmer la phrase de passe
      <input
        type="password"
        bind:value={confirmation}
        autocomplete="new-password"
        disabled={busy || empty}
        required
      />
    </label>
    <div class="actions">
      <button type="submit" class="primary" disabled={busy || empty}>
        Exporter le fichier chiffré
      </button>
      {#if busy}
        <label class="progress">
          Dérivation de la clé en cours, quelques secondes…
          <progress></progress>
        </label>
      {/if}
    </div>
  </form>
  {#if empty}
    <p class="hint">Aucune correspondance pour l'instant : rien à exporter.</p>
  {/if}
  {#if error}
    <p class="notice error" role="alert">{error}</p>
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
