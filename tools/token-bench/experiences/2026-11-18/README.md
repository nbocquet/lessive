# Expérience OpenRouter du 18 novembre 2026

Synthèse et limites : [docs/essais-openrouter-2026-11-18.md](../../../../docs/essais-openrouter-2026-11-18.md).

- `reponses/{gpt,claude,gemini}/` : réponses brutes des trente essais complets ; `_modele.txt` identifie le modèle demandé/servi.
- `repères.md` : rapport du calculateur existant, uniquement sur ces réponses finales.
- `mails-*.json` et `mails-*.raw.txt` : neuf mails et leurs annotations générées, entièrement fictifs ; sorties brutes conservées.
- `generation-prompt.txt` : prompt identique envoyé aux trois modèles pour générer les mails.
- `detection-results.json` : détection locale des noms complets, avant/après la nouvelle règle et avec CamemBERT.
- `roundtrip-results.json` : réidentification par le moteur de production sur les réponses finales.
- `usage.jsonl` : métadonnées retournées par l'API pour les 45 appels (coûts, jetons, modèles, motifs de fin), aucune clé ni en-tête d'authentification. Pour les premières lignes sans `maxTokens`, le plafond était de 1 600 ; pour Gemini final il est de 6 000 avec raisonnement minimal.
- `essais-initiaux/` : premier lot Gemini et deux générations de mails incomplets. Archivés sans retouche, exclus des scores finaux ; voir les paramètres et relances dans le rapport.

## Recalculer sans appel d'API

Depuis la racine du dépôt :

```sh
node tools/token-bench/score.mjs \
  --dir tools/token-bench/experiences/2026-11-18/reponses \
  --out tools/token-bench/experiences/2026-11-18/repères.md

# Node 22 : transformation des syntaxes TypeScript utilisées par le moteur.
node --experimental-transform-types --disable-warning=ExperimentalWarning \
  tools/token-bench/experiences/2026-11-18/verify-roundtrip.mjs

# Nécessite le CamemBERT q8 déjà déposé dans models/Xenova/camembert-ner/.
node --experimental-transform-types --disable-warning=ExperimentalWarning \
  tools/token-bench/experiences/2026-11-18/evaluate-mails.mjs
```

Ces deux dernières commandes sont pour Node 22 ; le drapeau n'existe plus dans Node 26. L'exécution initiale sous Node 26 a utilisé un chargeur TypeScript temporaire fondé sur le compilateur déjà installé, sans modification du moteur ni dépendance ajoutée.

## Refaire les appels

Le programme existant `tools/token-bench/run-api.mjs`, lot `court`, a envoyé exactement les prompts de `buildPrompt`, sans historique. Modèles : `openai/gpt-6.2-sol`, `anthropic/claude-sonnet-5.5`, `google/gemini-4-hydrogen`. Une enveloppe temporaire a chargé la clé du fichier local sans l'afficher, borné les sorties, ajouté le paramètre de raisonnement du lot final Gemini et enregistré les usages de l'API. Les scripts d'évaluation archivés n'envoient rien au réseau ; ils lisent les résultats existants.

Pour une nouvelle expérience, donner la clé via `OPENROUTER_API_KEY`, utiliser de nouveaux dossiers `--llm` et conserver séparément tous les essais tronqués. Le programme existant ne plafonne pas lui-même les sorties : reproduire les plafonds et le réglage Gemini indiqués dans le rapport. Ne jamais coller de données réelles dans ces essais.
