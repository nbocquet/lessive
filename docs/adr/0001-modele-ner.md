# ADR 0001 — Modèle NER

- **Statut : Accepté le 2026-11-17 par Nico — modèle recommandé : `Xenova/distilbert-base-multilingual-cased-ner-hrl` (q8). Mesure de vitesse dans le navigateur encore à faire (docs/performances.md).**
- Date de rédaction : 2026-11-16
- Décideur : Nico (porte G0)
- Tâche : S1 (PLAN.md, phase 0). Bloque la phase 3 (NER) et la tâche T4.4.
- Détails de recherche et commandes : `spikes/ner/README.md`

## Contexte

Lessive détecte des données personnelles dans le navigateur, sans aucun appel réseau à l'exécution (R1, R2).
Les motifs réguliers (courriel, IBAN, AVS…) ne suffisent pas pour les noms de personnes, d'organisations et de
lieux : il faut un modèle de reconnaissance d'entités nommées (NER) exécuté localement par Transformers.js sur
ONNX Runtime Web (décision du plan, section 3), chargé uniquement depuis des fichiers locaux (R4).

Le public écrit surtout en français, avec des noms suisses, français et d'origine étrangère, en style courriel
informel (minuscules, prénoms seuls, titres, emojis). Les modèles candidats ont presque tous été entraînés sur
des textes de presse ou de Wikipédia : leur comportement sur ce style est la vraie inconnue, d'où un corpus
synthétique dédié (`corpus/ner-fr.jsonl`, `corpus/ner-en.jsonl`, 150 phrases chacun).

Cet ADR est volontairement **non tranché** : l'environnement de l'agent n'a pas accès à Hugging Face, aucun
modèle n'a pu être chargé. Tout ce qui suit sous « Mesures » est vide tant que Nico n'a pas déposé les modèles
et lancé la procédure ci-dessous.

## Critères d'acceptation (PLAN.md, S1)

Au moins un modèle doit satisfaire **tous** les critères suivants ; sinon, rapport d'échec et options.

| # | Critère | Cible | Comment c'est mesuré |
|---|---|---|---|
| C1 | Licence | Redistribuable sous une licence compatible Apache 2.0 | Lecture de la licence du modèle **et** des conditions de ses données d'entraînement ; décision de Nico (voir « Points de licence ») |
| C2 | Poids | ≤ 150 Mo (poids quantifié + tokenizer + config) | `results/*.md`, ligne « Fichiers nécessaires » |
| C3 | Qualité | Rappel PERSON ≥ 0,85 en français | `results/*.md`, langue `fr`, PERSON, **rappel par recouvrement** ; la correspondance exacte est donnée à titre indicatif |
| C4 | Vitesse | ≤ 5 s pour 5000 caractères sur CPU | Node : `results/*.md` ; navigateur : mesure manuelle (page `spikes/ner/browser`). C'est la mesure **navigateur** qui compte pour le produit |

