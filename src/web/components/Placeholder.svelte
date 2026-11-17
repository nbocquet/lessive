<!-- Emplacement « à venir » : à supprimer par la tâche indiquée quand le contenu réel arrive. -->
<script lang="ts">
  let { task, description }: { task: string; description: string } = $props();
</script>

<div class="placeholder" role="note">
  <p><strong>À venir ({task})</strong></p>
  <p class="hint">{description}</p>
</div>

<style>
  .placeholder {
    padding: 0.5rem 1rem;
    border: 2px dashed var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }

  p {
    margin: 0.25rem 0;
  }
</style>
