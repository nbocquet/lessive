<script lang="ts">
  import logo from "../../src/web/public/lessive-mark.svg";

  type Kind = "PERSONNE" | "EMAIL" | "ORGANISATION" | "LIEU";
  type Form = { value: string; active: boolean };
  type Entity = { id: number; kind: Kind; forms: Form[] };
  const sample =
    "Bonjour,\n\nNérine Valombre prépare une rencontre pour l’Atelier des Lucioles. Vous pouvez lui écrire à nerine.valombre@example.org.\n\nNérine souhaite recevoir une proposition de programme pour la rencontre. Merci de rédiger une réponse courte et chaleureuse.";
  const kinds: Kind[] = ["PERSONNE", "EMAIL", "ORGANISATION", "LIEU"];
  const labels = {
    PERSONNE: "Personne",
    EMAIL: "Courriel",
    ORGANISATION: "Organisation",
    LIEU: "Lieu",
  };
  let text = $state(sample);
  let entities = $state<Entity[]>([]);
  let mode = $state("pseudo");
  let reviewed = $state(false);
  let response = $state(
    "Bonjour PERSONNE_001,\n\nVoici une proposition de programme pour ORGANISATION_001 : un accueil, un temps d’échange et une conclusion collective.",
  );
  let message = $state("");
  let selection = $state("");
  let manualKind = $state<Kind>("PERSONNE");
  let input: HTMLTextAreaElement;
  let nextId = 1;

  function invalidate() {
    reviewed = false;
    message = "";
  }
  function detect() {
    invalidate();
    nextId = 1;
    entities = [];
    const add = (kind: Kind, forms: string[]) => {
      const present = forms.filter((value) => text.includes(value));
      if (present.length)
        entities.push({
          id: nextId++,
          kind,
          forms: present.map((value) => ({ value, active: true })),
        });
    };
    add("PERSONNE", ["Nérine Valombre", "Nérine"]);
    add("ORGANISATION", ["Atelier des Lucioles"]);
    add("EMAIL", [...new Set(text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) ?? [])]);
    selection = "";
  }
  detect();

  const tokens = $derived.by(() => {
    const counts = new Map<string, number>();
    return entities.map((e) => {
      const n = (counts.get(e.kind) ?? 0) + 1;
      counts.set(e.kind, n);
      return { ...e, token: `${e.kind}_${String(n).padStart(3, "0")}` };
    });
  });
  const pieces = $derived.by(() => {
    const matches: { start: number; end: number; token: string; value: string }[] = [];
    for (const e of tokens)
      for (const f of e.forms.filter((f) => f.active)) {
        let start = text.indexOf(f.value);
        while (start >= 0) {
          matches.push({ start, end: start + f.value.length, token: e.token, value: f.value });
          start = text.indexOf(f.value, start + f.value.length);
        }
      }
    matches.sort((a, b) => a.start - b.start || b.end - a.end);
    const result: { value: string; token?: string }[] = [];
    let cursor = 0;
    for (const m of matches) {
      if (m.start < cursor) continue;
      if (m.start > cursor) result.push({ value: text.slice(cursor, m.start) });
      result.push({
        value: m.value,
        token: mode === "pseudo" ? m.token : `[${m.token.replace(/_\d+$/, "")}]`,
      });
      cursor = m.end;
    }
    result.push({ value: text.slice(cursor) });
    return result;
  });
  const transformed = $derived(pieces.map((p) => p.token ?? p.value).join(""));
  const occurrences = $derived(pieces.filter((p) => p.token).length);
  const restored = $derived.by(() => {
    const mapping = new Map(tokens.map((e) => [e.token, e.forms.find((f) => f.active)?.value]));
    return response.replace(
      /(?:PERSONNE|EMAIL|ORGANISATION|LIEU)_\d{3}/g,
      (token) => mapping.get(token) ?? token,
    );
  });
  const unknown = $derived(
    [...new Set(response.match(/(?:PERSONNE|EMAIL|ORGANISATION|LIEU)_\d{3}/g) ?? [])].filter(
      (t) => !tokens.some((e) => e.token === t && e.forms.some((f) => f.active)),
    ),
  );

  function addSelection() {
    if (!selection.trim()) return;
    const value = selection;
    if (entities.some((e) => e.forms.some((f) => f.value === value))) {
      message = "Cette forme figure déjà dans la liste.";
      return;
    }
    entities.push({ id: nextId++, kind: manualKind, forms: [{ value, active: true }] });
    selection = "";
    invalidate();
  }
  function split(id: number, value: string) {
    const e = entities.find((e) => e.id === id);
    if (!e || e.forms.length < 2) return;
    const form = e.forms.find((f) => f.value === value)!;
    e.forms = e.forms.filter((f) => f !== form);
    entities.push({ id: nextId++, kind: e.kind, forms: [{ ...form }] });
    invalidate();
  }
  function merge(id: number, target: string) {
    const source = entities.find((e) => e.id === id);
    const destination = entities.find((e) => e.id === Number(target));
    if (!source || !destination || source.kind !== destination.kind) return;
    destination.forms.push(
      ...source.forms.filter((f) => !destination.forms.some((d) => d.value === f.value)),
    );
    entities = entities.filter((e) => e.id !== id);
    invalidate();
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      message = "Texte copié.";
    } catch {
      message = "Copie indisponible. Sélectionnez le texte et copiez-le au clavier.";
    }
  }
