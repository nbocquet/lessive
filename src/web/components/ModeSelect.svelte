<!-- Choix du mode (R6 : « Masquage » et « Pseudonymisation », jamais un autre nom). -->
<script lang="ts">
  import type { Mode } from "../../core/index.ts";
  import { app } from "../state.svelte.ts";

  const modes: { id: Mode; label: string; help: string }[] = [
    {
      id: "masking",
      label: "Masquage",
      help: "Remplace chaque donnée par un masque ou une catégorie, par exemple [PERSONNE]. Pas de réidentification.",
    },
    {
      id: "pseudonymization",
      label: "Pseudonymisation",
      help: "Remplace chaque donnée par un jeton stable, par exemple PERSONNE_001, pour retrouver les valeurs dans la réponse du LLM, en local.",
    },
  ];
</script>

<fieldset>
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
  .option + .option {
    margin-top: 0.5rem;
  }

  .option p {
    margin: 0.1rem 0 0 1.7rem;
  }

  input[type="radio"] {
    width: 1.1rem;
    height: 1.1rem;
    margin-right: 0.5rem;
  }
</style>
