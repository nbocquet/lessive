# Résultats S2 — robustesse des jetons de pseudonymisation

Généré le 2026-11-17 par `score.mjs`. 20 réponse(s), 2 LLM.

- **Strict** : le jeton canonique apparaît à l'identique (frontières de mots respectées).
- **Tolérant** : le jeton est retrouvé par l'analyseur (casse, séparateur, zéros, crochets, type traduit, possessif…).
- **Inconnus** : formes qui ressemblent à un jeton mais ne sont pas dans la table du texte (ex. `PERSONNE_009`).
- Les taux sont des **moyennes pondérées** : jetons distincts retrouvés / jetons distincts attendus, sommés sur les réponses.

## 1. Critère de décision (≥ 98 % en tolérant)

Réponses aux consignes **complètes** (traduire, reformuler) avec consigne système. Un format est retenu s'il atteint le seuil pour **chaque** LLM testé.

| LLM | Format | Réponses | Jetons attendus | Strict | Tolérant | Inconnus | ≥ 98 % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| chatgpt | A | 10 | 78 | 100,0 % | 100,0 % | 0 | oui |
| chatgpt | B | 0 | 0 | — | — | 0 | pas de données |
| chatgpt | C | 0 | 0 | — | — | 0 | pas de données |
| claude | A | 10 | 78 | 100,0 % | 100,0 % | 0 | oui |
| claude | B | 0 | 0 | — | — | 0 | pas de données |
| claude | C | 0 | 0 | — | — | 0 | pas de données |

**Formats atteignant le seuil pour tous les LLM testés : A.**

Rappel : avec 7 à 8 jetons par texte, un seul jeton manquant coûte 12 à 14 points sur une réponse isolée et environ 1,3 point sur le lot 1 complet (78 jetons) ; lire ces taux avec le nombre de réponses (colonne « Réponses »).

## 2. Détail par LLM, format et consigne

Les consignes « partielles » (résumer, répondre, extraire) peuvent omettre des jetons sans erreur du LLM : taux **indicatifs**. L'essai témoin (`traduire-sans`) n'a pas de consigne système.

| LLM | Consigne | Type | Format | Réponses | Attendus | Strict | Tolérant | Inconnus |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| chatgpt | traduire | complète | A | 5 | 39 | 100,0 % | 100,0 % | 0 |
| chatgpt | reformuler | complète | A | 5 | 39 | 100,0 % | 100,0 % | 0 |
| claude | traduire | complète | A | 5 | 39 | 100,0 % | 100,0 % | 0 |
| claude | reformuler | complète | A | 5 | 39 | 100,0 % | 100,0 % | 0 |

## 3. Déformations observées (jetons retrouvés grâce à la tolérance)

| LLM | Format | Variantes (nombre d'occurrences) |
| --- | --- | --- |
| chatgpt | A | possessive ×4 |
| claude | A | possessive ×3 |

## 4. Couverture du plan d'essais

| LLM | Lot 1 | Lot 2 | Lot 3 | Lot court | Lot court-B |
| --- | --- | --- | --- | --- | --- |
| chatgpt | 10/30 | 0/18 | 0/6 | 10/10 | 0/10 |
| claude | 10/30 | 0/18 | 0/6 | 10/10 | 0/10 |

## 5. Détail par réponse

| Fichier | Strict | Tolérant | Inconnus | Jetons non retrouvés |
| --- | --- | --- | --- | --- |
| chatgpt/client-A-reformuler.txt | 8/8 | 8/8 | 0 | — |
| chatgpt/client-A-traduire.txt | 8/8 | 8/8 | 0 | — |
| chatgpt/copro-A-reformuler.txt | 8/8 | 8/8 | 0 | — |
| chatgpt/copro-A-traduire.txt | 8/8 | 8/8 | 0 | — |
| chatgpt/medical-A-reformuler.txt | 8/8 | 8/8 | 0 | — |
| chatgpt/medical-A-traduire.txt | 8/8 | 8/8 | 0 | — |
| chatgpt/reunion-A-reformuler.txt | 7/7 | 7/7 | 0 | — |
| chatgpt/reunion-A-traduire.txt | 7/7 | 7/7 | 0 | — |
| chatgpt/rh-A-reformuler.txt | 8/8 | 8/8 | 0 | — |
| chatgpt/rh-A-traduire.txt | 8/8 | 8/8 | 0 | — |
| claude/client-A-reformuler.txt | 8/8 | 8/8 | 0 | — |
| claude/client-A-traduire.txt | 8/8 | 8/8 | 0 | — |
| claude/copro-A-reformuler.txt | 8/8 | 8/8 | 0 | — |
| claude/copro-A-traduire.txt | 8/8 | 8/8 | 0 | — |
| claude/medical-A-reformuler.txt | 8/8 | 8/8 | 0 | — |
| claude/medical-A-traduire.txt | 8/8 | 8/8 | 0 | — |
| claude/reunion-A-reformuler.txt | 7/7 | 7/7 | 0 | — |
| claude/reunion-A-traduire.txt | 7/7 | 7/7 | 0 | — |
| claude/rh-A-reformuler.txt | 8/8 | 8/8 | 0 | — |
| claude/rh-A-traduire.txt | 8/8 | 8/8 | 0 | — |
