<!--
  Structure de l'application : identité, navigation du parcours, espace de travail et réglages avancés.
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
  let settings: HTMLDetailsElement | undefined = $state();
  let previousScreen = app.screen;

  function openModelSettings(): void {
    if (!settings) return;
    settings.open = true;
    const model = document.getElementById("settings-model");
    model?.focus();
    model?.scrollIntoView({ block: "start" });
  }

  // Après un changement d'écran, le focus passe au contenu (lecteurs d'écran, clavier).
  $effect(() => {
    const current = app.screen;
    if (current !== previousScreen) {
      previousScreen = current;
      main?.focus({ preventScroll: true });
      main?.scrollIntoView({ block: "start" });
    }
  });
</script>

<a class="skip-link" href="#contenu">Aller au contenu</a>
<LimitsBanner />

<div class="page">
  <header>
    <h1><img src="./lessive-mark.svg" width="40" height="48" alt="" />Lessive</h1>
    <p>Traitement local : votre texte reste dans ce navigateur.</p>
  </header>

  <StepNav />

  <main id="contenu" tabindex="-1" bind:this={main}>
    {#if app.screen === "text"}
      <TextScreen onConfigureModel={openModelSettings} />
    {:else if app.screen === "review"}
      <ReviewScreen />
    {:else if app.screen === "result"}
      <ResultScreen />
    {:else}
      <ReidentifyScreen />
    {/if}
  </main>

  <details class="settings" bind:this={settings}>
    <summary>Réglages <span class="hint">Détection, langues et modèle</span></summary>
    <SettingsScreen />
  </details>

  <footer class="hint"><span>Lessive · Moteur {ENGINE_VERSION}</span><OfflineBadge /></footer>
</div>

<style>
  .page {
    max-width: 76rem;
    margin: 0 auto;
    padding: 1.25rem clamp(1rem, 3vw, 2rem);
  }

  header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.35rem 1.5rem;
    margin-bottom: 1rem;
  }

  h1 {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    margin: 0;
    font-size: 1.3rem;
    font-weight: 650;
  }

  h1 img {
    display: block;
    flex: none;
  }

  header p {
    margin: 0;
    color: var(--muted);
    font-size: 0.8rem;
  }

  main {
    margin: 1.5rem 0;
  }

  main:focus {
    outline: none;
  }

  .settings {
    margin: 1.5rem 0 0.75rem;
    padding: 0.9rem 0;
    border-top: 1px solid var(--border-soft);
    border-bottom: 1px solid var(--border-soft);
  }

  summary {
    cursor: pointer;
    font-weight: 600;
    font-size: 0.875rem;
  }

  summary .hint {
    margin-left: 0.75rem;
    font-weight: 400;
    font-size: 0.8rem;
  }

  footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.75rem;
  }

  @media (max-width: 40rem) {
    summary .hint {
      display: none;
    }
  }
</style>
