# CLAUDE.md — Lessive

Lessive détecte et remplace les données personnelles d'un texte, entièrement dans le navigateur, avant que l'utilisateur ne le colle dans un LLM. Il réidentifie ensuite localement la réponse du LLM.

## À lire avant toute tâche

1. Ce fichier.
2. `PLAN.md` : sections 2 (règles), 3 (décisions techniques), 5 (contrats), puis la tâche qui t'est confiée.
3. `SPECIFICATIONS.md` : détail fonctionnel. Les amendements v1.1 en tête priment sur le texte v1.0.

En cas de contradiction : ce fichier > `PLAN.md` > `SPECIFICATIONS.md`.

## Règles non négociables

| # | Règle |
|---|---|
| R1 | Aucune requête réseau à l'exécution, hormis le chargement des fichiers statiques de l'application depuis sa propre origine. CSP : `default-src 'self'; connect-src 'self'; script-src 'self' 'wasm-unsafe-eval'`. |
| R2 | Aucun LLM, aucun modèle génératif, aucune API distante, aucune télémétrie. |
| R3 | `src/core` ne dépend ni du DOM ni de Node : TypeScript pur, exécutable dans un worker et, plus tard, dans une CLI. |
| R4 | Les modèles NER sont chargés uniquement depuis les fichiers locaux de l'application (`allowRemoteModels = false`). |
| R5 | Le texte original et la table de correspondance ne vont jamais dans `localStorage`, IndexedDB, les logs, les messages d'erreur ou les rapports, sauf export chiffré demandé par l'utilisateur. |
| R6 | L'interface ne dit jamais « anonymisé ». Les modes s'appellent **Masquage** et **Pseudonymisation**. |
| R7 | Les positions sont des indices en unités de code UTF-16 sur le texte original non modifié. Toute normalisation se fait sur une copie, avec table de correspondance des positions. |
| R8 | Les packs sont des données JSON. Ils ne contiennent jamais de code ; ils référencent les validateurs par leur nom dans une liste fermée. |
| R9 | Toute dépendance ajoutée est justifiée, sous licence compatible Apache 2.0, version verrouillée. Budget à l'exécution : Svelte, `@huggingface/transformers`, Zod. Rien d'autre sans accord de Nico. |
| R10 | Chaque tâche livre ses tests. Aucun test ne contient de données personnelles réelles : uniquement des données synthétiques. |
| R11 | Ne modifie pas les contrats publics de `src/core/types` sans une tâche qui le demande. Si c'est nécessaire, arrête-toi et signale-le. |
| R12 | Interface en Svelte 5 uniquement, syntaxe des runes (`$state`, `$derived`, `$props`, `$effect`). L'ancienne syntaxe (`export let`, `$:`, stores pour l'état local) est interdite. Pas de SvelteKit. |

## Structure

```text
src/core/    moteur, TypeScript pur (types, validators, recognizers, registry,
             analyzer, transform, mapping, crypto)
src/ner/     adaptateur NER (Transformers.js) derrière l'interface NerEngine
src/web/     interface Svelte, workers, service worker
packs/       packs JSON livrés (global, country-ch, country-fr, lang-fr-en)
corpus/      corpus synthétiques d'évaluation
spikes/      prototypes jetables, hors build et hors lint strict
docs/adr/    décisions d'architecture
models/      modèles NER locaux (non versionnés, voir models/README.md)
```

Frontières imposées par ESLint : `src/core` n'importe ni `src/ner` ni `src/web` ; `src/ner` n'importe pas `src/web`.

## Commandes

```bash
npm ci              # installation
npm test            # tests unitaires (Vitest)
npm run lint        # ESLint + Prettier
npm run typecheck   # tsc + svelte-check
npm run dev         # interface en développement
npm run build       # build statique dans dist/
```

Une tâche est terminée quand `npm run lint`, `npm run typecheck` et `npm test` passent.

## Conventions

- TypeScript `strict`, modules ES, pas de `any` sans commentaire justificatif.
- Tests à côté du code : `foo.ts` → `foo.test.ts`.
- Code et identifiants en anglais ; documentation, messages d'interface et commentaires de haut niveau en français.
- Pas de `console.log` dans `src/` hors tests.
- Ne touche qu'aux dossiers de ta tâche. N'ajoute aucune fonctionnalité hors de ta tâche.
- Si un critère n'est pas atteignable ou qu'un test échoue, dis-le clairement au lieu de le contourner.
- Compte rendu de fin de tâche : fait, pas fait, décisions prises, questions ouvertes.

## Environnement des agents

Le réseau passe par une liste blanche : le registre npm et GitHub répondent, Hugging Face non. Ne tente pas de télécharger de modèle ; les modèles sont déposés à la main dans `models/`.

- `npm ci` / `npm install` : préfixer par `ONNXRUNTIME_NODE_INSTALL=skip` (onnxruntime-node tente de télécharger des binaires CUDA depuis nuget.org, bloqué).
- Modèles disponibles pour les tests : `/mnt/user-data/uploads/lessive/models/` (copie de `models/` de Nico), s'il existe. Modèle recommandé : `Xenova/distilbert-base-multilingual-cased-ner-hrl` (ADR 0001).
- Transformers.js 4.3.2 : ne pas utiliser `aggregation_strategy` (fusionne les entités non contiguës des modèles IO) ; regrouper les jetons bruts par contiguïté d'`index` (voir `groupRawTokens` dans `spikes/ner/lib.mjs`). Les positions `start`/`end` ne sont pas fournies : les reconstruire (voir `reconstructSpans`).
- Aucune chaîne en forme de secret (jeton Slack, GitHub, Stripe, clé d'API, JWT, clé PEM) en clair dans le dépôt, même fictive : GitHub refuse le push. Dans un JSON de test, écrire le premier caractère en `\uXXXX` (voir `packs/_tools/no-secrets.test.ts`).
- Piège : une séquence d'échappement `\uXXXX` tapée dans une commande shell peut devenir le caractère littéral ; vérifier les fichiers écrits.