Critères secondaires, relevés mais non bloquants : précision PERSON (un faux positif coûte une pseudonymisation
inutile, un faux négatif laisse fuir une donnée), F1 par catégorie et par langue, rappel sur les phrases
« minuscules », « prénoms seuls », « emoji », « pièges », temps de chargement, mémoire, exactitude des
positions avec accents et emojis (nombre d'entités non localisées), absence de requête hors origine (R1).

Le choix de la correspondance par recouvrement pour C3 est une proposition : pour masquer une donnée, localiser
le nom suffit même si les bornes diffèrent d'un mot (un titre, un tiret). Nico peut préférer la correspondance
exacte.

## Candidats

Détails, sources et réserves : `spikes/ner/README.md`. **V** = lu sur la page Hugging Face le 2026-11-16 ;
**NV** = non vérifié.

| # | Dépôt ONNX | Origine | Langues | Licence annoncée | Poids q8 | Compatible Transformers.js | Remarques |
|---|---|---|---|---|---|---|---|
| 1 | `Xenova/distilbert-base-multilingual-cased-ner-hrl` | Davlan, DistilBERT multilingue | 10 (dont fr, en, de, it) | AFL-3.0 (modèle d'origine) | 135 Mo (V), ≈ 138 Mo avec tokenizer | Oui (V) | Données d'entraînement incluant CoNLL 2003 : réserve de licence (NV) |
| 2 | `Xenova/camembert-ner` | Jean-Baptiste, CamemBERT, wikiner-fr | fr | MIT (modèle d'origine) | 111 Mo (V), ≈ 114 Mo | Oui (V) | Français seulement ; MISC ignoré |
| 3 | `jiting/xlm-roberta-base-ner-hrl_onnx` | Davlan, XLM-RoBERTa base (conversion tierce) | 10 | AFL-3.0 | 279 Mo (V) | Annoncé (V) ; `tokenizer.json` NV | Hors cible de poids ; référence de qualité |
| 4 | `Xenova/bert-base-multilingual-cased-ner-hrl` | Davlan, mBERT | 10 | AFL-3.0 | 178 Mo (V) | Oui (V) | Hors cible de poids ; référence |
| 5 | `promptshield/miniscule` | Dérivé tiers du n° 4, vocabulaire élagué | 8 (latin) | AFL-3.0 | 139,6 Mo (annoncé par l'auteur) | Annoncé (V, carte) | Dérivé non officiel ; équivalence de sortie affirmée par l'auteur, non vérifiée |
| 6 | `cmarkea/distilcamembert-base-ner` | DistilCamemBERT, wikiner-fr | fr | MIT | 143 Mo (V) | **Non** en l'état (ONNX à la racine, pas de `tokenizer.json`) | Adaptation manuelle (voir README) |
| 7 | `JusteLeo/ALBERT-base-v2-french-ner` | ALBERT-base-v2, wikiner-fr | fr | Apache-2.0 | ≈ 45 Mo (annoncé) | NV | F1 annoncé 0,83 ; compatibilité Transformers.js NV ; mesure optionnelle |
| — | GLiNER multilingue (`onnx-community/gliner_multi`) | GLiNER (mDeBERTa) | multilingue | Non affichée sur la page ONNX (V) | 352 Mo (V) | **Non** via `pipeline` (V) | Voir « GLiNER » ; non retenu pour S1 |
| — | `riidact/ner-multilingual` | NuNER multilingue affiné | 103 annoncées | **CC-BY-NC-4.0** (V) | 178 Mo (V) | Oui (V) | **Écarté** : licence non commerciale |

### GLiNER

Non utilisable directement avec le pipeline `token-classification` de Transformers.js : il faut porter le
pré/post-traitement (étiquettes libres, fenêtrage). Un paquet npm communautaire (`gliner`, MIT) existe mais
dépend de l'ancienne génération (`@xenova/transformers` 2.17.2) et d'un second `onnxruntime-web`, hors du budget
de dépendances R9 sans accord de Nico. Poids : 352 Mo quantifié, soit plus de deux fois la cible.
Statut : non évalué, à réexaminer seulement si aucun modèle de classification de jetons n'atteint C3.

### Points de licence (à trancher par Nico)

1. **AFL-3.0 et Apache 2.0.** AFL-3.0 est permissive (attribution, conservation de la licence), mais cet ADR ne
   conclut pas à sa compatibilité avec une distribution sous Apache 2.0. Avis juridique à prendre si un modèle
   AFL-3.0 est retenu (n° 1, 3, 4, 5).
2. **Données d'entraînement.** La famille Davlan `-ner-hrl` est entraînée, entre autres, sur CoNLL 2003 et
   Europeana Newspapers (V, carte du modèle). Les conditions de redistribution de ces corpus, et leur effet
   sur les poids dérivés, n'ont pas été vérifiées (NV). Idem pour `wikiner` (n° 2, 6, 7).
3. **Dépôts Xenova** : aucune licence affichée ; on suppose l'héritage de la licence du modèle d'origine (NV).
4. **Dérivés tiers** (n° 3, 5) : confiance dans le convertisseur, et licence supposée héritée.

## Mesures (à remplir)

### Sous Node (généré par `npm run eval`, voir `spikes/ner/results/`)

| # | Modèle | dtype | Poids + tokenizer (Mo) | Chargement (ms) | Moy./phrase (ms) | 5000 car. (ms) | Mémoire ajoutée au chargement (Mo) | PERSON fr : P exact / R exact | PERSON fr : P recouv. / **R recouv.** | PERSON en : R recouv. | ORG fr : F1 recouv. | LOC fr : F1 recouv. | Entités non localisées |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `Xenova/distilbert-base-multilingual-cased-ner-hrl` | q8 | 138,3 | 374 | 4,0 | 318 | 143 | 0,89 / 0,79 | 0,96 / **0,85** | 0,87 | 0,84 | 0,87 | 0 |
| 2 | `Xenova/camembert-ner` | q8 | 113,7 | 447 | 8,5 | 482 | 255 | 0,86 / 0,81 | 0,92 / **0,87** | 0,79 | 0,89 | 0,93 | 0 |
| 3 | `jiting/xlm-roberta-base-ner-hrl_onnx` | non mesuré | | | | | | | | | | | |
| 4 | `Xenova/bert-base-multilingual-cased-ner-hrl` | non mesuré | | | | | | | | | | | |
| 5 | `promptshield/miniscule` | non mesuré | | | | | | | | | | | |
| 6 | `cmarkea/distilcamembert-base-ner` | q8 | 146,8 | 341 | 4,3 | 275 | 96 | 0,25 / 0,27 | 0,71 / **0,76** | 0,65 | 0,29 | 0,38 | 2 |

Mesuré le 17 novembre 2026 sous Node 22, Transformers.js 4.3.2, onnxruntime-node, CPU Xeon 2 cœurs, sur les corpus synthétiques (`corpus/`, 150 phrases par langue, environ 125 personnes par langue : quelques points d'écart ne sont pas significatifs). Le n° 6 a reçu un `tokenizer.json` généré à partir de son SentencePiece (conversion vérifiée : mêmes identifiants que le tokenizer d'origine).

**Correctif nécessaire, à reprendre dans `src/ner` :** l'agrégation `aggregation_strategy: "simple"` de Transformers.js 4.3.2 fusionne deux entités séparées par d'autres mots quand le modèle étiquette en IO (`I-PER` sans `B-`, cas des modèles CamemBERT) : « Claire Dubois a rencontré Jean-Marc Favre » donnait une seule personne. Le banc regroupe désormais les jetons bruts selon leur contiguïté (`groupRawTokens`), ce qui a fait passer le rappel PERSON fr de CamemBERT-NER de 0,62 à 0,87.

### Dans le navigateur (mesure manuelle, page `spikes/ner/browser`)

Navigateur et version : ______ · Machine (CPU, cœurs, RAM) : ______ · Threads WASM : ______

| # | Modèle | Chargement (ms) | 5000 car., 3 essais (ms) | Médiane (ms) | Mémoire (Mo) | Requêtes hors origine | Positions correctes (accents, emoji) |
|---|---|---|---|---|---|---|---|
| 1 | `Xenova/distilbert-base-multilingual-cased-ner-hrl` | | | | | | |
| 2 | `Xenova/camembert-ner` | | | | | | |
| 3 | `jiting/xlm-roberta-base-ner-hrl_onnx` | | | | | | |
| 5 | `promptshield/miniscule` | | | | | | |

### Critères par modèle

| # | C1 licence | C2 poids ≤ 150 Mo | C3 rappel PERSON fr ≥ 0,85 | C4 ≤ 5 s / 5000 car. (navigateur) | Verdict |
|---|---|---|---|---|---|
| 1 | AFL-3.0 + réserve CoNLL : **à trancher** | ✅ 138 Mo | ✅ 0,85 (limite) ; en 0,87 | Node 0,3 s ; navigateur à mesurer | **Recommandé** (fr + en, meilleure précision) |
| 2 | ✅ MIT | ✅ 114 Mo | ✅ 0,87 ; en 0,79 | Node 0,5 s ; navigateur à mesurer | Repli français (meilleur ORG/LOC fr) |
| 3 | AFL-3.0 | ❌ 279 Mo | non mesuré | | Hors cible |
| 4 | AFL-3.0 | ❌ 178 Mo | non mesuré | | Hors cible |
| 5 | AFL-3.0 | ✅ annoncé 140 Mo | non mesuré | | Non mesuré |
| 6 | ✅ MIT | ✅ 147 Mo (limite) | ❌ 0,76 | Node 0,3 s | **Écarté** (qualité, bornes imprécises) |

## Procédure pour compléter cet ADR

1. `cd spikes/ner && npm ci` (en cas de blocage réseau sur `onnxruntime-node` : `ONNXRUNTIME_NODE_INSTALL=skip npm ci`).
2. Télécharger les modèles dans `models/` avec les commandes de `spikes/ner/README.md` (section « Télécharger »).
3. `npm run verify-corpus` puis `npm test` : le corpus et les fonctions de mesure doivent passer.
4. `npm run eval` : un rapport par modèle dans `spikes/ner/results/<org>__<nom>.md` et `.json`. Reporter les
   valeurs dans le premier tableau « Mesures ». Une erreur de chargement (tokenizer incompatible, fichier
   manquant) est affichée par modèle ; la noter dans « Verdict » et continuer.
5. `npm run browser`, suivre « Mesure navigateur » du README pour les modèles qui passent C2 au moins, remplir
   le deuxième tableau.
6. Lire les licences (README, « Sur les licences ») et trancher les points de licence ci-dessus.
7. Remplir « Critères par modèle », rédiger la décision, passer le statut à « Accepté » (ou « Rejeté »),
   puis valider à la porte G0.

## Décision

**Modèle recommandé : `Xenova/distilbert-base-multilingual-cased-ner-hrl`, quantifié q8 (≈ 138 Mo).**

- Seul candidat mesuré qui couvre le français **et** l'anglais avec la meilleure précision (rappel PERSON 0,85 fr et 0,87 en, précision 0,96 sous Node) ; combiné aux packs (listes officielles de prénoms et de noms, propagation), rappel PERSON 0,90 fr et 0,92 en (docs/evaluation-ner.md).
- Paramètres : pipeline `token-classification` sans `aggregation_strategy`, regroupement des jetons par contiguïté d'index, positions reconstruites dans le texte original, ONNX Runtime Web en WASM avec `numThreads = 1` (CSP sans `blob:`).
- **Licence** : la question ne se pose plus pour le projet. Le modèle n'est pas distribué avec Lessive : l'utilisateur le télécharge lui-même et l'accepte sous sa licence propre (AFL-3.0), puis le charge depuis son disque (amendement A20, ADR 0003).
- **Alternative** pour un usage en français seulement : `Xenova/camembert-ner` (MIT, rappel PERSON fr 0,87, plus faible en anglais), chargeable de la même façon.
- **Reste à faire** : mesure de vitesse dans un navigateur réel (Chrome, Firefox, Safari) ; la mesure indicative en Chrome headless donne environ 3 s pour 5 000 caractères (cible 5 s).

## Options si aucun modèle ne satisfait tous les critères

À instruire selon le critère qui échoue :

- **C2 (poids)** : élaguer le vocabulaire du modèle multilingue (approche du n° 5, à refaire soi-même et à valider),
  ou relever la limite de 150 Mo (décision de Nico), ou proposer le modèle en téléchargement optionnel séparé
  (le fonctionnement hors ligne restant garanti par le chargement depuis la même origine).
- **C3 (rappel)** : combiner le NER avec des dictionnaires de prénoms et de noms (source dictionnaire du contrat
  `Detection`), ou des règles de contexte (titres, signatures, salutations), ou affiner un petit modèle sur un
  corpus propre (projet à part, hors MVP).
- **C4 (vitesse)** : découper en morceaux et traiter en tâche de fond avec progression, WebGPU en option,
  modèle plus petit.
- **C1 (licence)** : modèle alternatif à licence claire, ou NER livré comme module optionnel non redistribué,
  l'utilisateur déposant lui-même le modèle (cohérent avec `models/`).
- **Tout échoue** : mode MVP sans NER (motifs, validateurs et dictionnaires seulement), avec NER en phase ultérieure.

## Conséquences

À compléter avec la décision. Dès maintenant : la phase 3 (NER) et T4.4 restent bloquées jusqu'à la porte G0.
