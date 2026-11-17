# S2 — Consignes pour l'expérience LLM

Objectif : vérifier que les LLM recopient fidèlement les pseudonymes du format retenu par défaut, A (`PERSONNE_001`), et sinon tester B (`[PERSONNE_1]`) ou C (`⟦P1⟧`). Si un LLM écrit « Person 1 » au lieu de `PERSONNE_001`, Lessive ne peut plus remettre le vrai nom dans sa réponse. Les textes sont entièrement synthétiques : on peut les envoyer sans risque.

## 0. Version courte, exécutée par un agent (Codex ou autre) — à suivre en priorité

**Règle absolue pour l'agent : ne réponds PAS toi-même aux demandes.** Tu as lu ce dépôt, tu sais que le but est de préserver les jetons : tes réponses seraient biaisées. Chaque essai doit être envoyé au LLM testé par son API, **un appel isolé par essai**, sans historique, avec le message exact construit par `buildPrompt` (`config.mjs`). Le script `run-api.mjs` fait exactement cela ; utilise-le tel quel.

Plan court : **10 essais par LLM** (lot `court` : 5 textes × format A × `traduire` et `reformuler`), sur **2 LLM**.

1. Vérifier le message envoyé, sans rien appeler :
   ```bash
   node spikes/tokens/run-api.mjs --provider openai --dry-run
   ```
2. Exécuter le lot court sur chaque LLM. **Avec une clé OpenRouter (une seule clé pour tous les LLM)** :
   ```bash
   export OPENROUTER_API_KEY=…   # saisie par Nico, ne pas l'écrire dans le dépôt
   node spikes/tokens/run-api.mjs --provider openrouter --model '~openai/gpt-latest'                # → reponses/chatgpt/
   node spikes/tokens/run-api.mjs --provider openrouter --model '~anthropic/claude-sonnet-latest'   # → reponses/claude/
   # facultatif : --model google/<modèle> → reponses/gemini/
   ```
   Identifiants recommandés : les alias d'OpenRouter qui pointent toujours vers la dernière version, `~openai/gpt-latest` et `~anthropic/claude-sonnet-latest` (Gemini facultatif). Le modèle réellement servi est noté dans `_modele.txt`. Sinon, avec les clés de chaque fournisseur (clé dans l'environnement, jamais dans un fichier ni dans une commande enregistrée ; nom exact du modèle, celui qu'utilise le grand public de préférence) :
   ```bash
   export OPENAI_API_KEY=…      # saisie par Nico, ne pas l'écrire dans le dépôt
   node spikes/tokens/run-api.mjs --provider openai --model <modèle>
   export ANTHROPIC_API_KEY=…
   node spikes/tokens/run-api.mjs --provider anthropic --model <modèle>
   # facultatif : export GEMINI_API_KEY=… ; --provider gemini --model <modèle>
   ```
   Les réponses arrivent dans `spikes/tokens/reponses/<llm>/` (`chatgpt`, `claude`, `gemini`), avec `_modele.txt` (fournisseur, modèle, date). Un essai déjà fait est sauté ; `--force` le refait. Ne modifie aucune réponse.
3. Calculer les résultats :
   ```bash
   node spikes/tokens/score.mjs        # écrit spikes/tokens/results.md
   ```
4. Décision, d'après la section 1 de `results.md` (taux **tolérant**, consignes complètes, par LLM) :
   - **A ≥ 98 % pour chaque LLM** : format A retenu. Renseigner la section « Résultats » de `docs/adr/0002-format-jetons.md` (taux par LLM, modèles, date, déformations observées) et passer son statut à « Accepté ».
   - **Sinon** : exécuter le lot `court-B` (`--lot court-B`) sur les mêmes LLM, recalculer, et noter les deux formats dans l'ADR ; ne pas trancher seul entre A et B, laisser la décision à Nico.
5. Ne pas commiter de clé. Commiter les réponses (`reponses/<llm>/`), `results.md` et l'ADR.

