# AGENTS.md — Lessive

Guide pour les agents de développement (Claude Code, Codex et autres ; `CLAUDE.md` renvoie ici). Lessive détecte et remplace les données personnelles d'un texte, entièrement dans le navigateur, avant que l'utilisateur ne le colle dans un assistant IA, puis réidentifie localement la réponse.

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

## Branches, push et versions

- **Jamais de push direct sur `main`**, ni de `push --force` sur une branche partagée : `main` est protégée (ruleset `.github/rulesets/main.json`). Travailler sur une branche (`agent/<sujet>`, `fix/<sujet>`…), pousser la branche, ouvrir une demande de fusion. La fusion exige les contrôles `check` et `e2e` de la CI au vert.
- Chaque poussée sur `main` publie le site (`pages.yml`) : ne fusionner que ce qui est prêt à être en ligne.
- Une demande de fusion suit `.github/PULL_REQUEST_TEMPLATE.md` ; tout changement visible par l'utilisateur ajoute une ligne à `CHANGELOG.md`, section « Non publié ».
- **Publier une version** (seulement à la demande du mainteneur) :
  1. dans `CHANGELOG.md`, déplacer « Non publié » sous `## [X.Y.Z] — AAAA-MM-JJ` et mettre à jour les liens de comparaison en bas du fichier ;
  2. porter `X.Y.Z` dans `package.json`, `package-lock.json` (deux occurrences : racine et `packages[""]`) et `ENGINE_VERSION` (`src/core/index.ts`) ;
  3. fusionner dans `main` : `release.yml` crée l'étiquette `vX.Y.Z` et la page de version GitHub à partir du CHANGELOG. Ne pas créer d'étiquette ni de version à la main.
- Versionnage sémantique ; en 0.x, signaler dans le CHANGELOG tout changement du format des exports chiffrés ou des repères (`PERSONNE_001`).
- Ne pas modifier les workflows, le ruleset ou `SECURITY.md` sans demande explicite. Les actions GitHub sont épinglées par empreinte (SHA) : garder cette forme.

## Pièges connus

- `npm ci` / `npm install` : préfixer par `ONNXRUNTIME_NODE_INSTALL=skip` (onnxruntime-node télécharge sinon des binaires depuis nuget.org). Les scripts d'installation sont refusés dans `allowScripts` (`package.json`) ; n'en approuver aucun sans accord du mainteneur.
- Les modèles NER ne sont pas versionnés : ils se déposent à la main dans `models/` (voir [models/README.md](models/README.md)). Les tests qui en ont besoin sont sautés en leur absence. Dans un environnement sans accès à Hugging Face, ne pas tenter de les télécharger.
- Transformers.js 4.3 : ne pas utiliser `aggregation_strategy` (fusionne les entités non contiguës des modèles IO) ; regrouper les jetons bruts par contiguïté d'`index` et reconstruire les positions (`src/ner/postprocess.ts`).
- Aucune chaîne en forme de secret (jeton Slack, GitHub, Stripe, clé d'API, JWT, clé PEM) en clair dans le dépôt, même fictive : GitHub refuse le push. Dans un JSON de test, écrire le premier caractère en `\uXXXX` (voir `packs/_tools/no-secrets.test.ts`). Une séquence `\uXXXX` tapée dans une commande shell peut devenir le caractère littéral : vérifier les fichiers écrits.
