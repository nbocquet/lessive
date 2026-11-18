# Résultats S2 — robustesse des jetons de pseudonymisation

Généré le 2026-11-18 par `score.mjs`. 30 réponse(s), 3 LLM.

- **Strict** : le jeton canonique apparaît à l'identique (frontières de mots respectées).
- **Tolérant** : le jeton est retrouvé par l'analyseur (casse, séparateur, zéros, crochets, type traduit, possessif…).
- **Inconnus** : formes qui ressemblent à un jeton mais ne sont pas dans la table du texte (ex. `PERSONNE_009`).
- Les taux sont des **moyennes pondérées** : jetons distincts retrouvés / jetons distincts attendus, sommés sur les réponses.

## 1. Critère de décision (≥ 98 % en tolérant)

Réponses aux consignes **complètes** (traduire, reformuler) avec consigne système. Un format est retenu s'il atteint le seuil pour **chaque** LLM testé.

| LLM | Format | Réponses | Jetons attendus | Strict | Tolérant | Inconnus | ≥ 98 % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| claude | A | 10 | 78 | 100,0 % | 100,0 % | 0 | oui |
| claude | B | 0 | 0 | — | — | 0 | pas de données |
| claude | C | 0 | 0 | — | — | 0 | pas de données |
| gemini | A | 10 | 78 | 100,0 % | 100,0 % | 0 | oui |
| gemini | B | 0 | 0 | — | — | 0 | pas de données |
| gemini | C | 0 | 0 | — | — | 0 | pas de données |
| gpt | A | 10 | 78 | 100,0 % | 100,0 % | 0 | oui |
| gpt | B | 0 | 0 | — | — | 0 | pas de données |
| gpt | C | 0 | 0 | — | — | 0 | pas de données |

**Formats atteignant le seuil pour tous les LLM testés : A.**

Rappel : avec 7 à 8 jetons par texte, un seul jeton manquant coûte 12 à 14 points sur une réponse isolée et environ 1,3 point sur le lot 1 complet (78 jetons) ; lire ces taux avec le nombre de réponses (colonne « Réponses »).

## 2. Détail par LLM, format et consigne

Les consignes « partielles » (résumer, répondre, extraire) peuvent omettre des jetons sans erreur du LLM : taux **indicatifs**. L'essai témoin (`traduire-sans`) n'a pas de consigne système.

| LLM | Consigne | Type | Format | Réponses | Attendus | Strict | Tolérant | Inconnus |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| claude | traduire | complète | A | 5 | 39 | 100,0 % | 100,0 % | 0 |
| claude | reformuler | complète | A | 5 | 39 | 100,0 % | 100,0 % | 0 |
| gemini | traduire | complète | A | 5 | 39 | 100,0 % | 100,0 % | 0 |
| gemini | reformuler | complète | A | 5 | 39 | 100,0 % | 100,0 % | 0 |
| gpt | traduire | complète | A | 5 | 39 | 100,0 % | 100,0 % | 0 |
| gpt | reformuler | complète | A | 5 | 39 | 100,0 % | 100,0 % | 0 |

## 3. Déformations observées (jetons retrouvés grâce à la tolérance)

| LLM | Format | Variantes (nombre d'occurrences) |
| --- | --- | --- |
| claude | A | possessive ×3 |
| gemini | A | possessive ×3 |
| gpt | A | possessive ×4 |

## 4. Couverture du plan d'essais

| LLM | Lot 1 | Lot 2 | Lot 3 | Lot court | Lot court-B |
| --- | --- | --- | --- | --- | --- |
| claude | 10/30 | 0/18 | 0/6 | 10/10 | 0/10 |
| gemini | 10/30 | 0/18 | 0/6 | 10/10 | 0/10 |
| gpt | 10/30 | 0/18 | 0/6 | 10/10 | 0/10 |

## 5. Détail par réponse

| Fichier | Strict | Tolérant | Inconnus | Jetons non retrouvés |
| --- | --- | --- | --- | --- |
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
| gemini/client-A-reformuler.txt | 8/8 | 8/8 | 0 | — |
| gemini/client-A-traduire.txt | 8/8 | 8/8 | 0 | — |
| gemini/copro-A-reformuler.txt | 8/8 | 8/8 | 0 | — |
| gemini/copro-A-traduire.txt | 8/8 | 8/8 | 0 | — |
| gemini/medical-A-reformuler.txt | 8/8 | 8/8 | 0 | — |
| gemini/medical-A-traduire.txt | 8/8 | 8/8 | 0 | — |
| gemini/reunion-A-reformuler.txt | 7/7 | 7/7 | 0 | — |
| gemini/reunion-A-traduire.txt | 7/7 | 7/7 | 0 | — |
| gemini/rh-A-reformuler.txt | 8/8 | 8/8 | 0 | — |
| gemini/rh-A-traduire.txt | 8/8 | 8/8 | 0 | — |
| gpt/client-A-reformuler.txt | 8/8 | 8/8 | 0 | — |
| gpt/client-A-traduire.txt | 8/8 | 8/8 | 0 | — |
| gpt/copro-A-reformuler.txt | 8/8 | 8/8 | 0 | — |
| gpt/copro-A-traduire.txt | 8/8 | 8/8 | 0 | — |
| gpt/medical-A-reformuler.txt | 8/8 | 8/8 | 0 | — |
| gpt/medical-A-traduire.txt | 8/8 | 8/8 | 0 | — |
| gpt/reunion-A-reformuler.txt | 7/7 | 7/7 | 0 | — |
| gpt/reunion-A-traduire.txt | 7/7 | 7/7 | 0 | — |
| gpt/rh-A-reformuler.txt | 8/8 | 8/8 | 0 | — |
| gpt/rh-A-traduire.txt | 8/8 | 8/8 | 0 | — |
