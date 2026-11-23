<!-- Choix du mode (R6 : « Masquage » et « Pseudonymisation », jamais un autre nom). -->
<script lang="ts">
  import type { Mode } from "../../core/index.ts";
  import { app } from "../state.svelte.ts";

  /** Version barre d'outils (#38) : une liste déroulante, l'aide en infobulle. */
  let { compact = false }: { compact?: boolean } = $props();

  const modes: { id: Mode; label: string; help: string }[] = [
    {
      id: "masking",
      label: "Masquage",
      help: "Remplacement par des astérisques de même longueur : *****. La catégorie ([PERSONNE]) peut être choisie dans le détail des corrections. Les valeurs ne peuvent pas être restituées.",
    },
    {
      id: "pseudonymization",
      label: "Pseudonymisation",
      help: "Remplacement par un pseudonyme stable : PERSONNE_001. Les valeurs peuvent être restituées dans la réponse de l'assistant.",
    },
  ];

  /** Exemples de jetons dans l'aide (chaînes statiques ci-dessus) : affichés en capsule. */
  const TOKEN = /(\*{3,}|\[[A-Z_]+\]|\b[A-Z]+_\d{3}\b)/;
  const parts = (text: string): { text: string; token: boolean }[] =>
    text
      .split(TOKEN)
      .filter((t) => t !== "")
      .map((t) => ({ text: t, token: TOKEN.test(t) }));
</script>

{#if compact}
  <label class="compact-mode">
    <span>Traitement</span>
    <select
      value={app.mode}
      title={modes.find((m) => m.id === app.mode)?.help}
      onchange={(e) => app.setMode(e.currentTarget.value as Mode)}
    >
      {#each modes as m (m.id)}
        <option value={m.id}>{m.label}</option>
      {/each}
    </select>
  </label>
{:else}
  <fieldset class="modes">
    <legend>Mode de traitement</legend>
    {#each modes as m (m.id)}
      <div class="option">
        <label>
          <input
            type="radio"
            name="mode"
            value={m.id}
            checked={app.mode === m.id}
            onchange={() => app.setMode(m.id)}
          />
          <strong>{m.label}</strong>
        </label>
        <p class="hint">
          {#each parts(m.help) as part, i (i)}{#if part.token}<span class="token">{part.text}</span
              >{:else}{part.text}{/if}{/each}
        </p>
      </div>
    {/each}
  </fieldset>
{/if}

<style>
  .modes {
    min-width: 0;
    padding: 0;
    border: 0;
  }

  legend {
    margin-bottom: 0.65rem;
    padding: 0;
    font-size: var(--text-small);
    font-weight: 600;
  }

  label {
    display: flex;
    align-items: center;
    cursor: pointer;
    font-size: var(--text-body);
  }

  .option + .option {
    margin-top: 1rem;
  }

  .option p {
    margin: 0.1rem 0 0 1.7rem;
    color: var(--muted);
    font-size: var(--text-small);
    line-height: 1.5;
  }

  .compact-mode {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: var(--text-small);
    font-weight: 600;
  }

  .compact-mode select {
    width: auto;
    font-weight: 400;
  }

  input[type="radio"] {
    width: 1.1rem;
    height: 1.1rem;
    margin-right: 0.5rem;
    flex: none;
  }
</style>
