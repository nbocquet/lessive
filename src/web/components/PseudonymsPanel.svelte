<!--
  T5.5 — Gestion de la session de pseudonymisation : nouvelle session, export et import chiffrés.
  Depuis #38, la liste des entités (séparer, rattacher) est dans la colonne « À vérifier ».
  Tout reste en mémoire (R5), sauf le fichier chiffré que l'utilisateur demande à télécharger.
-->
<script lang="ts">
  import { app } from "../state.svelte.ts";
  import { isSessionEmpty } from "./PseudoLogic.ts";
  import PseudoExport from "./PseudoExport.svelte";
  import PseudoImport from "./PseudoImport.svelte";
  import { confirmFocus } from "./confirm-focus.ts";

  let confirming = $state(false);
  let message = $state("");
  let trigger: HTMLButtonElement | undefined = $state();

  /** Fermer la confirmation rend le focus au bouton qui l'a ouverte. */
  function cancelNewSession(): void {
    confirming = false;
    trigger?.focus();
  }

  function requestNewSession(): void {
    message = "";
    if (isSessionEmpty(app.session)) startNewSession();
    else confirming = true;
  }

  function startNewSession(): void {
    app.newSession();
    confirming = false;
    trigger?.focus();
    message = "Nouvelle session : les pseudonymes recommencent. Le résultat est recalculé.";
  }
</script>

<section class="pseudonyms" aria-labelledby="h-pseudonyms">
  <h3 id="h-pseudonyms">Session de pseudonymisation</h3>
  <p class="hint">
    Une même session garde les mêmes pseudonymes d'un document à l'autre. La table ne quitte pas ce
    navigateur, sauf export chiffré demandé ci-dessous.
  </p>

  <div class="session">
    <button type="button" bind:this={trigger} onclick={requestNewSession}>Nouvelle session</button>
    {#if confirming}
      <div
        class="notice"
        role="group"
        aria-labelledby="h-new-session"
        tabindex="-1"
        {@attach confirmFocus(cancelNewSession)}
      >
        <p id="h-new-session">
          <strong>Démarrer une nouvelle session ?</strong>
          Les correspondances non exportées seront perdues : un texte déjà envoyé à l'assistant ne pourra
          plus être réidentifié.
        </p>
        <div class="actions">
          <button type="button" class="primary" onclick={startNewSession}>
            Oui, nouvelle session
          </button>
          <button type="button" onclick={cancelNewSession}>Annuler</button>
        </div>
      </div>
    {/if}
    <p role="status" aria-live="polite">{message}</p>
  </div>

  <!-- Usage occasionnel (reprise après rechargement) : replié pour ne pas allonger l'étape. -->
  <details class="session-file">
    <summary>Sauvegarder ou reprendre la session <span class="hint">fichier chiffré</span></summary>
    <div class="session-file-content">
      <PseudoExport />
      <PseudoImport />
    </div>
  </details>
</section>

<style>
  .pseudonyms {
    display: grid;
    gap: 1.25rem;
    margin-top: 0.75rem;
  }

  h3 {
    margin: 0;
  }

  .pseudonyms > p {
    margin: 0;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  /* Région annoncée gardée dans l'arbre d'accessibilité, sans place quand elle est vide. */
  .session [role="status"]:empty {
    margin: 0;
  }

  .session-file summary {
    padding: 0.6rem 0;
    font-weight: 600;
    cursor: pointer;
  }

  .session-file summary .hint {
    margin-left: 0.5rem;
    font-weight: 400;
  }

  .session-file-content {
    display: grid;
    gap: 1.5rem;
    padding: 0.5rem 0 0 1.2rem;
  }
</style>
