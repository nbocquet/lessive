# Résultats NER — cmarkea/distilcamembert-base-ner

Généré le 2026-11-17 · Transformers.js 4.3.2 · Node v22.23.4 · Intel(R) Xeon(R) Processor @ 2.10GHz (2 cœurs) · dtype `q8`

Mesures faites sous Node (onnxruntime-node, CPU). Elles ne remplacent pas la mesure navigateur (WASM).

## Performance

| Mesure | Valeur |
|---|---|
| Temps de chargement | 341.0 ms |
| Temps moyen par phrase (300 phrases) | 4.3 ms |
| Temps p95 par phrase | 5.5 ms |
| Texte de 5000 caractères (5 morceaux), médiane de 3 essais | 275.4 ms (min 273.4 ms) |
| Mémoire RSS avant chargement | 434.6 Mo |
| Mémoire RSS après chargement | 535.2 Mo |
| Pic de mémoire RSS pendant l'inférence | 535.4 Mo |
| Fichier de poids utilisé | `onnx/model_quantized.onnx` — 142.7 Mo |
| Fichiers nécessaires (poids + tokenizer + config) | 146.8 Mo |
| Dossier complet du modèle | 146.0 Mo |

## Qualité

Exact : mêmes bornes et même type. Recouvrement : intervalles qui se recouvrent, même type. Appariement un-pour-un. ANY : le type est ignoré (utile pour le masquage).

### Langue : fr

| Catégorie | P exact | R exact | F1 exact | P recouvr. | R recouvr. | F1 recouvr. | Support |
|---|---|---|---|---|---|---|---|
| PERSON | 0.250 | 0.268 | 0.259 | 0.712 | 0.764 | 0.737 | 123 |
| ORGANIZATION | 0.050 | 0.278 | 0.084 | 0.168 | 0.944 | 0.286 | 18 |
| LOCATION | 0.114 | 0.429 | 0.180 | 0.242 | 0.914 | 0.383 | 35 |
| Tous types (micro) | 0.145 | 0.301 | 0.196 | 0.392 | 0.813 | 0.529 | 176 |
| Détection sans égard au type | 0.203 | 0.420 | 0.274 | 0.460 | 0.955 | 0.621 | 176 |

### Langue : en

| Catégorie | P exact | R exact | F1 exact | P recouvr. | R recouvr. | F1 recouvr. | Support |
|---|---|---|---|---|---|---|---|
| PERSON | 0.136 | 0.135 | 0.135 | 0.656 | 0.651 | 0.653 | 126 |
| ORGANIZATION | 0.010 | 0.167 | 0.019 | 0.054 | 0.889 | 0.102 | 18 |
| LOCATION | 0.087 | 0.278 | 0.132 | 0.235 | 0.750 | 0.358 | 36 |
| Tous types (micro) | 0.056 | 0.167 | 0.084 | 0.233 | 0.694 | 0.349 | 180 |
| Détection sans égard au type | 0.089 | 0.267 | 0.134 | 0.298 | 0.889 | 0.446 | 180 |

### Langue : all

| Catégorie | P exact | R exact | F1 exact | P recouvr. | R recouvr. | F1 recouvr. | Support |
|---|---|---|---|---|---|---|---|
| PERSON | 0.195 | 0.201 | 0.198 | 0.685 | 0.707 | 0.696 | 249 |
| ORGANIZATION | 0.020 | 0.222 | 0.037 | 0.083 | 0.917 | 0.152 | 36 |
| LOCATION | 0.101 | 0.352 | 0.157 | 0.239 | 0.831 | 0.371 | 71 |
| Tous types (micro) | 0.092 | 0.233 | 0.132 | 0.297 | 0.753 | 0.426 | 356 |
| Détection sans égard au type | 0.135 | 0.343 | 0.194 | 0.364 | 0.921 | 0.521 | 356 |

### Rappel par type de phrase (recouvrement, tous types)

| Langue | Type de phrase | Entités | Rappel | Précision |
|---|---|---|---|---|
| fr | std | 20 | 1.000 | 0.606 |
| fr | swiss | 12 | 0.917 | 0.379 |
| fr | foreign | 15 | 0.867 | 0.371 |
| fr | first | 11 | 0.636 | 0.438 |
| fr | lower | 10 | 1.000 | 0.345 |
| fr | email | 24 | 0.583 | 0.400 |
| fr | title | 13 | 0.923 | 0.444 |
| fr | org | 13 | 0.846 | 0.367 |
| fr | commune | 20 | 0.950 | 0.559 |
| fr | accent | 10 | 0.900 | 0.600 |
| fr | emoji | 13 | 0.769 | 0.435 |
| fr | none | 0 | – | 0.000 |
| fr | trap | 15 | 0.467 | 0.140 |
| en | std | 20 | 0.900 | 0.340 |
| en | swiss | 12 | 0.667 | 0.216 |
| en | foreign | 15 | 0.800 | 0.226 |
| en | first | 11 | 0.455 | 0.139 |
| en | lower | 10 | 0.700 | 0.189 |
| en | email | 24 | 0.458 | 0.196 |
| en | title | 13 | 0.846 | 0.344 |
| en | org | 13 | 0.846 | 0.224 |
| en | commune | 20 | 0.800 | 0.320 |
| en | accent | 10 | 1.000 | 0.455 |
| en | emoji | 13 | 0.538 | 0.412 |
| en | none | 0 | – | 0.000 |
| en | trap | 19 | 0.474 | 0.130 |

## Reconstruction des positions

Entités prédites par source : natives 0, retrouvées par recherche 382, approximatives 520 ; non localisées 2 ; étiquettes ignorées (MISC, etc.) 154.

## Critères de l'ADR 0001

| Critère | Cible | Mesuré | Atteint |
|---|---|---|---|
| Poids du modèle | ≤ 150 Mo | 146.8 Mo | oui |
| Rappel PERSON en français (recouvrement) | ≥ 0,85 | 0.764 | non |
| Texte de 5000 caractères | ≤ 5 s | 275.4 ms | oui |
| Licence redistribuable compatible Apache 2.0 | oui | à vérifier à la main | – |
