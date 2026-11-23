<!--
  Structure de l'application : identité, parcours sur une page (#38) et réglages avancés.
-->
<script lang="ts">
  import { ENGINE_VERSION } from "../core/index.ts";
  import LimitsBanner from "./components/LimitsBanner.svelte";
  import OfflineBadge from "./components/OfflineBadge.svelte";
  import SettingsScreen from "./screens/SettingsScreen.svelte";
  import Workspace from "./screens/Workspace.svelte";

  let settings: HTMLDetailsElement | undefined = $state();
  /** Thème clair par défaut ; le choix sombre vaut pour la visite, il n'est pas enregistré. */
  let dark = $state(false);

  $effect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  });

  function openModelSettings(): void {
    if (!settings) return;
    settings.open = true;
    const model = document.getElementById("settings-model");
    model?.focus();
    model?.scrollIntoView({ block: "start" });
  }
</script>

<a class="skip-link" href="#contenu">Aller au contenu</a>

<div class="page">
  <header>
    <h1><img src="./lessive-mark.svg" width="20" height="24" alt="" />Lessive</h1>
    <p>Traitement local, dans ce navigateur.</p>
    <!-- Avertissement permanent (R6) : dans l'en-tête, toujours visible (#38). -->
    <LimitsBanner />
  </header>

  <main id="contenu" tabindex="-1">
    <Workspace onConfigureModel={openModelSettings} />
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
      · Licence Apache 2.0 ·
      <button type="button" class="theme" aria-pressed={dark} onclick={() => (dark = !dark)}
        >Thème sombre</button
      >
    </span>
    <OfflineBadge />
  </footer>
</div>

<style>
  .page {
    max-width: 76rem;
    margin: 0 auto;
    padding: 0.75rem clamp(1rem, 3vw, 2rem);
  }

  /* En-tête réduit au minimum (#38) : la page commence par le travail. */
  header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    margin-bottom: 0.5rem;
  }

  h1 {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0;
    font-size: var(--text-subheading);
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1;
  }

  h1 img {
    display: block;
    flex: none;
  }

  header p {
    margin: 0;
    color: var(--muted);
    font-size: var(--text-meta);
  }

  main {
    margin: 0.5rem 0 1.5rem;
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

  .theme {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }

  .theme[aria-pressed="true"]::before {
    content: "✓ ";
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
