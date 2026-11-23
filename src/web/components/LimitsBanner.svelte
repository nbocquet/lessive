<!--
  Avertissement permanent (R6) : toujours visible, dans l'en-tête de la page (#38).
  Ne pas le masquer, le replier ni le reformuler.
-->
<p class="limits" role="note">
  <strong>Lessive réduit le risque mais ne garantit pas l'anonymat : relisez le résultat.</strong>
</p>

<style>
  .limits {
    margin: 0 0 0 auto;
    padding: 0.25rem 0.75rem;
    border: 1px solid color-mix(in srgb, var(--warn-border) 60%, transparent);
    border-radius: var(--radius);
    background: var(--warn-bg);
    color: var(--warn-text);
    font-size: var(--text-meta);
    line-height: 1.5;
  }

  /* Étroit : l'avertissement passe sous la marque, sur toute la largeur. */
  @media (max-width: 54rem) {
    .limits {
      flex-basis: 100%;
      margin: 0.25rem 0 0;
    }
  }

  strong {
    font-weight: 500;
  }
</style>
