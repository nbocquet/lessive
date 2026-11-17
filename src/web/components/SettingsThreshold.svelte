<!-- Seuil de détection (T5.7) : curseur 0,1 à 0,9, pas 0,05. -->
<script lang="ts">
  import { app } from "../state.svelte.ts";
  import { formatScore } from "./SettingsSummary.ts";
</script>

<div class="field">
  <label for="settings-min-score"><strong>Seuil de détection</strong></label>
  <div class="row">
    <input
      id="settings-min-score"
      type="range"
      min="0.1"
      max="0.9"
      step="0.05"
      value={app.minScore}
      aria-describedby="settings-min-score-help"
      oninput={(e) => app.setMinScore(Number(e.currentTarget.value))}
    />
    <output for="settings-min-score">{formatScore(app.minScore)}</output>
  </div>
  <p id="settings-min-score-help" class="hint">
    Les détections dont le score est inférieur au seuil sont écartées. Ce score n'est pas une
    probabilité : c'est un indice de confiance calculé par les règles, plus élevé quand une valeur
    est validée ou accompagnée d'un mot de contexte. Un seuil bas détecte plus (davantage de faux
    positifs), un seuil haut détecte moins (risque d'oublis).
  </p>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  input[type="range"] {
    flex: 1;
    min-height: 2rem;
  }

  output {
    min-width: 3rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
</style>
