# Spike S1 — NER dans le navigateur

Prototype jetable (hors build racine, hors lint strict). Il prépare la mesure comparative des modèles NER
pour l'ADR `docs/adr/0001-modele-ner.md`. **Aucun modèle n'est présent** : Hugging Face est inaccessible
depuis l'environnement des agents. Nico dépose les modèles dans `models/`, puis tout se lance en une commande.

## En bref : ce que Nico doit faire

```bash
# 1. Installer (une fois)
cd spikes/ner && npm ci

# 2. Télécharger les modèles dans models/ (voir « Télécharger » plus bas)

# 3. Mesurer sous Node (écrit results/<modele>.md et .json)
npm run eval

# 4. Mesurer dans le navigateur, à la main
npm run browser        # puis ouvrir http://127.0.0.1:5173
```

Sans modèle, `npm run eval` affiche « Aucun modèle trouvé dans models/, voir README » et s'arrête sans erreur.

## Commandes

| Commande (dans `spikes/ner/`) | Effet |
|---|---|
| `npm ci` | Installe les dépendances (versions verrouillées par `package-lock.json`) |
| `npm run verify-corpus` | Vérifie les deux corpus (positions, types, chevauchements, 150 phrases, emojis…) |
| `npm run build-corpus` | Régénère `corpus/ner-fr.jsonl` et `ner-en.jsonl` depuis `corpus-tools/sources/` |
| `npm test` | Tests `node:test` des fonctions pures (sans modèle) |
| `npm run eval` | Évalue tous les modèles de `models/` |
| `npm run eval -- Xenova/camembert-ner` | Évalue un seul modèle (identifiant relatif à `models/`) |
| `npm run browser` | Page de mesure navigateur (serveur Vite local) |

Options de `eval.mjs` : `--models-dir <dossier>`, `--dtype q8\|fp32\|int8\|uint8\|fp16` (par défaut :
`q8` si `onnx/model_quantized.onnx` existe, sinon `fp32`), `--chunk <n>` (taille des morceaux, 1000 car. par
défaut), `--runs <n>` (essais pour le texte de 5000 car., 3 par défaut).

> **Note réseau (environnement des agents uniquement).** `onnxruntime-node` tente de télécharger des
> bibliothèques CUDA depuis nuget.org pendant `npm install`, ce que le proxy refuse. L'installation passe avec
> `ONNXRUNTIME_NODE_INSTALL=skip npm ci` (variable lue par le script d'installation d'onnxruntime-node ; le CPU n'a pas besoin de ces fichiers).
> Sur la machine de Nico, `npm ci` seul devrait suffire.

## Ce qui a été fait et vérifié sans modèle

- Corpus : 150 phrases par langue, vérifiées par `verify-corpus` et par les tests.
- Fonctions pures (`lib.mjs`) testées avec des prédictions factices : correspondance des étiquettes,
  reconstruction des positions, regroupement de jetons, découpage, précision/rappel/F1 exact et par recouvrement.
- Test de bout en bout avec un classifieur factice qui imite la sortie de Transformers.js (mot décodé en
  minuscules, sans accents, espaces autour de `'` et `-`) : sur les 300 phrases, les positions reconstruites
  redonnent exactement l'annotation.
- `eval.mjs` a aussi été exercé de bout en bout, une fois, avec un modèle ONNX **jouet** (une table de
  correspondance mot -> étiquette, avec un vrai tokenizer WordPiece) fabriqué localement puis supprimé : le
  chargement local, le pipeline, la reconstruction des positions et l'écriture des rapports fonctionnent
  avec `@huggingface/transformers` 4.3.2. Ce test ne dit **rien** sur la qualité d'un vrai modèle.

## Ce qui n'a PAS été vérifié

- Aucun vrai modèle n'a été chargé : aucune mesure de qualité, de temps ni de mémoire n'existe.
- La page navigateur (`browser/`) n'a pas été ouverte dans un navigateur (pas de navigateur local dans
  l'environnement). Le serveur démarre et sert bien `/api/models`, `/ort/*.wasm`, `/corpus/*`, le worker et
  les en-têtes d'isolation ; le build Vite passe. Le reste (WASM, multi-thread, WebGPU, CSP) est à confirmer.
- Les tokenizers des dépôts candidats avec la version 4.3.2 de Transformers.js (voir « Risques »).

## Reconstruction des positions (point technique important)

Dans `@huggingface/transformers` 4.3.2, `pipeline('token-classification')` **ne renvoie pas `start`/`end`** :
le code source contient `// TODO: Add support for start and end`. Avec `aggregation_strategy: "simple"`, on
obtient seulement `{ entity_group, word, score }`, où `word` est le texte **décodé** par le tokenizer
(casse, accents et espaces possiblement altérés). Vérifié dans
`node_modules/@huggingface/transformers/src/pipelines/token-classification.js`.

`lib.mjs` reconstruit donc les positions : `word` est cherché dans le texte original, à partir de la fin de
l'entité précédente, sur une copie normalisée (sans espaces, diacritiques ni casse, apostrophes et tirets
unifiés) avec table de correspondance vers les indices UTF-16 d'origine (règle R7). Une occurrence alignée
sur des frontières de mots est préférée. Si une version future renvoie `start`/`end` valides, ils sont
utilisés tels quels. Le rapport indique combien d'entités viennent de chaque source, et combien n'ont pas pu
être localisées. Limite connue : la reconstruction suppose que les groupes arrivent dans l'ordre du texte (c'est le cas dans
le code source lu, non vérifié sur un vrai modèle) ; un groupe introuvable est compté, pas deviné.

