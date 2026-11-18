# Banc des repères

Outil autonome (hors build et hors lint strict) qui mesure si les assistants IA recopient fidèlement les repères de pseudonymisation (`PERSONNE_001`) quand on leur demande de traduire ou de reformuler un texte. Il a servi au choix du format, décrit dans [l'ADR 0002](../../docs/adr/0002-format-jetons.md).

| Fichier | Rôle |
|---|---|
| `textes/` | 5 textes synthétiques et leurs versions pseudonymisées (formats A, B, C), générés par `generate.mjs`. |
| `config.mjs`, `formats.mjs` | Lots d'essais, consignes et formats de repères. |
| `run-api.mjs` | Envoie chaque essai à un assistant par son API (OpenAI, Anthropic, Gemini ou OpenRouter) ; réponses écrites dans `reponses/<llm>/`. |
| `score.mjs` | Calcule les taux de recopie (strict et tolérant) et écrit `results.md`. |
| `analyzer.mjs` | Analyseur tolérant des repères, prototype de `src/core/reidentify`. |
| `consignes.md` | Procédure complète, y compris en conversation manuelle. |
| `results.md` | Résultats de l'expérience du 17 novembre 2026 (ChatGPT et Claude : 100 % des repères recopiés). |

Les réponses brutes de cette expérience ne sont plus dans le dépôt ; `reponses/exemple/` contient des réponses factices pour essayer le calcul.

```bash
cd tools/token-bench
npx vitest run --config vitest.config.mjs              # tests de l'outil
node run-api.mjs --provider openrouter --model ~openai/gpt-latest --dry-run   # aperçu, sans appel
node score.mjs --include-exemple                       # calcul sur les réponses factices
```

Les clés d'API se donnent par variable d'environnement (`OPENROUTER_API_KEY`, `OPENAI_API_KEY`…) et ne s'écrivent jamais dans le dépôt.
