<!-- Packs livrés et règles (T5.7) : activation par pack et par règle. -->
<script lang="ts">
  import { app } from "../state.svelte.ts";
  import { formatScore, summarizePacks } from "./SettingsSummary.ts";

  const packs = $derived(summarizePacks(app.registry, app));
</script>

<h3 id="settings-packs-title">Packs de règles</h3>
<ul class="packs" aria-labelledby="settings-packs-title">
  {#each packs as pack (pack.id)}
    <li>
      <div class="head">
        <label>
          <input
            type="checkbox"
            checked={pack.enabled}
            onchange={(e) => app.setPackEnabled(pack.id, e.currentTarget.checked)}
          />
          <strong>{pack.name}</strong>
        </label>
        <span class="hint">
          version {pack.version} — {pack.activeRuleCount} / {pack.ruleCount}
          {pack.ruleCount === 1 ? "règle active" : "règles actives"}
        </span>
      </div>
      {#if pack.description}<p class="hint desc">{pack.description}</p>{/if}
      <details>
        <summary>Règles du pack ({pack.ruleCount})</summary>
        <div class="table-wrap">
          <table>
            <caption class="visually-hidden">Règles du pack {pack.name}</caption>
            <thead>
              <tr>
                <th scope="col">Active</th>
                <th scope="col">Identifiant</th>
                <th scope="col">Catégorie</th>
                <th scope="col">Description</th>
                <th scope="col">Score de base</th>
                <th scope="col">Validateur</th>
                <th scope="col">Contexte requis</th>
              </tr>
            </thead>
            <tbody>
              {#each pack.rules as rule (rule.globalId)}
                <tr>
                  <td>
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      disabled={!pack.enabled}
                      aria-label={`Activer la règle ${rule.id}`}
                      onchange={(e) => app.setRuleEnabled(rule.globalId, e.currentTarget.checked)}
                    />
                  </td>
                  <td><code>{rule.id}</code></td>
                  <td>{rule.category}</td>
                  <td>{rule.description || "—"}</td>
                  <td>{formatScore(rule.score)}</td>
                  <td>{rule.validator ?? "—"}</td>
                  <td>{rule.contextRequired ? "oui" : "non"}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </details>
    </li>
  {/each}
</ul>

<style>
  .packs {
    display: grid;
    gap: 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    padding: 0.5rem 0.75rem;
    border: 2px solid var(--border);
    border-radius: var(--radius);
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 1rem;
  }

  .desc {
    margin: 0.25rem 0;
  }

  .table-wrap {
    overflow-x: auto;
  }

  table {
    border-collapse: collapse;
    width: 100%;
    font-size: var(--text-small);
  }

  th,
  td {
    padding: 0.25rem 0.5rem;
    border-bottom: 1px solid var(--border);
    text-align: left;
    vertical-align: top;
  }

  input[type="checkbox"] {
    width: 1.1rem;
    height: 1.1rem;
    margin-right: 0.5rem;
  }
</style>