Le pipeline tronque à 512 jetons : les textes longs sont découpés en morceaux de 1000 caractères au plus
(coupés après un espace). Une entité à cheval sur deux morceaux est donc coupée ; c'est une limite du spike,
à traiter dans `src/ner` (T3.x) par un chevauchement des morceaux.

## Corpus

`corpus/ner-fr.jsonl` et `corpus/ner-en.jsonl` : 150 phrases synthétiques chacune, une ligne JSON par phrase
`{"id", "text", "entities": [{"start", "end", "type"}]}`, positions en unités UTF-16, fin exclue.
Noms inventés (des combinaisons courantes peuvent par hasard désigner de vraies personnes ; aucune ne vise
quelqu'un). Les lieux et quelques organisations (Swisscom, Orange, Apple, La Poste) sont réels, par nature.

L'identifiant porte le type de phrase : `fr-017-std`. Types : `std` (16), `swiss` (10), `foreign` (12),
`first` prénoms seuls (9), `lower` minuscules (9), `email` (12), `title` M./Mme/Dr (11), `org` SA/Sàrl/SAS/GmbH
(12), `commune` romandes et françaises (12), `accent` (5), `emoji` (8), `none` sans entité (12), `trap` pièges (22).
Au total 9 phrases avec emoji et 20 sans entité par langue.

Conventions d'annotation (à garder en tête en lisant les résultats) :
- le titre (M., Mme, Dr, Me, Pr, Mr…) n'est **pas** dans l'entité ;
- la forme juridique (SA, Sàrl, SAS, GmbH, Ltd…) **est** dans l'entité ;
- seuls PERSON, ORGANIZATION et LOCATION sont annotés ; un MISC prédit est ignoré (ni gain ni pénalité) ;
- pièges : « Rose », « Pierre » (prénom ou matériau), « Orange » (opérateur ou couleur/fruit), « Will », « Bill »,
  « Mark » (verbe ou prénom), « Jordan » (prénom ou pays), « Apple »… L'annotation suit le sens de la phrase.
  Certains cas sont discutables par nature (prénom seul en début de phrase, nom d'enseigne) ;
- le corpus est petit (≈ 125 PERSON par langue) : un écart de quelques points de rappel n'est pas significatif.

## Candidats

Sources consultées le 2026-11-16 (pages Hugging Face, via lecture de page). **V** = lu sur la page citée ;
**NV** = non vérifié (mémoire ou déduction). Les tailles sont celles affichées par Hugging Face (décimales).

| # | Dépôt à télécharger (ONNX) | Modèle d'origine | Langues | Licence annoncée | Poids quantifié | Format Transformers.js |
|---|---|---|---|---|---|---|
| 1 | [`Xenova/distilbert-base-multilingual-cased-ner-hrl`](https://huggingface.co/Xenova/distilbert-base-multilingual-cased-ner-hrl) | `Davlan/distilbert-base-multilingual-cased-ner-hrl` (DistilBERT multilingue, 135 M paramètres) | ar, de, en, es, fr, it, lv, nl, pt, zh | AFL-3.0 sur le modèle d'origine (V, via un agrégateur) ; aucune licence sur le dépôt Xenova (V) | `model_quantized.onnx` 135 Mo (V) + tokenizer 2,9 Mo → ≈ 138 Mo | Oui : `onnx/` + `tokenizer.json` (V) |
| 2 | [`Xenova/camembert-ner`](https://huggingface.co/Xenova/camembert-ner) | `Jean-Baptiste/camembert-ner` (CamemBERT, entraîné sur wikiner-fr) | fr | MIT sur le modèle d'origine (V) ; aucune licence sur le dépôt Xenova (V) | `model_quantized.onnx` 111 Mo (V) + tokenizer 2,4 Mo + `sentencepiece.bpe.model` 0,8 Mo → ≈ 114 Mo | Oui : `onnx/` + `tokenizer.json` (V). Étiquettes PER/ORG/LOC/MISC |
| 3 | [`jiting/xlm-roberta-base-ner-hrl_onnx`](https://huggingface.co/jiting/xlm-roberta-base-ner-hrl_onnx) (conversion tierce, non officielle) | `Davlan/xlm-roberta-base-ner-hrl` (XLM-RoBERTa base, 0,3 Md paramètres) | mêmes 10 langues | AFL-3.0 (V, dépôt tiers et modèle d'origine) | `model_quantized.onnx` **279 Mo** (V) : dépasse la cible de 150 Mo | Annoncé compatible (V, carte du modèle) ; présence de `tokenizer.json` NV (listing racine non lu) |
| 4 | [`Xenova/bert-base-multilingual-cased-ner-hrl`](https://huggingface.co/Xenova/bert-base-multilingual-cased-ner-hrl) | `Davlan/bert-base-multilingual-cased-ner-hrl` (mBERT) | mêmes 10 langues | AFL-3.0 sur le modèle d'origine (V) ; aucune licence sur le dépôt Xenova (V) | `model_quantized.onnx` **178 Mo** (V) : dépasse la cible de 150 Mo | Oui (V) |
| 5 | [`promptshield/miniscule`](https://huggingface.co/promptshield/miniscule) (dérivé tiers de n° 4, vocabulaire élagué) | n° 4 avec vocabulaire réduit de 119 547 à 68 875 jetons | de, en, es, fr, it, lv, nl, pt (plus d'arabe ni de chinois) | AFL-3.0 (V, carte du modèle) | 139,6 Mo annoncés par l'auteur (V : c'est une affirmation de la carte, non mesurée) | Annoncé compatible `pipeline` q8 (V : affirmation de la carte). Étiquettes PER/ORG/LOC/DATE |
| 6 | [`cmarkea/distilcamembert-base-ner`](https://huggingface.co/cmarkea/distilcamembert-base-ner) | lui-même (DistilCamemBERT, 67,5 M paramètres, wikiner_fr) | fr | MIT (V) | `model_quantized.onnx` 143 Mo (V) | **Conversion/réorganisation nécessaire** : ONNX à la racine (pas dans `onnx/`), pas de `tokenizer.json` (V, listing des fichiers) |
| 7 | `JusteLeo/ALBERT-base-v2-french-ner` | lui-même (ALBERT-base-v2, wikiner_fr) | fr | Apache-2.0 (V) | ≈ 45 Mo annoncés (V, carte) ; F1 annoncé 0,83 (V, carte) | NV : ONNX annoncé « compatible ONNX Runtime », compatibilité Transformers.js et type de modèle `albert` en classification de jetons non vérifiés |
| — | `riidact/ner-multilingual` | affiné sur `numind/NuNER-multilingual-v0.1` (MIT) | 103 annoncées | **CC-BY-NC-4.0** (V) : non redistribuable pour Lessive | 178 Mo (V) | Oui (V). **Écarté sur la licence** |

Pour les trois modèles minimum demandés par le plan : multilingue distillé = n° 1 ; français = n° 2 ; XLM-RoBERTa = n° 3.
Recommandation d'ordre de mesure : **1, 2, 6, 5**, puis 3 et 4 comme références de qualité (hors cible de poids).

Sur les licences, à ne pas prendre pour acquis :
- La licence **AFL-3.0** (n° 1, 3, 4, 5) est permissive, mais sa compatibilité avec une distribution sous
  Apache 2.0 est une question juridique que cet agent ne tranche pas. Mentionner le modèle dans `NOTICE`
  avec le texte de licence est probablement nécessaire. **À valider par Nico.**
- La carte `Davlan/xlm-roberta-base-ner-hrl` liste ses données d'entraînement (V) : notamment CoNLL 2003
  (anglais, allemand) et Europeana Newspapers (français). Que ces corpus restreignent la redistribution des
  poids dérivés est **NV** (connaissance générale : CoNLL 2003 repose sur des dépêches Reuters à usage de
  recherche). À vérifier avant toute redistribution des n° 1, 3, 4, 5.
- n° 2 et 6 : MIT sur le modèle, mais entraînés sur `wikiner` (Wikipédia) ; les conditions de réutilisation
  de ce jeu de données sont NV.
- Les dépôts Xenova n'affichent aucune licence : on suppose qu'ils héritent du modèle d'origine (NV).

### GLiNER multilingue : utilisable avec Transformers.js ?

**Pas via `pipeline('token-classification')`.** GLiNER n'est pas un classifieur de jetons : il prend en entrée
le texte et une liste d'étiquettes libres (« person », « organization »…), avec un pré/post-traitement propre.
Constats :
- Des exports ONNX existent : `onnx-community/gliner_multi` (base `urchade/gliner_multi`, licence non affichée
  sur la page, V) et `onnx-community/gliner_multi-v2.1` (aucune licence affichée, V). La licence Apache-2.0 est
  affichée sur `urchade/gliner_multi-v2.1` (V), pas sur les dépôts ONNX de la communauté.
- Taille : `onnx-community/gliner_multi`, `model_quantized.onnx` = **352 Mo** (V) : plus de deux fois la
  cible de 150 Mo. La taille de `gliner_multi-v2.1` n'a pas pu être lue (NV ; architecture a priori identique).
- Intégration : une discussion sur `onnx-community/gliner_multi_pii-v1` indique que ce n'est « pas trivial » et
  qu'il faut porter le code Python de GLiNER (V). Il existe un paquet npm communautaire `gliner` (0.0.19,
  licence MIT, V via `npm view`) qui utilise `onnxruntime-web` 1.19.2 et `@xenova/transformers` 2.17.2
  (ancienne génération de la bibliothèque), avec les backends `wasm`, `webgpu` et `webgl` (V, README du paquet).
  L'adopter ajouterait une dépendance hors du budget R9 (Svelte, `@huggingface/transformers`, Zod) et un second
  runtime ONNX : **il faudrait l'accord de Nico**, ou un portage maison du pré/post-traitement.
- Conclusion provisoire : **non retenu pour S1** (hors pipeline, trop lourd, licences ONNX à clarifier). Une
  variante « small » monolingue anglaise existe probablement mais ne répond pas au besoin français (NV). À
  réévaluer si aucun modèle de classification de jetons n'atteint 0,85 de rappel PERSON en français.

## Télécharger les modèles dans `models/`

À lancer **sur la machine de Nico**, depuis la racine du dépôt. Chaque modèle va dans
`models/<organisation>/<nom>/`, avec seulement les fichiers nécessaires (config, tokenizer, un seul `.onnx`).
Je n'ai pas pu exécuter ces commandes (réseau) : si une option a changé dans votre version de
`huggingface_hub`, `hf download --help` donne la syntaxe actuelle (l'ancien nom de l'outil est `huggingface-cli`).

```bash
pip install -U "huggingface_hub[cli]"

dl() {  # dl <dépôt> [fichier.onnx]   -> models/<dépôt>/
  hf download "$1" --local-dir "models/$1" \
    --include "config.json" "tokenizer.json" "tokenizer_config.json" "special_tokens_map.json" \
              "vocab.txt" "sentencepiece.bpe.model" "onnx/${2:-model_quantized.onnx}"
}

dl Xenova/distilbert-base-multilingual-cased-ner-hrl     # n° 1
dl Xenova/camembert-ner                                  # n° 2
dl jiting/xlm-roberta-base-ner-hrl_onnx                  # n° 3 (279 Mo, référence)
dl Xenova/bert-base-multilingual-cased-ner-hrl           # n° 4 (178 Mo, référence)
dl promptshield/miniscule                                # n° 5 (dérivé tiers : relire la carte)
```

Équivalent avec git (si vous préférez) pour un modèle :

```bash
GIT_LFS_SKIP_SMUDGE=1 git clone https://huggingface.co/Xenova/camembert-ner models/Xenova/camembert-ner
git -C models/Xenova/camembert-ner lfs pull --include="onnx/model_quantized.onnx"
```

Le n° 6 (`cmarkea/distilcamembert-base-ner`) demande une adaptation (commandes **non testées**) : le `.onnx` est
à la racine du dépôt et il n'y a pas de `tokenizer.json`.

```bash
hf download cmarkea/distilcamembert-base-ner --local-dir models/cmarkea/distilcamembert-base-ner \
  --include "config.json" "tokenizer_config.json" "sentencepiece.bpe.model" "vocab.txt" "model_quantized.onnx"
mkdir -p models/cmarkea/distilcamembert-base-ner/onnx
mv models/cmarkea/distilcamembert-base-ner/model_quantized.onnx models/cmarkea/distilcamembert-base-ner/onnx/
# générer tokenizer.json (nécessite : pip install transformers sentencepiece)
python -c "from transformers import AutoTokenizer as T; T.from_pretrained('cmarkea/distilcamembert-base-ner').save_pretrained('models/cmarkea/distilcamembert-base-ner')"
```

Vérifier ensuite que chaque dossier contient `config.json`, `tokenizer.json` et `onnx/*.onnx`
(la structure attendue est décrite dans `models/README.md`), puis `npm run eval`.

## Mesure navigateur (à la main)

```bash
cd spikes/ner
npm run browser          # ou : CSP=1 npm run browser   (ajoute la CSP du projet, non testée)
```

Ouvrir http://127.0.0.1:5173 (port affiché par Vite) dans Chrome, puis Firefox si possible.

1. Choisir le modèle (la liste vient de `models/`), la précision (`q8` par défaut), le backend (`wasm`), les threads.
2. **Charger** : la page affiche le temps de chargement, le nombre de threads effectif et si l'isolation
   inter-origines est active (nécessaire au WASM multi-thread ; les en-têtes COOP/COEP sont ajoutés par le serveur).
3. **Détecter** sur le texte saisi : les entités sont surlignées ; le tableau donne début/fin et le texte
   à `[début, fin[`. Vérifier à l'œil les accents et l'emoji (positions UTF-16, règle R7).
4. **Texte de 5000 caractères** : trois essais, médiane affichée (critère ≤ 5 s). Le premier essai inclut
   l'échauffement du moteur WASM ; noter les trois valeurs.
5. Contrôle R1 : la ligne « Requêtes hors origine » doit valoir **0**. Transformers.js va par défaut chercher
   ses fichiers WASM sur un CDN ; le worker les redirige vers `/ort/` (servi depuis `node_modules`). Si la ligne
   n'est pas à 0, c'est un défaut à signaler.
6. Reporter à la main dans l'ADR : temps de chargement, médiane 5000 caractères, navigateur et version,
   machine, nombre de threads, mémoire (onglet Mémoire des outils de développement ; la page affiche le tas JS
   sous Chrome seulement).

Pour comparer un seul thread et plusieurs, changer « Threads » puis recharger. Le cache du navigateur est
désactivé dans le worker afin que le temps de chargement soit un vrai chargement.

## Sortie de `npm run eval`

Pour chaque modèle : `results/<org>__<nom>.md` (tableaux) et `.json` (tout, y compris la liste des phrases
dont la prédiction diffère de l'annotation, avec positions mais **sans texte**). Contenu : temps de
chargement ; temps moyen et p95 par phrase ; temps pour un texte d'environ 5000 caractères (médiane de
3 essais, découpé en morceaux de 1000) ; mémoire RSS avant/après chargement et pic ; tailles des fichiers ;
précision/rappel/F1 par catégorie (PERSON, ORGANIZATION, LOCATION), micro-moyenne et détection « sans égard
au type », par langue, en correspondance exacte **et** par recouvrement ; rappel par type de phrase ; origine
des positions ; tableau des critères de l'ADR.

Les mesures de temps et de mémoire sont faites sous Node (onnxruntime-node natif) : elles sous-estiment ou
sur-estiment le navigateur (WASM), d'où la mesure navigateur à la main.

## Dépendances (R9)

| Paquet | Version | Licence | Pourquoi |
|---|---|---|---|
| `@huggingface/transformers` | 4.3.2 (exacte ; dernière version publiée au 2026-11-16) | Apache-2.0 | Le moteur NER prévu pour le produit (budget d'exécution R9). Le spike le teste tel quel. |
| `vite` | 8.3.8 (exacte, même version que la racine) | MIT | Sert la page de mesure navigateur (worker ES, serveur local). Dépendance de développement. |

Rien d'autre : tests avec `node:test`, accès disque et horloge avec les modules intégrés de Node, pas de
bibliothèque de métriques ni de CLI. Dépendances transitives notables, vérifiées dans `node_modules` :
`onnxruntime-node` 1.30.0 (MIT), `onnxruntime-web` 1.31.0-dev (MIT), `@huggingface/tokenizers` 0.2.0
(Apache-2.0), `@huggingface/jinja` (MIT) et `sharp` 0.35.5 (Apache-2.0). **Point d'attention** : `sharp` tire
sous Node les binaires `@img/sharp-libvips-*`, sous **LGPL-3.0-or-later**. Ils ne sont pas inclus dans un build
navigateur, mais il faudra le garder en tête pour `src/ner` si le NER tourne un jour sous Node (CLI).

## Risques et points incertains

- Les tokenizers des dépôts candidats n'ont pas été testés avec `@huggingface/tokenizers` 0.2.0 (4.3.2 de
  Transformers.js). Un `tokenizer.json` incompatible produirait une erreur au chargement : `eval.mjs` la
  signale par modèle et continue avec les suivants.
- L'effet de l'agrégation `simple` de la version 4.3.2 sur les entités à cheval sur plusieurs mots n'a été lu
  que dans le code source, pas observé sur un vrai modèle.
- Le corpus est synthétique et court ; les scores ne prédisent pas la performance sur des courriels réels.
- Les résultats de modèles entraînés sur des textes de presse (Davlan) peuvent être faibles sur les phrases
  courtes, les minuscules et les prénoms seuls ; c'est précisément ce que le corpus teste.
