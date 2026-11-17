<!-- Consigne à joindre au prompt (T5.4, mode Pseudonymisation) : affichage et choix de la langue. -->
<script lang="ts">
  import { noticeText, type NoticeLanguage } from "./ResultLogic.ts";

  let { language = $bindable("fr") }: { language: NoticeLanguage } = $props();

  const text = $derived(noticeText(language));
</script>

<section aria-labelledby="h-notice">
  <h3 id="h-notice">Consigne pour l'IA</h3>
  <p class="hint">
    Elle demande au LLM de recopier les pseudonymes tels quels, ce qui permet de réidentifier sa
    réponse. Utilisez « Copier avec la consigne pour l'IA » pour la joindre au texte.
  </p>
  <fieldset class="lang">
    <legend>Langue de la consigne</legend>
    <label>
      <input type="radio" name="notice-lang" value="fr" bind:group={language} /> Français
    </label>
    <label>
      <input type="radio" name="notice-lang" value="en" bind:group={language} /> English
    </label>
  </fieldset>
  <blockquote lang={language}>{text}</blockquote>
</section>

<style>
  h3 {
    margin: 0 0 0.25rem;
    font-size: 1rem;
  }

  .lang {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin: 0.5rem 0;
  }

  blockquote {
    margin: 0;
    padding: 0.6rem 0.9rem;
    border-left: 4px solid var(--accent);
    background: var(--surface);
    overflow-wrap: anywhere;
  }
</style>
