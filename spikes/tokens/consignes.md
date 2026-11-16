# S2 — Consignes pour l'expérience LLM (à lire par Nico)

Objectif : savoir quel format de jeton (A `PERSONNE_001`, B `[PERSONNE_1]`, C `⟦P1⟧`) les LLM recopient le plus fidèlement. Tu colles des textes pseudonymisés dans 2 ou 3 LLM, tu sauvegardes leurs réponses telles quelles, puis `score.mjs` calcule les taux. **Aucun appel LLM n'est fait par le dépôt.** Les textes sont entièrement synthétiques (noms, courriels, numéros inventés) : tu peux les coller sans risque.

Durée : environ une heure par LLM pour le lot 1 (30 essais).

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

- **Lot 1, obligatoire : 30 essais.** 5 textes × 3 formats × 2 consignes `traduire` et `reformuler`. La traduction est le cas le plus dur (le LLM est tenté de traduire le mot PERSONNE) ; la reformulation est le cas le plus ordinaire. Les deux sont « complètes », donc mesurables sans ambiguïté. C'est ce lot qui décide.
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
