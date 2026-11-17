<!-- Navigation entre les écrans du parcours (T5.1). Boutons natifs : clavier et lecteurs d'écran. -->
<script lang="ts">
  import { app, type ScreenId } from "../state.svelte.ts";

  const steps: { id: ScreenId; label: string }[] = [
    { id: "text", label: "1. Texte" },
    { id: "review", label: "2. Vérification" },
    { id: "result", label: "3. Résultat" },
    { id: "reidentify", label: "4. Réponse du LLM" },
  ];
</script>

<nav aria-label="Étapes du parcours">
  <ol>
    {#each steps as step (step.id)}
      <li>
        <button
          type="button"
          class:current={app.screen === step.id}
          aria-current={app.screen === step.id ? "step" : undefined}
          disabled={!app.canGoTo(step.id)}
          onclick={() => app.goTo(step.id)}
        >
          {step.label}
        </button>
      </li>
    {/each}
  </ol>
</nav>

<style>
  ol {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  button.current {
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 700;
  }
</style>
