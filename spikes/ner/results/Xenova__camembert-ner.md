# Résultats NER — Xenova/camembert-ner

Généré le 2026-11-17 · Transformers.js 4.3.2 · Node v22.23.4 · Intel(R) Xeon(R) Processor @ 2.10GHz (2 cœurs) · dtype `q8`

Mesures faites sous Node (onnxruntime-node, CPU). Elles ne remplacent pas la mesure navigateur (WASM).

## Performance

| Mesure | Valeur |
|---|---|
| Temps de chargement | 446.6 ms |
| Temps moyen par phrase (300 phrases) | 8.5 ms |
| Temps p95 par phrase | 11.7 ms |
| Texte de 5000 caractères (5 morceaux), médiane de 3 essais | 482.3 ms (min 466.6 ms) |
| Mémoire RSS avant chargement | 91.4 Mo |
| Mémoire RSS après chargement | 358.8 Mo |
| Pic de mémoire RSS pendant l'inférence | 376.0 Mo |
| Fichier de poids utilisé | `onnx/model_quantized.onnx` — 111.3 Mo |
| Fichiers nécessaires (poids + tokenizer + config) | 113.7 Mo |
| Dossier complet du modèle | 113.7 Mo |

## Qualité

Exact : mêmes bornes et même type. Recouvrement : intervalles qui se recouvrent, même type. Appariement un-pour-un. ANY : le type est ignoré (utile pour le masquage).

### Langue : fr

| Catégorie | P exact | R exact | F1 exact | P recouvr. | R recouvr. | F1 recouvr. | Support |
|---|---|---|---|---|---|---|---|
| PERSON | 0.862 | 0.813 | 0.837 | 0.922 | 0.870 | 0.895 | 123 |
| ORGANIZATION | 0.650 | 0.722 | 0.684 | 0.850 | 0.944 | 0.895 | 18 |
| LOCATION | 0.800 | 0.914 | 0.853 | 0.875 | 1.000 | 0.933 | 35 |
| Tous types (micro) | 0.824 | 0.824 | 0.824 | 0.903 | 0.903 | 0.903 | 176 |
| Détection sans égard au type | 0.830 | 0.830 | 0.830 | 0.915 | 0.915 | 0.915 | 176 |

### Langue : en

| Catégorie | P exact | R exact | F1 exact | P recouvr. | R recouvr. | F1 recouvr. | Support |
|---|---|---|---|---|---|---|---|
| PERSON | 0.752 | 0.675 | 0.711 | 0.885 | 0.794 | 0.837 | 126 |
| ORGANIZATION | 0.667 | 0.667 | 0.667 | 0.833 | 0.833 | 0.833 | 18 |
| LOCATION | 0.689 | 0.861 | 0.765 | 0.733 | 0.917 | 0.815 | 36 |
| Tous types (micro) | 0.727 | 0.711 | 0.719 | 0.841 | 0.822 | 0.831 | 180 |
| Détection sans égard au type | 0.767 | 0.750 | 0.758 | 0.886 | 0.867 | 0.876 | 180 |

### Langue : all

| Catégorie | P exact | R exact | F1 exact | P recouvr. | R recouvr. | F1 recouvr. | Support |
|---|---|---|---|---|---|---|---|
| PERSON | 0.808 | 0.743 | 0.774 | 0.904 | 0.831 | 0.866 | 249 |
| ORGANIZATION | 0.658 | 0.694 | 0.676 | 0.842 | 0.889 | 0.865 | 36 |
| LOCATION | 0.741 | 0.887 | 0.808 | 0.800 | 0.958 | 0.872 | 71 |
| Tous types (micro) | 0.776 | 0.767 | 0.771 | 0.872 | 0.862 | 0.867 | 356 |
| Détection sans égard au type | 0.798 | 0.789 | 0.794 | 0.901 | 0.890 | 0.895 | 356 |

### Rappel par type de phrase (recouvrement, tous types)

| Langue | Type de phrase | Entités | Rappel | Précision |
|---|---|---|---|---|
| fr | std | 20 | 1.000 | 1.000 |
| fr | swiss | 12 | 1.000 | 1.000 |
| fr | foreign | 15 | 0.933 | 0.875 |
| fr | first | 11 | 0.818 | 1.000 |
| fr | lower | 10 | 0.900 | 0.818 |
| fr | email | 24 | 0.708 | 1.000 |
| fr | title | 13 | 1.000 | 0.929 |
| fr | org | 13 | 0.923 | 0.857 |
| fr | commune | 20 | 1.000 | 1.000 |
| fr | accent | 10 | 1.000 | 0.667 |
| fr | emoji | 13 | 0.923 | 1.000 |
| fr | none | 0 | – | 0.000 |
| fr | trap | 15 | 0.733 | 0.786 |
| en | std | 20 | 1.000 | 0.909 |
| en | swiss | 12 | 1.000 | 0.923 |
| en | foreign | 15 | 0.867 | 0.813 |
| en | first | 11 | 0.909 | 0.769 |
| en | lower | 10 | 1.000 | 0.833 |
| en | email | 24 | 0.500 | 0.923 |
| en | title | 13 | 1.000 | 0.929 |
| en | org | 13 | 0.923 | 0.923 |
| en | commune | 20 | 0.900 | 0.900 |
| en | accent | 10 | 1.000 | 0.667 |
| en | emoji | 13 | 0.769 | 0.909 |
| en | none | 0 | – | 0.000 |
| en | trap | 19 | 0.421 | 0.615 |

## Reconstruction des positions

Entités prédites par source : natives 0, retrouvées par recherche 315, approximatives 37 ; non localisées 0 ; étiquettes ignorées (MISC, etc.) 26.

## Critères de l'ADR 0001

| Critère | Cible | Mesuré | Atteint |
|---|---|---|---|
| Poids du modèle | ≤ 150 Mo | 113.7 Mo | oui |
| Rappel PERSON en français (recouvrement) | ≥ 0,85 | 0.870 | oui |
| Texte de 5000 caractères | ≤ 5 s | 482.3 ms | oui |
| Licence redistribuable compatible Apache 2.0 | oui | à vérifier à la main | – |
