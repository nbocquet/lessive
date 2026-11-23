<!-- Consigne à joindre au prompt (T5.4, mode Pseudonymisation) : affichage et choix de la langue. -->
<script lang="ts">
  import { noticeText, type NoticeLanguage } from "./ResultLogic.ts";

  let { language = $bindable("fr") }: { language: NoticeLanguage } = $props();

  const text = $derived(noticeText(language));
  const languageLabel = $derived(language === "fr" ? "français" : "anglais");
</script>

<!-- Repliée, sous la case « Inclure la consigne pour l'IA » : texte et langue de la consigne. -->
<details class="notice-details">
  <summary>
    <h3 id="h-notice">Voir la consigne</h3>
    <span class="hint">en {languageLabel}</span>
  </summary>
  <section aria-labelledby="h-notice">
    <p class="hint">
      Elle demande à l'assistant de recopier les repères tels quels, ce qui permet de retrouver les
      données dans sa réponse (étape 4).
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
</details>

<style>
  .notice-details {
    margin: -0.25rem 0 0 1.75rem;
    font-size: var(--text-small);
  }

  /* Marqueur natif conservé, comme les autres volets repliables de l'application. */
  summary {
    padding: 0.6rem 0;
    cursor: pointer;
  }

  h3 {
    display: inline;
    margin: 0 0.5rem 0 0;
    font-size: var(--text-small);
    font-weight: 400;
  }

  section {
    padding: 0.5rem 0 0 1.2rem;
  }

  section > p {
    margin: 0;
  }

  .lang {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin: 0.75rem 0;
  }

  blockquote {
    margin: 0;
    padding: 0.6rem 0.9rem;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    background: var(--surface);
    overflow-wrap: anywhere;
  }
</style>
