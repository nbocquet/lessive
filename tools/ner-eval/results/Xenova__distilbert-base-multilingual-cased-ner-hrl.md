# Résultats NER — Xenova/distilbert-base-multilingual-cased-ner-hrl

Généré le 2026-11-17 · Transformers.js 4.3.2 · Node v22.23.4 · Intel(R) Xeon(R) Processor @ 2.10GHz (2 cœurs) · dtype `q8`

Mesures faites sous Node (onnxruntime-node, CPU). Elles ne remplacent pas la mesure navigateur (WASM).

## Performance

| Mesure | Valeur |
|---|---|
| Temps de chargement | 374.1 ms |
| Temps moyen par phrase (300 phrases) | 4.0 ms |
| Temps p95 par phrase | 5.3 ms |
| Texte de 5000 caractères (5 morceaux), médiane de 3 essais | 317.9 ms (min 301.2 ms) |
| Mémoire RSS avant chargement | 379.6 Mo |
| Mémoire RSS après chargement | 529.5 Mo |
| Pic de mémoire RSS pendant l'inférence | 530.1 Mo |
| Fichier de poids utilisé | `onnx/model_quantized.onnx` — 135.4 Mo |
| Fichiers nécessaires (poids + tokenizer + config) | 138.3 Mo |
| Dossier complet du modèle | 138.3 Mo |

## Qualité

Exact : mêmes bornes et même type. Recouvrement : intervalles qui se recouvrent, même type. Appariement un-pour-un. ANY : le type est ignoré (utile pour le masquage).

### Langue : fr

| Catégorie | P exact | R exact | F1 exact | P recouvr. | R recouvr. | F1 recouvr. | Support |
|---|---|---|---|---|---|---|---|
| PERSON | 0.890 | 0.789 | 0.836 | 0.963 | 0.854 | 0.905 | 123 |
| ORGANIZATION | 0.440 | 0.611 | 0.512 | 0.720 | 1.000 | 0.837 | 18 |
| LOCATION | 0.906 | 0.829 | 0.866 | 0.906 | 0.829 | 0.866 | 35 |
| Tous types (micro) | 0.825 | 0.778 | 0.801 | 0.916 | 0.864 | 0.889 | 176 |
| Détection sans égard au type | 0.861 | 0.813 | 0.836 | 0.958 | 0.903 | 0.930 | 176 |

### Langue : en

| Catégorie | P exact | R exact | F1 exact | P recouvr. | R recouvr. | F1 recouvr. | Support |
|---|---|---|---|---|---|---|---|
| PERSON | 0.956 | 0.865 | 0.908 | 0.956 | 0.865 | 0.908 | 126 |
| ORGANIZATION | 0.652 | 0.833 | 0.732 | 0.783 | 1.000 | 0.878 | 18 |
| LOCATION | 0.912 | 0.861 | 0.886 | 0.912 | 0.861 | 0.886 | 36 |
| Tous types (micro) | 0.906 | 0.861 | 0.883 | 0.924 | 0.878 | 0.900 | 180 |
| Détection sans égard au type | 0.942 | 0.894 | 0.917 | 0.977 | 0.928 | 0.952 | 180 |

### Langue : all

| Catégorie | P exact | R exact | F1 exact | P recouvr. | R recouvr. | F1 recouvr. | Support |
|---|---|---|---|---|---|---|---|
| PERSON | 0.924 | 0.827 | 0.873 | 0.960 | 0.859 | 0.907 | 249 |
| ORGANIZATION | 0.542 | 0.722 | 0.619 | 0.750 | 1.000 | 0.857 | 36 |
| LOCATION | 0.909 | 0.845 | 0.876 | 0.909 | 0.845 | 0.876 | 71 |
| Tous types (micro) | 0.866 | 0.820 | 0.843 | 0.920 | 0.871 | 0.895 | 356 |
| Détection sans égard au type | 0.902 | 0.854 | 0.877 | 0.967 | 0.916 | 0.941 | 356 |

### Rappel par type de phrase (recouvrement, tous types)

| Langue | Type de phrase | Entités | Rappel | Précision |
|---|---|---|---|---|
| fr | std | 20 | 1.000 | 0.952 |
| fr | swiss | 12 | 1.000 | 1.000 |
| fr | foreign | 15 | 1.000 | 1.000 |
| fr | first | 11 | 0.909 | 0.909 |
| fr | lower | 10 | 0.000 | – |
| fr | email | 24 | 0.875 | 0.840 |
| fr | title | 13 | 0.923 | 0.923 |
| fr | org | 13 | 1.000 | 0.867 |
| fr | commune | 20 | 0.800 | 0.842 |
| fr | accent | 10 | 1.000 | 1.000 |
| fr | emoji | 13 | 0.846 | 0.846 |
| fr | none | 0 | – | – |
| fr | trap | 15 | 0.800 | 1.000 |
| en | std | 20 | 1.000 | 1.000 |
| en | swiss | 12 | 1.000 | 1.000 |
| en | foreign | 15 | 0.933 | 0.933 |
| en | first | 11 | 1.000 | 1.000 |
| en | lower | 10 | 0.000 | 0.000 |
| en | email | 24 | 0.917 | 0.917 |
| en | title | 13 | 1.000 | 1.000 |
| en | org | 13 | 1.000 | 0.929 |
| en | commune | 20 | 0.850 | 0.810 |
| en | accent | 10 | 1.000 | 1.000 |
| en | emoji | 13 | 0.846 | 0.917 |
| en | none | 0 | – | – |
| en | trap | 19 | 0.789 | 0.833 |

## Reconstruction des positions

Entités prédites par source : natives 0, retrouvées par recherche 332, approximatives 5 ; non localisées 0 ; étiquettes ignorées (MISC, etc.) 0.

## Critères de l'ADR 0001

| Critère | Cible | Mesuré | Atteint |
|---|---|---|---|
| Poids du modèle | ≤ 150 Mo | 138.3 Mo | oui |
| Rappel PERSON en français (recouvrement) | ≥ 0,85 | 0.854 | oui |
| Texte de 5000 caractères | ≤ 5 s | 317.9 ms | oui |
| Licence redistribuable compatible Apache 2.0 | oui | à vérifier à la main | – |