</script>

<a class="skip-link" href="#original">Aller au texte</a>
<div class="prototype">Maquette interactive · Proposition pour la #38 · Données fictives</div>
<div class="shell">
  <header class="brand">
    <div class="wordmark">
      <img src={logo} alt="" width="38" height="46" />
      <h1>Lessive</h1>
    </div>
    <p>Votre texte reste dans ce navigateur.</p>
    <button
      onclick={() => {
        text = "";
        response = "";
        detect();
        input.focus();
      }}>Nouvelle session</button
    >
  </header>

  <div class="intro">
    <div>
      <h2>Préparez votre texte pour l’IA</h2>
      <p>Collez, vérifiez, puis copiez. Tout se passe ici.</p>
    </div>
    <button
      onclick={() => {
        text = sample;
        response =
          "Bonjour PERSONNE_001,\n\nVoici une proposition de programme pour ORGANISATION_001 : un accueil, un temps d’échange et une conclusion collective.";
        detect();
      }}>Recharger l’exemple</button
    >
  </div>
  <div class="notice simulation">
    <strong>Détection simulée, sans modèle de noms.</strong> Cette maquette reconnaît les noms de l’exemple
    et les courriels. N’y collez que des données fictives. Dans le parcours proposé, l’avertissement sans
    modèle reste visible.
  </div>

  <nav class="jump" aria-label="Zones de travail">
    <a href="#original">Texte</a><a href="#entities">Vérification</a><a href="#result">Résultat</a
    ><a href="#response">Réponse IA</a>
  </nav>
  <div class="toolbar">
    <label
      >Traitement <select bind:value={mode} onchange={invalidate}
        ><option value="pseudo">Pseudonymisation</option><option value="mask">Masquage</option
        ></select
      ></label
    ><span>Analyse au collage · Résultat mis à jour en direct</span>
  </div>

  <main class="workspace">
    <section id="original" class="pane original" aria-labelledby="original-title">
      <div class="pane-title">
        <h3 id="original-title">Texte original</h3>
        <span class="hint">{text.length} caractères</span>
      </div>
      <p class="help">Modifiez le texte ou sélectionnez une donnée oubliée.</p>
      <label for="source" class="visually-hidden">Texte original fictif</label>
      <textarea
        id="source"
        bind:this={input}
        bind:value={text}
        oninput={detect}
        onselect={() => (selection = text.slice(input.selectionStart, input.selectionEnd))}
        placeholder="Collez ici un texte fictif…"
        spellcheck="false"></textarea>
      <div class="selection-tools">
        <label for="manual-kind">Type de la sélection</label><select
          id="manual-kind"
          bind:value={manualKind}
          >{#each kinds as kind}<option value={kind}>{labels[kind]}</option>{/each}</select
        ><button disabled={!selection.trim()} onclick={addSelection}>Prendre la sélection</button>
      </div>
      <p class="help selection-preview">
        {selection
          ? `Sélection : « ${selection} »`
          : "La sélection permet d’ajouter une donnée à la vérification."}
      </p>
    </section>

    <section id="entities" class="pane entities" aria-labelledby="entities-title">
      <div class="pane-title">
        <h3 id="entities-title">À vérifier</h3>
        <span class="count">{entities.length}</span>
      </div>
      <p class="help">Décochez une forme pour la conserver telle quelle.</p>
      <div class="entity-list">
        {#each tokens as entity (entity.id)}
          <div class="entity">
            <div class="entity-title">
              <span class="token">{entity.token}</span><select
                aria-label={`Type de ${entity.token}`}
                value={entity.kind}
                onchange={(event) => {
                  entities.find((e) => e.id === entity.id)!.kind = event.currentTarget
                    .value as Kind;
                  invalidate();
                }}
                >{#each kinds as kind}<option value={kind}>{labels[kind]}</option>{/each}</select
              >
            </div>
            {#each entity.forms as form}
              <div class="form">
                <label
                  ><input
                    type="checkbox"
                    checked={form.active}
                    onchange={(event) => {
                      entities
                        .find((e) => e.id === entity.id)!
                        .forms.find((f) => f.value === form.value)!.active =
                        event.currentTarget.checked;
                      invalidate();
                    }}
                  /><span>{form.value}</span></label
                >{#if entity.forms.length > 1}<button
                    class="text-button"
                    onclick={() => split(entity.id, form.value)}
                    aria-label={`Séparer ${form.value}`}>Séparer</button
                  >{/if}
              </div>
            {/each}
            {#if tokens.some((e) => e.id !== entity.id && e.kind === entity.kind)}<select
                class="merge"
                aria-label={`Rattacher ${entity.token} à une autre entité`}
                value=""
                onchange={(event) => merge(entity.id, event.currentTarget.value)}
                ><option value="">Rattacher à…</option
                >{#each tokens.filter((e) => e.id !== entity.id && e.kind === entity.kind) as target}<option
                    value={target.id}>{target.token}</option
                  >{/each}</select
              >{/if}
          </div>
        {:else}<p class="empty">
            {text
              ? "Aucune donnée reconnue par la simulation. Ajoutez les passages à traiter depuis le texte."
              : "Les données repérées apparaîtront ici après le collage."}
          </p>{/each}
      </div>
      <p class="review-reminder">Relisez aussi les passages non détectés.</p>
    </section>

    <section id="result" class="pane result" aria-labelledby="result-title">
      <div class="pane-title">
        <h3 id="result-title">Texte à copier</h3>
        <span class="hint">{occurrences} passages traités</span>
      </div>
      <p class="help">Chaque correction se répercute dans cet aperçu.</p>
      <div class="document" role="region" aria-label="Aperçu du texte transformé">
        {#if text}{#each pieces as piece}{#if piece.token}<span class="token">{piece.token}</span
              >{:else}{piece.value}{/if}{/each}{:else}<span class="hint"
            >Le résultat apparaîtra ici.</span
          >{/if}
      </div>
      <div class="copy-area">
        <label class="validation"
          ><input type="checkbox" bind:checked={reviewed} disabled={!text.trim()} /><span
            >J’ai relu le résultat et les passages non détectés.</span
          ></label
        ><button
          class="primary"
          disabled={!reviewed || !text.trim()}
          onclick={() => copy(transformed)}>Copier le texte pour l’IA</button
        >
        <p class="help">Toute modification demande une nouvelle validation.</p>
      </div>
    </section>
  </main>

  <section id="response" class="response-section" aria-labelledby="response-title">
    <div class="response-heading">
      <div>
        <h2 id="response-title">Retrouvez les données dans la réponse</h2>
        <p>Après votre échange avec l’assistant, collez sa réponse ci-dessous.</p>
      </div>
      <span class="hint">Facultatif · Sur cette même page</span>
    </div>
    {#if mode === "pseudo"}
      <div class="response-grid">
        <div>
          <label for="reply">Réponse de l’assistant</label><textarea
            id="reply"
            bind:value={response}
            placeholder="Collez une réponse contenant les repères PERSONNE_001…"></textarea>
        </div>
        <div>
          <div class="restore-title">
            <h3>Réponse réidentifiée</h3>
            <button disabled={!response.trim()} onclick={() => copy(restored)}
              >Copier la réponse</button
            >
          </div>
          <div class="document restored" role="region" aria-label="Réponse réidentifiée">
            {restored || "Les données seront rétablies ici, en direct."}
          </div>
          {#if unknown.length}<p class="notice">
              Repères inconnus, laissés tels quels : {unknown.join(", ")}.
            </p>{/if}
        </div>
      </div>
      <p class="help">
        Les corrections de la table modifient aussi cette réponse. Les repères de cet exemple
        doivent être recopiés à l’identique.
      </p>
    {:else}<p class="notice">
        Le masquage ne permet pas de rétablir les données. Choisissez la pseudonymisation pour
        essayer le retour de l’assistant.
      </p>{/if}
  </section>
  <p class="feedback" role="status">{message}</p>
  <footer>
    <span>Maquette de parcours · Aucun enregistrement des textes</span><span
      >Lessive · Traitement local</span
    >
  </footer>
</div>
