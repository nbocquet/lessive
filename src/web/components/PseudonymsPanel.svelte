<!--
  T5.5 — Table des pseudonymes et gestion de session (mode Pseudonymisation, voir ResultScreen) :
  liste des entités, fusion, scission, nouvelle session, export et import chiffrés.
  Tout reste en mémoire (R5), sauf le fichier chiffré que l'utilisateur demande à télécharger.
-->
<script lang="ts">
  import { app } from "../state.svelte.ts";
  import { isSessionEmpty } from "./PseudoLogic.ts";
  import PseudoEntityList from "./PseudoEntityList.svelte";
  import PseudoExport from "./PseudoExport.svelte";
  import PseudoImport from "./PseudoImport.svelte";

  let confirming = $state(false);
  let message = $state("");

  function requestNewSession(): void {
    message = "";
    if (isSessionEmpty(app.session)) startNewSession();
    else confirming = true;
  }

  function startNewSession(): void {
    app.newSession();
    confirming = false;
    message = "Nouvelle session : les pseudonymes recommencent. Le résultat est recalculé.";
  }
</script>

<section class="pseudonyms" aria-labelledby="h-pseudonyms">
  <h3 id="h-pseudonyms">Pseudonymes de la session</h3>
  <p class="hint">
    Une même session garde les mêmes pseudonymes d'un document à l'autre. La table ne quitte pas ce
    navigateur, sauf export chiffré demandé ci-dessous.
  </p>

  <PseudoEntityList />

  <div class="session">
    <button type="button" onclick={requestNewSession}>Nouvelle session</button>
    {#if confirming}
      <div class="notice" role="alertdialog" aria-labelledby="h-new-session">
        <p id="h-new-session">
          <strong>Démarrer une nouvelle session ?</strong>
          Les correspondances non exportées seront perdues : un texte déjà envoyé au LLM ne pourra plus
          être réidentifié.
        </p>
        <div class="actions">
          <button type="button" class="primary" onclick={startNewSession}>
            Oui, nouvelle session
          </button>
          <button type="button" onclick={() => (confirming = false)}>Annuler</button>
        </div>
      </div>
    {/if}
    <p role="status" aria-live="polite">{message}</p>
  </div>

  <PseudoExport />
  <PseudoImport />
</section>

<style>
  .pseudonyms {
    display: grid;
    gap: 1.25rem;
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 2px solid var(--border);
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
</style>
