# Résultats S2 — robustesse des jetons de pseudonymisation

> **DÉMONSTRATION.** Ce fichier est calculé sur les réponses FACTICES de `reponses/exemple/`, écrites à la main pour tester `score.mjs`. Il ne dit rien des LLM réels. Les vrais résultats vont dans `results.md`.

Généré le 2026-11-16 par `score.mjs`. 3 réponse(s), 1 LLM.

- **Strict** : le jeton canonique apparaît à l'identique (frontières de mots respectées).
- **Tolérant** : le jeton est retrouvé par l'analyseur (casse, séparateur, zéros, crochets, type traduit, possessif…).
- **Inconnus** : formes qui ressemblent à un jeton mais ne sont pas dans la table du texte (ex. `PERSONNE_009`).
- Les taux sont des **moyennes pondérées** : jetons distincts retrouvés / jetons distincts attendus, sommés sur les réponses.

## 1. Critère de décision (≥ 98 % en tolérant)

Réponses aux consignes **complètes** (traduire, reformuler) avec consigne système. Un format est retenu s'il atteint le seuil pour **chaque** LLM testé.

| LLM | Format | Réponses | Jetons attendus | Strict | Tolérant | Inconnus | ≥ 98 % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| exemple | A | 1 | 8 | 50,0 % | 75,0 % | 1 | non |
| exemple | B | 1 | 8 | 75,0 % | 100,0 % | 0 | oui |
| exemple | C | 1 | 8 | 75,0 % | 75,0 % | 1 | non |

**Formats atteignant le seuil pour tous les LLM testés : B.**

Rappel : avec 7 à 8 jetons par texte, un seul jeton manquant coûte 12 à 14 points sur une réponse isolée et environ 1,3 point sur le lot 1 complet (78 jetons) ; lire ces taux avec le nombre de réponses (colonne « Réponses »).

## 2. Détail par LLM, format et consigne

Les consignes « partielles » (résumer, répondre, extraire) peuvent omettre des jetons sans erreur du LLM : taux **indicatifs**. L'essai témoin (`traduire-sans`) n'a pas de consigne système.

| LLM | Consigne | Type | Format | Réponses | Attendus | Strict | Tolérant | Inconnus |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| exemple | traduire | complète | A | 1 | 8 | 50,0 % | 75,0 % | 1 |
| exemple | traduire | complète | C | 1 | 8 | 75,0 % | 75,0 % | 1 |
| exemple | reformuler | complète | B | 1 | 8 | 75,0 % | 100,0 % | 0 |

## 3. Déformations observées (jetons retrouvés grâce à la tolérance)

| LLM | Format | Variantes (nombre d'occurrences) |
| --- | --- | --- |
| exemple | A | translated ×5, possessive ×1, decorated ×1 |
| exemple | B | brackets-missing ×1, case ×1, zeros ×1, escaped-separator ×1, brackets-changed ×1 |
| exemple | C | delimiters-changed ×1, possessive ×1 |

## 4. Couverture du plan d'essais

| LLM | Lot 1 (obligatoire) | Lot 2 | Lot 3 (témoin) |
| --- | --- | --- | --- |
| exemple | 3/30 | 0/18 | 0/6 |

## 5. Détail par réponse

| Fichier | Strict | Tolérant | Inconnus | Jetons non retrouvés |
| --- | --- | --- | --- | --- |
| exemple/rh-A-traduire.txt | 4/8 | 6/8 | 1 | `PERSONNE_004` `TELEPHONE_001` |
| exemple/rh-B-reformuler.txt | 6/8 | 8/8 | 0 | — |
| exemple/rh-C-traduire.txt | 6/8 | 6/8 | 1 | `⟦P4⟧` `⟦L1⟧` |
