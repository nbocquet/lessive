# Lessive

Lessive repère les données personnelles d'un texte (noms, courriels, numéros AVS, IBAN…) et les remplace
par des pseudonymes **directement dans votre navigateur**, avant que vous ne colliez le texte dans un
assistant IA. Il remet ensuite les vrais noms dans la réponse, toujours localement.

Aucune donnée ne quitte votre machine : pas de serveur de traitement, pas d'appel à un LLM, pas de
télémétrie.

> **Statut :** en construction. Rien n'est utilisable pour l'instant.

## Ce que Lessive ne fait pas

Remplacer des noms ne rend pas un texte anonyme. Une fonction, un lieu et une date peuvent suffire à
reconnaître quelqu'un. Lessive réduit le risque ; il ne le supprime pas, et vous devez relire le
résultat.

## Développement

```bash
npm ci
npm test
npm run dev
```

Voir `CLAUDE.md`, `PLAN.md` et `SPECIFICATIONS.md`.

## Licence

Apache 2.0. Voir `LICENSE` et `NOTICE`.
