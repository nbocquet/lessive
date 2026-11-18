# CLAUDE.md — Lessive

Guide pour les agents de développement. Lessive détecte et remplace les données personnelles d'un texte, entièrement dans le navigateur, avant que l'utilisateur ne le colle dans un assistant IA, puis réidentifie localement la réponse.

## À lire avant de modifier le code

1. [CONTRIBUTING.md](CONTRIBUTING.md) : **principes R1 à R12** (non négociables), conventions, tests obligatoires.
2. [ARCHITECTURE.md](ARCHITECTURE.md) : organisation du moteur, où brancher quoi.
3. Les [décisions d'architecture](docs/adr/) qui touchent votre changement.

`docs/historique/` (cahier des charges, plan de construction, recette) est une archive : ne s'en servir que pour comprendre une référence ancienne (« A20 », « T6.3 »).

## Rappels essentiels

- Aucune requête réseau à l'exécution hors de l'origine de l'application ; la CSP de `src/web/index.html` ne s'élargit pas (R1).
- `src/core` : TypeScript pur, ni DOM ni Node (R3). Frontières vérifiées par ESLint.
- Le texte original et la table de correspondance ne vont dans aucun stockage, journal ou message d'erreur (R5).
- Jamais « anonymisé » dans l'interface ni dans la documentation (R6).
- Positions en unités UTF-16 sur le texte original (R7). Packs en JSON, sans code (R8).
- Pas de nouvelle dépendance à l'exécution sans accord du mainteneur (R9). Données de test synthétiques uniquement (R10).
- Ne pas modifier les contrats de `src/core/types` sans demande explicite ; s'arrêter et le signaler (R11).
- Svelte 5 avec les runes uniquement (R12).

## Commandes

```bash
ONNXRUNTIME_NODE_INSTALL=skip npm ci   # installation
npm test                               # tests unitaires (Vitest)
npm run lint                           # ESLint + Prettier
npm run typecheck                      # tsc + svelte-check
npm run test:e2e                       # confidentialité de bout en bout (Chrome)
npm run build                          # site statique dans dist/
```

Un changement est terminé quand `npm run lint`, `npm run typecheck` et `npm test` passent (et `npm run test:e2e` s'il touche au réseau, au stockage, aux workers ou à la CSP). Compte rendu : fait, pas fait, décisions prises, questions ouvertes. Un test qui échoue se signale, il ne se contourne pas.

## Pièges connus

- `npm ci` / `npm install` : préfixer par `ONNXRUNTIME_NODE_INSTALL=skip` (onnxruntime-node télécharge sinon des binaires depuis nuget.org).
- Les modèles NER ne sont pas versionnés : ils se déposent à la main dans `models/` (voir [models/README.md](models/README.md)). Les tests qui en ont besoin sont sautés en leur absence. Dans un environnement sans accès à Hugging Face, ne pas tenter de les télécharger.
- Transformers.js 4.3 : ne pas utiliser `aggregation_strategy` (fusionne les entités non contiguës des modèles IO) ; regrouper les jetons bruts par contiguïté d'`index` et reconstruire les positions (`src/ner/postprocess.ts`).
- Aucune chaîne en forme de secret (jeton Slack, GitHub, Stripe, clé d'API, JWT, clé PEM) en clair dans le dépôt, même fictive : GitHub refuse le push. Dans un JSON de test, écrire le premier caractère en `\uXXXX` (voir `packs/_tools/no-secrets.test.ts`). Une séquence `\uXXXX` tapée dans une commande shell peut devenir le caractère littéral : vérifier les fichiers écrits.
