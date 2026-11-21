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
    <h1><img src="./lessive-mark.svg" width="50" height="60" alt="" />Lessive</h1>
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

  <footer class="hint">
    <span>
      Lessive {ENGINE_VERSION} ·
      <a href="https://github.com/nbocquet/lessive" target="_blank" rel="noopener noreferrer"
        >Code source</a
      >
      ·
      <a
        href="https://github.com/nbocquet/lessive/blob/main/docs/confidentialite.md"
        target="_blank"
        rel="noopener noreferrer">Confidentialité</a
      >
      ·
      <a
        href="https://github.com/nbocquet/lessive/blob/main/docs/limites.md"
        target="_blank"
        rel="noopener noreferrer">Limites</a
      >
      · Licence Apache 2.0
    </span>
    <OfflineBadge />
  </footer>
</div>

<style>
  .page {
    max-width: 76rem;
    margin: 0 auto;
    padding: 1.25rem clamp(1rem, 3vw, 2rem);
  }

  /*
   * La marque domine les titres d'étape : logo et nom au corps --text-brand, au-dessus de
   * --text-heading, l'accroche centrée sur la marque.
   */
  header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.25rem 1.75rem;
    margin-bottom: 1.25rem;
  }

  h1 {
    display: inline-flex;
    align-items: center;
    gap: 0.7rem;
    margin: 0;
    font-size: var(--text-brand);
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1;
  }

  h1 img {
    display: block;
    flex: none;
  }

  header p {
    margin: 0;
    color: var(--muted);
    font-size: var(--text-small);
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
    font-size: var(--text-small);
  }

  summary .hint {
    margin-left: 0.75rem;
    font-weight: 400;
    font-size: var(--text-meta);
  }

  footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: var(--text-meta);
  }

  @media (max-width: 40rem) {
    summary .hint {
      display: none;
    }
  }
</style>
