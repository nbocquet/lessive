<!--
  Structure de l'application (T5.1) : en-tête, avertissement permanent, navigation, écran courant,
  réglages repliés. Fichier figé après T5.1 : les écrans vivent dans screens/ et components/.
-->
<script lang="ts">
  import { ENGINE_VERSION } from "../core/index.ts";
  import LimitsBanner from "./components/LimitsBanner.svelte";
  import OfflineBadge from "./components/OfflineBadge.svelte";
  import StepNav from "./components/StepNav.svelte";
  import ReidentifyScreen from "./screens/ReidentifyScreen.svelte";
  import ResultScreen from "./screens/ResultScreen.svelte";
  import ReviewScreen from "./screens/ReviewScreen.svelte";
  import SettingsScreen from "./screens/SettingsScreen.svelte";
  import TextScreen from "./screens/TextScreen.svelte";
  import { app } from "./state.svelte.ts";

  let main: HTMLElement | undefined = $state();
  let previousScreen = app.screen;

  // Après un changement d'écran, le focus passe au contenu (lecteurs d'écran, clavier).
  $effect(() => {
    const current = app.screen;
    if (current !== previousScreen) {
      previousScreen = current;
      main?.focus();
    }
  });
</script>

<a class="skip-link" href="#contenu">Aller au contenu</a>
<LimitsBanner />

<div class="page">
  <header>
    <h1>Lessive</h1>
    <p class="hint">Traitement local : votre texte ne quitte pas ce navigateur.</p>
    <StepNav />
  </header>

  <main id="contenu" tabindex="-1" bind:this={main}>
    {#if app.screen === "text"}
      <TextScreen />
    {:else if app.screen === "review"}
      <ReviewScreen />
    {:else if app.screen === "result"}
      <ResultScreen />
    {:else}
      <ReidentifyScreen />
    {/if}
  </main>

  <details class="settings">
    <summary>Réglages</summary>
    <SettingsScreen />
  </details>

  <footer class="hint">Moteur {ENGINE_VERSION}<OfflineBadge /></footer>
</div>

<style>
  .page {
    max-width: 64rem;
    margin: 0 auto;
    padding: 1rem;
  }

  header h1 {
    margin: 0;
  }

  header p {
    margin: 0 0 0.75rem;
  }

  main {
    margin: 1.5rem 0;
  }

  main:focus {
    outline: none;
  }

  .settings {
    margin: 1rem 0;
    padding: 0.5rem 1rem;
    border: 2px solid var(--border);
    border-radius: var(--radius);
  }

  summary {
    cursor: pointer;
    font-weight: 600;
  }
</style>
