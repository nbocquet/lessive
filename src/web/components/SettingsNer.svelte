<!-- Reconnaissance des noms (NER) (T5.7). Le branchement réel est fait dans ner-provider.ts. -->
<script lang="ts">
  import { app } from "../state.svelte.ts";
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
    Utilise un modèle de reconnaissance de noms d'environ 138 Mo. Il est chargé une seule fois, puis
    mis en cache par le navigateur. Tout reste local : le modèle s'exécute dans ce navigateur et
    votre texte n'est envoyé nulle part.
  </p>
</div>

<style>
  input[type="checkbox"] {
    width: 1.1rem;
    height: 1.1rem;
    margin-right: 0.5rem;
  }
</style>
