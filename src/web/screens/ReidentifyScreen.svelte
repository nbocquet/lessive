<!--
  Écran 4 — Réponse du LLM. T5.6 complète ce fichier : zone pour coller la réponse
  (app.setLlmResponse), aperçu des remplacements, jetons inconnus signalés, copie du texte
  réidentifié (app.setReidentified). La logique de réidentification vient de src/core/reidentify.
-->
<script lang="ts">
  import Placeholder from "../components/Placeholder.svelte";
</script>

<section aria-labelledby="h-reidentify">
  <h2 id="h-reidentify">4. Réponse du LLM</h2>
  <Placeholder
    task="T5.6"
    description="Coller la réponse du LLM et retrouver les valeurs d'origine."
  />
</section>
