# Contrats du moteur

Source de vérité : `src/core/types/`. Ce document en donne la carte ; en cas d'écart, le code fait foi.

| Fichier | Contenu |
|---|---|
| `entities.ts` | `EntityType` (16 types), `ENTITY_PRIORITY` pour départager les égalités |
| `detection.ts` | `Detection` (intervalle UTF-16, score, origine, explication), `AnalysisResult`, `MAX_INPUT_LENGTH` |
| `recognizer.ts` | `Recognizer`, `AnalysisContext`, `NerEngine`, `Language` |
| `rules.ts` | Liste fermée `VALIDATOR_NAMES`, `PatternRule`, `DictionaryRule`, `ContextConfig`, `PackManifest`, `Pack` |
| `transform.ts` | `Mode`, `OperatorId`, `Entity`, `Session`, `Operator`, `TransformPlan`, `TransformResult` |

## Principes

- **Positions** : indices de chaîne JavaScript (UTF-16) sur le texte original ; `start` inclus, `end` exclu.
- **Pas de valeur originale dans les objets de résultat** : `Detection`, `AppliedTransformation` et les messages
  d'erreur ne contiennent jamais le texte détecté. Seules `Entity.surfaceForms` le contiennent, et ne sortent
  qu'à travers l'export chiffré.
- **Scores** : heuristiques entre 0 et 1, pas des probabilités. Validateur réussi → 1,0 ; validateur échoué →
  détection supprimée ; mot de contexte dans une fenêtre de 5 mots → +0,35, plafonné à 1,0 ; seuil par défaut 0,5.
- **Packs** : données JSON référençant des validateurs par nom ; aucun code.
- **Le moteur ne connaît pas le NER** : il reçoit une implémentation de `NerEngine` par injection.
