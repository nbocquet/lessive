<!--
  Indicateur « prêt hors ligne » (T6.2) : lit l'état du service worker exposé par offline.ts.
  Rien n'est affiché en développement ou si le navigateur ne prend pas en charge le hors-ligne.
-->
<script lang="ts">
  import { getOfflineState, subscribeOffline, type OfflineState } from "../offline.ts";

  let offline = $state<OfflineState>(getOfflineState());

  $effect(() => subscribeOffline((s) => (offline = s)));

  const label = $derived.by(() => {
    switch (offline.phase) {
      case "ready":
        return "Prêt hors ligne";
      case "installing":
      case "partial":
      case "caching":
        return offline.total > 0
          ? `Préparation du mode hors ligne (${offline.cached}/${offline.total})`
          : "Préparation du mode hors ligne";
      case "error":
        return "Mode hors ligne incomplet : rechargez la page une fois connecté";
      default:
        return "";
    }
  });
</script>

{#if label}
  <span class="offline" class:ready={offline.phase === "ready"} role="status">{label}</span>
{/if}

<style>
  .offline {
    margin-left: 1rem;
  }
  .ready::before {
    content: "● ";
    color: #1a7f37;
  }
</style>
