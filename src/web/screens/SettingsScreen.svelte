<!--
  Réglages (T5.7), repliés par défaut dans App.svelte : section avancée. Rien n'est persisté (R5) :
  les réglages vivent en mémoire et reviennent aux valeurs par défaut au rechargement.
-->
<script lang="ts">
  import SettingsNer from "../components/SettingsNer.svelte";
  import SettingsPacks from "../components/SettingsPacks.svelte";
  import SettingsThreshold from "../components/SettingsThreshold.svelte";
  import { DEFAULT_MIN_SCORE, app } from "../state.svelte.ts";

  function resetAll(): void {
    app.resetRules();
    app.setMinScore(DEFAULT_MIN_SCORE);
    app.setNer(false);
  }
</script>

<div class="settings-body">
  <p class="hint">
    Réglages avancés. Les réglages ne sont pas enregistrés : ils sont réinitialisés au rechargement
    de la page. Après un changement, relancez l'analyse pour l'appliquer.
  </p>
  <SettingsThreshold />
  <SettingsNer />
  <SettingsPacks />
  <div class="actions">
    <button type="button" onclick={resetAll}>Rétablir les réglages par défaut</button>
  </div>
</div>

<style>
  .settings-body {
    display: grid;
    gap: 1rem;
    margin-top: 0.75rem;
  }

  .actions {
    display: flex;
  }
</style>
