<!-- Reconnaissance des noms (NER) (T5.7). Le modèle est chargé par l'utilisateur : voir SettingsModel.svelte (ADR 0003). -->
<script lang="ts">
  import { app } from "../state.svelte.ts";
  import SettingsModel from "./SettingsModel.svelte";
</script>

<div class="field">
  <label>
    <input
      type="checkbox"
      checked={app.ner}
      aria-describedby="settings-ner-help"
      onchange={(e) => app.setNer(e.currentTarget.checked)}
    />
    <strong>Reconnaître les noms de personnes, lieux et organisations (NER)</strong>
  </label>
  <p id="settings-ner-help" class="hint">
    Utilise un modèle de reconnaissance de noms : celui fourni par ce site quand il en propose un,
    ou un modèle que vous chargez vous-même depuis votre ordinateur. Il est conservé une fois pour
    toutes dans ce navigateur. Tout reste local : le modèle s'exécute dans ce navigateur et votre
    texte n'est envoyé nulle part.
  </p>
  <SettingsModel />
</div>

<style>
  input[type="checkbox"] {
    width: 1.1rem;
    height: 1.1rem;
    margin-right: 0.5rem;
  }
</style>
