# Contribuer à Lessive

Merci de l'intérêt porté au projet. Lessive est maintenu bénévolement : les revues peuvent prendre quelques jours. Avant de commencer, lisez [ARCHITECTURE.md](ARCHITECTURE.md) pour la vue d'ensemble et les principes ci-dessous. Pour une idée de fonctionnalité ou un changement important, ouvrez d'abord un ticket pour en discuter. Le dépôt est sous licence Apache 2.0 ; vos contributions le seront aussi.

Les contributions préparées avec un agent de développement sont bienvenues ; [CLAUDE.md](CLAUDE.md) résume pour eux les principes et les pièges connus. Vous restez responsable de ce que vous proposez.

## Prérequis

- [Node.js](https://nodejs.org/) 22 ou plus récent (`engines` de `package.json`).
- Un navigateur récent pour essayer l'interface ; Chrome ou Chromium pour les tests de bout en bout.
- Aucun modèle n'est nécessaire pour développer. Pour travailler sur la reconnaissance des noms, déposez un modèle dans `models/` (voir [models/README.md](models/README.md) et le [README](README.md)) ; les tests qui en ont besoin sont sautés en son absence.

## Commandes

```bash
ONNXRUNTIME_NODE_INSTALL=skip npm ci   # installation (le préfixe évite un téléchargement inutile de binaires)
npm run dev                            # interface en développement
npm test                               # tests unitaires (Vitest)
npm run lint                           # ESLint et Prettier
npm run format                         # corrige la mise en forme
npm run typecheck                      # tsc et svelte-check
npm run build                          # site statique dans dist/
npm run test:e2e                       # confidentialité de bout en bout (Chrome)
```

Une contribution est prête quand `npm run lint`, `npm run typecheck` et `npm test` passent. L'intégration continue (`.github/workflows/ci.yml`) les lance, avec le build.

Outils de mesure, sans dépendance, lancés avec `node --experimental-transform-types --disable-warning=ExperimentalWarning` : `scripts/eval/evaluate.ts` (qualité du NER, voir [docs/evaluation-ner.md](docs/evaluation-ner.md)) et `scripts/perf/measure.ts` (performances, voir [docs/performances.md](docs/performances.md)).

## Principes du projet

Ces douze principes sont numérotés : le code, les tests et la documentation y renvoient (« R5 »). Un changement qui en viole un est refusé.

| # | En bref |
|---|---|
| R1 | Aucune requête réseau à l'exécution hors des fichiers de l'application, depuis sa propre origine. La CSP de `src/web/index.html` (`default-src 'self'; connect-src 'self'; script-src 'self' 'wasm-unsafe-eval'`…) ne s'élargit pas. |
| R2 | Ni LLM, ni modèle génératif, ni API distante, ni télémétrie. |
| R3 | `src/core` est du TypeScript pur : ni DOM, ni Node, ni import de `src/ner` ou `src/web`. ESLint le vérifie. |
| R4 | Les modèles NER ne se chargent que depuis des fichiers locaux. |
| R5 | Le texte original et la table de correspondance ne vont jamais dans `localStorage`, IndexedDB, les journaux, les messages d'erreur ou les rapports, hors export chiffré demandé. |
| R6 | L'interface ne dit jamais « anonymisé » ni « anonymisation ». Les modes sont **Masquage** et **Pseudonymisation**. Aucune documentation ne promet l'anonymat. |
| R7 | Les positions sont des indices UTF-16 sur le texte original non modifié. Toute normalisation se fait sur une copie avec table de correspondance des positions. |
| R8 | Les packs sont des données JSON, sans code ; validateurs référencés par nom dans une liste fermée. |
| R9 | Dépendances à l'exécution : Svelte, `@huggingface/transformers`, Zod. Toute autre dépendance se justifie (licence compatible Apache 2.0, version verrouillée) et exige l'accord du mainteneur. |
| R10 | Chaque changement livre ses tests, avec des données **synthétiques uniquement**. |
| R11 | Les contrats publics de `src/core/types` ne changent que dans un changement dont c'est l'objet, annoncé et discuté dans un ticket : ils figurent dans les exports chiffrés et dans l'API du moteur. |
| R12 | Interface en Svelte 5 avec les runes (`$state`, `$derived`, `$props`, `$effect`) ; ni `export let`, ni `$:`, ni stores pour l'état local ; pas de SvelteKit. |

## Conventions

- TypeScript `strict`, modules ES, pas de `any` sans commentaire justificatif ; pas de `console.log` dans `src/` hors tests.
- Tests à côté du code : `foo.ts` donne `foo.test.ts`.
- Code et identifiants en anglais ; documentation, messages d'interface et commentaires de haut niveau en français.
- Mise en forme : Prettier (largeur 100), appliquée par `npm run format` ; les fichiers Markdown ne sont pas reformatés.
- Ne touchez qu'à ce que votre changement exige, et n'ajoutez pas de fonctionnalité hors sujet.

## Tests obligatoires

- **Tout code** : tests unitaires voisins (Vitest). Un bogue corrigé reçoit un test qui l'aurait attrapé.
- **Un pack** : `tests/cases.json` (positifs, pièges, séparateurs insécables), `tests/cross.json` si un autre pack peut être concerné, README du pack. Le banc commun `packs/_tools/packs.test.ts` impose en plus le contrôle ReDoS (statique et durée) et active tous les packs ensemble. Voir [docs/creer-un-pack.md](docs/creer-un-pack.md).
- **Un validateur** : valeurs valides et invalides, sources citées en en-tête.
- **Le NER** : ne change pas sans nouvelle mesure avec `scripts/eval/evaluate.ts`, reportée dans `docs/evaluation-ner.md`.
- **Confidentialité** : un changement qui touche au réseau, au stockage, au worker, au service worker ou à la CSP passe par `npm run test:e2e` ([docs/confidentialite.md](docs/confidentialite.md)). Sans Chrome, ces tests sont sautés : ce n'est pas un succès, dites-le dans la revue.
- **Un critère impossible à atteindre ou un test qui échoue** se signale clairement ; on ne le contourne pas.

## Données synthétiques (R10)

Aucun test, corpus, exemple de documentation ou capture ne contient de données personnelles réelles, même modifiées d'un caractère.

- Fabriquez des noms, courriels (`@example.org`), numéros et dates. Calculez les clés de contrôle (Luhn, EAN-13, modulo 97…) plutôt que de reprendre un vrai numéro.
- Reprenez de préférence les valeurs d'essai publiées par les sources officielles (IBAN d'exemple du registre IBAN, cartes d'essai des prestataires de paiement).
- Un nom de famille courant fait partie des dictionnaires livrés : pour un test qui doit prouver qu'une valeur ne fuit pas, inventez un nom absent des listes.
- Un texte réel qui a fait échouer Lessive se décrit par sa forme, jamais par son contenu : réécrivez un exemple équivalent.

## Dépendances et licences

- Ajouter une dépendance à l'exécution demande l'accord préalable du mainteneur (R9). Outils de développement : justifiez-les dans la description.
- Les données tierces (listes, motifs) ont une licence compatible avec Apache 2.0 et s'inscrivent dans [NOTICE](NOTICE). Écartez les licences à partage à l'identique et non commerciales.
- Les motifs repris d'un autre projet se déclarent dans `NOTICE`, avec leur licence.

## Commits et branches

- Une branche par sujet ; ne poussez pas directement sur `main`.
- Messages de commit en français, à l'impératif, sur une première ligne courte qui dit ce qui change et pourquoi ; référencez le ticket concerné (`#12`) quand il existe. Un commit = un changement cohérent, avec ses tests.
- Notez dans [CHANGELOG.md](CHANGELOG.md), section « Non publié », tout changement visible par l'utilisateur.
- Mentionnez dans le message ou la description les décisions prises et les questions ouvertes.
- Ne commitez ni modèle (`models/` n'est pas versionné), ni donnée réelle, ni fichier généré (`dist/`).

## Publier une version

1. Déplacer les entrées de « Non publié » de [CHANGELOG.md](CHANGELOG.md) sous un nouveau titre `## [X.Y.Z] — AAAA-MM-JJ`, et mettre à jour les liens de comparaison en bas du fichier.
2. Porter la même version dans `package.json`, `package-lock.json` et `ENGINE_VERSION` (`src/core/index.ts`).
3. Pousser sur `main` : le workflow `release.yml` crée l'étiquette `vX.Y.Z` et la page de version, avec les notes du CHANGELOG ; `pages.yml` publie le site.

## Signaler un bogue ou proposer une idée

Ouvrez un ticket avec le modèle proposé. Pour une détection manquée ou erronée, décrivez la **forme** du texte (« un numéro AVS écrit sans points après « n° » ») et donnez un exemple **inventé** : jamais le texte réel.

## Revue

Une demande de fusion doit :

1. passer `npm run lint`, `npm run typecheck` et `npm test` (et `npm run test:e2e` si elle touche à la confidentialité) ;
2. décrire ce qui a été fait, ce qui ne l'a pas été, les décisions prises et les questions ouvertes ;
3. ne contenir aucune affirmation de documentation qui dépasse le code : la documentation ne décrit que des fonctionnalités qui existent ;
4. respecter R6 : relisez le texte pour la promesse d'anonymat, dans l'interface comme dans la documentation.

Le relecteur vérifie en particulier : les frontières R3, l'absence de requête et d'écriture de stockage nouvelles, les messages d'erreur (aucune valeur du texte), les tests des cas limites (accents, emojis, paires de substitution), et, pour un pack, les sources et la licence des données.

Pour une vulnérabilité, ne passez pas par un ticket public : voir [SECURITY.md](SECURITY.md).
