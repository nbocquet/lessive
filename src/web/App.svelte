<script lang="ts">
  import { ENGINE_VERSION } from "../core/index.ts";

  let text = $state("");
  const length = $derived(text.length);
</script>

<main>
  <h1>Lessive</h1>
  <p>Moteur {ENGINE_VERSION} — en construction.</p>
  <label>
    Texte
    <textarea bind:value={text} rows="6"></textarea>
  </label>
  <p>{length} caractères</p>
</main>