Sans accès aux API, la même expérience se fait à la main dans les interfaces de chat (§2 à §6) : une nouvelle conversation par essai, même message, réponse copiée telle quelle.

Les plans plus longs (§7 : lot 1 complet à 30 essais, lots 2 et 3) restent possibles pour approfondir.

## 1. Ce qui est déjà prêt

- `textes/<texte>.<format>.txt` : les 15 textes pseudonymisés à coller. Identifiants de texte : `rh` (courriel RH), `reunion` (compte rendu), `client` (échange avec un client), `medical` (note médicale administrative), `copro` (litige de copropriété). Formats : `A`, `B`, `C`.
- Pour régénérer ces fichiers : `node spikes/tokens/generate.mjs` (inutile sauf si tu modifies les textes sources).
- `node spikes/tokens/score.mjs --plan <llm>` affiche la liste des réponses attendues et coche celles que tu as déjà déposées.

## 2. Règles de passation (importantes pour que la mesure soit propre)

1. **Une nouvelle conversation par essai.** Ne réutilise jamais une conversation : le LLM apprendrait le format.
2. Désactive la mémoire, les instructions personnalisées, la recherche web et tout fichier joint. Utilise toujours le même modèle pour un LLM donné et note-le (voir §6).
3. Colle le message **en un seul bloc** (gabarit ci-dessous), sans rien ajouter.
4. Ne relance pas, ne corrige pas, ne pose pas de question de suivi. Si le LLM refuse ou pose une question, sauvegarde cette réponse telle quelle.
5. Récupère la réponse avec le bouton « Copier » de l'interface (qui donne le markdown brut), et colle-la **sans la modifier** dans le fichier. Ne retire ni les astérisques, ni les barres obliques inverses, ni les guillemets. Ne corrige aucun jeton.
6. Fichiers en UTF-8 (le caractère `⟦` doit survivre à l'enregistrement).

## 3. Gabarit du message à coller

```text
<consigne système du format, voir §5>

<consigne, voir §4>

Texte :
<contenu intégral de textes/<texte>.<format>.txt>
```

Exemple complet pour l'essai `rh-A-traduire` :

```text
Les mots de la forme PERSONNE_001 (par exemple ORGANISATION_002 ou LIEU_003) sont des pseudonymes : recopie-les à l'identique, sans les traduire, les modifier ni les expliquer.

Traduis le texte ci-dessous en anglais.

Texte :
<contenu de spikes/tokens/textes/rh.A.txt>
```

La réponse va dans `spikes/tokens/reponses/chatgpt/rh-A-traduire.txt` (si le LLM est ChatGPT).

## 4. Les consignes

| Identifiant | Consigne à coller (ligne « consigne ») | Type |
|---|---|---|
| `resumer` | Résume le texte ci-dessous en 3 points. | partielle |
| `traduire` | Traduis le texte ci-dessous en anglais. | complète |
| `reformuler` | Reformule le texte ci-dessous sur un ton plus poli et plus formel, en gardant toutes les informations. | complète |
| `repondre` | Rédige une réponse au courriel ci-dessous. | partielle (courriels : `client`, `copro`, `rh`) |
| `extraire` | Extrais du texte ci-dessous la liste des personnes mentionnées et de leurs rôles. | partielle |
| `traduire-sans` | Traduis le texte ci-dessous en anglais. (**sans** la consigne système : supprime la première ligne du gabarit) | témoin |

« Complète » : la consigne exige de garder tout le texte, donc tous les jetons doivent réapparaître. Le critère de décision (≥ 98 %) ne porte que sur ces consignes. « Partielle » : le LLM peut légitimement omettre des jetons (un résumé, une réponse) ; ces essais servent à voir quelles déformations apparaissent, leur taux est indicatif.

## 5. Consigne système à joindre (une par format)

C'est la première ligne du gabarit. Elle est ici collée en tête du message, faute de zone « instructions système » dans une conversation ordinaire. Telle quelle, c'est aussi le texte que l'application proposera à copier.

**Format A** (`PERSONNE_001`) :

```text
Les mots de la forme PERSONNE_001 (par exemple ORGANISATION_002 ou LIEU_003) sont des pseudonymes : recopie-les à l'identique, sans les traduire, les modifier ni les expliquer.
```

**Format B** (`[PERSONNE_1]`) :

```text
Les groupes de la forme [PERSONNE_1] (par exemple [ORGANISATION_2] ou [LIEU_3]) sont des pseudonymes : recopie-les à l'identique, crochets compris, sans les traduire, les modifier ni les expliquer.
```

**Format C** (`⟦P1⟧`) :

```text
Les groupes de la forme ⟦P1⟧ (par exemple ⟦O2⟧ ou ⟦L3⟧) sont des pseudonymes : recopie-les à l'identique, délimiteurs ⟦ et ⟧ compris, sans les traduire, les modifier ni les expliquer.
```

## 6. Où ranger les réponses, comment les nommer

```text
spikes/tokens/reponses/<llm>/<texte>-<format>-<consigne>.txt
```

- `<llm>` : `chatgpt`, `claude`, `gemini` (ou autre nom court, en minuscules, sans espace).
- `<texte>` : `rh`, `reunion`, `client`, `medical`, `copro`.
- `<format>` : `A`, `B` ou `C` (majuscule).
- `<consigne>` : `resumer`, `traduire`, `reformuler`, `repondre`, `extraire`, `traduire-sans`.
- Exemples : `reponses/claude/copro-B-reformuler.txt`, `reponses/gemini/rh-C-traduire.txt`.
- Facultatif : `reponses/<llm>/_modele.txt` avec le nom exact du modèle, la date et l'interface utilisée (les fichiers qui commencent par `_` sont ignorés par le script).
- Un fichier mal nommé est signalé comme « ignoré » dans le rapport, il n'est pas compté.

## 7. Plan d'essais proposé (par LLM)

Pas la combinatoire complète (5 textes × 3 formats × 5 consignes = 75, soit 225 pour 3 LLM). Proposition :

- **Lot court, recommandé : 10 essais** (§0). **Lot 1, approfondi : 30 essais.** 5 textes × 3 formats × 2 consignes `traduire` et `reformuler`. La traduction est le cas le plus dur (le LLM est tenté de traduire le mot PERSONNE) ; la reformulation est le cas le plus ordinaire. Les deux sont « complètes », donc mesurables sans ambiguïté. Le lot court (format A seul) suffit à décider si A atteint 98 % ; le lot 1 compare les trois formats.
- **Lot 2, facultatif : 18 essais.** Textes `client` et `copro` × 3 formats × `resumer`, `repondre`, `extraire`. À faire si le lot 1 est serré, ou pour voir d'autres déformations.
- **Lot 3, témoin facultatif : 6 essais.** Textes `rh` et `medical` × 3 formats × `traduire-sans` (aucune consigne système). Il mesure ce que la consigne système apporte.

Ordre conseillé : lot 1 sur un premier LLM, `node spikes/tokens/score.mjs` pour vérifier que les fichiers sont bien lus, puis le même lot sur les autres LLM, puis les lots facultatifs.

## 8. Après la collecte

```bash
node spikes/tokens/score.mjs              # écrit spikes/tokens/results.md
node spikes/tokens/score.mjs --plan claude   # ce qu'il reste à faire pour un LLM
```

Sans réponse déposée, le script le dit et n'écrit rien. `reponses/exemple/` contient trois réponses factices (voir son `LISEZMOI.txt`) : elles sont ignorées sauf avec `--include-exemple`, qui écrit alors `results.exemple.md`.

Ensuite : lire la section 1 de `results.md`, puis renseigner la section « Résultats » de `docs/adr/0002-format-jetons.md` et passer son statut à « Accepté » (ou « Rejeté ») après la porte G0.
