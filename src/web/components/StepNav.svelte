<!-- Navigation entre les écrans du parcours (T5.1). Boutons natifs : clavier et lecteurs d'écran. -->
<script lang="ts">
  import { app, type ScreenId } from "../state.svelte.ts";

  const steps: { id: ScreenId; label: string; help: string }[] = [
    { id: "text", label: "1. Texte", help: "Préparer" },
    { id: "review", label: "2. Vérification", help: "Relire et corriger" },
    { id: "result", label: "3. Résultat", help: "Valider et copier" },
    { id: "reidentify", label: "4. Réponse du LLM", help: "Retrouver les valeurs" },
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
          title={step.help}
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
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
    border-bottom: 1px solid var(--border-soft);
  }

  button {
    width: 100%;
    text-align: left;
    padding: 0.65rem 0;
    border: 0;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    background: transparent;
    color: var(--muted);
    font-size: 0.875rem;
    font-weight: 500;
  }

  button:disabled {
    background: transparent;
    border-bottom-color: transparent;
  }

  button.current {
    background: transparent;
    border-bottom-color: var(--accent);
    color: var(--accent);
    font-weight: 700;
  }

  @media (max-width: 40rem) {
    ol {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    button {
      text-align: left;
      padding-left: 0;
    }
  }
</style>
