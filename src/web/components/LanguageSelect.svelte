<script lang="ts">
  import { app, type LanguageChoice } from "../state.svelte.ts";

  const id = "language-select";
  const choices: { value: LanguageChoice; label: string }[] = [
    { value: "auto", label: "Automatique (toutes les langues)" },
    { value: "fr", label: "Français" },
    { value: "en", label: "Anglais" },
  ];
</script>

<div>
  <label for={id}><strong>Langue du texte</strong></label>
  <select
    {id}
    value={app.language}
    onchange={(e) => app.setLanguage(e.currentTarget.value as LanguageChoice)}
  >
    {#each choices as c (c.value)}
      <option value={c.value}>{c.label}</option>
    {/each}
  </select>
</div>
