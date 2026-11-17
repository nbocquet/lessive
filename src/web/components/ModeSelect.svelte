<!-- Choix du mode (R6 : « Masquage » et « Pseudonymisation », jamais un autre nom). -->
<script lang="ts">
  import type { Mode } from "../../core/index.ts";
  import { app } from "../state.svelte.ts";

  const modes: { id: Mode; label: string; help: string }[] = [
    {
      id: "masking",
      label: "Masquage",
      help: "Remplacement par un masque ou une catégorie : [PERSONNE]. Les valeurs ne peuvent pas être restituées.",
    },
    {
      id: "pseudonymization",
      label: "Pseudonymisation",
      help: "Remplacement par un pseudonyme stable : PERSONNE_001. Les valeurs peuvent être restituées dans la réponse du LLM.",
    },
  ];
</script>

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
      <p class="hint">{m.help}</p>
    </div>
  {/each}
</fieldset>

<style>
  .modes {
    min-width: 0;
    padding: 0;
    border: 0;
  }

  legend {
    margin-bottom: 0.65rem;
    padding: 0;
    font-size: 0.8rem;
    color: var(--muted);
    font-weight: 500;
  }

  label {
    display: flex;
    align-items: center;
    cursor: pointer;
    font-size: 0.875rem;
  }

  .option + .option {
    margin-top: 1rem;
  }

  .option p {
    margin: 0.1rem 0 0 1.7rem;
    font-size: 0.8rem;
    line-height: 1.6;
  }

  input[type="radio"] {
    width: 1.1rem;
    height: 1.1rem;
    margin-right: 0.5rem;
    flex: none;
  }
</style>
