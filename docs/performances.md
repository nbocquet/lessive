# Performances

**Portée des chiffres :** mesures historiques avec DistilBERT, antérieures au choix de CamemBERT pour la version publiée (ADR 0004). Les verdicts ci-dessous concernent ces essais ; ils ne valident pas les performances du build actuel avec CamemBERT. Une nouvelle série de mesures avec CamemBERT reste à faire.

Ce document rapporte des mesures faites **sous Node**, sur le moteur seul, et dit clairement ce qu'elles ne couvrent pas : les mesures dans le navigateur sont **qualitatives** : le 17 novembre 2026, un essai manuel a constaté que l'analyse du texte de 5 000 caractères (`docs/fixtures/texte-5000.txt`), modèle chargé, reste dans la cible dans **Firefox et Safari**, sans relever de chiffres. La procédure pour des mesures chiffrées est plus bas ; les tableaux à remplir sont prêts.

## En bref

| Objectif | Résultat | Verdict |
|---|---|---|
| Analyse de 5 000 caractères en 5 s au plus, modèle chargé | 0,33 s sous Node (règles et NER) ; ≈ 3,1 s dans Chrome headless (recette) ; conforme dans Firefox et Safari selon l'essai manuel du 17 novembre 2026 (chiffres non relevés). | **Atteint** (constat qualitatif dans les navigateurs) |
| Interface jamais bloquée plus de 100 ms | L'analyse (règles et NER) tourne dans un worker, donc hors du fil principal. Le travail restant sur la page reste sous 30 ms jusqu'à 20 000 caractères. À 100 000 caractères, la transformation seule prend environ 150 ms. Le rendu de la page n'est pas mesuré. | **Atteint par conception jusqu'à 20 000 caractères sous Node, non mesuré dans le navigateur, dépassé à 100 000 caractères** |

## Ce qui est mesuré, et ce qui ne l'est pas

Mesuré (script `scripts/perf/measure.ts`) : les étapes du moteur, exécutées sous Node avec les mêmes fonctions que l'application. Le NER utilise `onnxruntime-node` sur CPU (`device: "cpu"`) avec le modèle recommandé `Xenova/distilbert-base-multilingual-cased-ner-hrl`, version quantifiée.

Non mesuré :

- **Le navigateur** : l'application exécute le NER avec ONNX Runtime Web en WebAssembly, avec un seul fil de calcul (réglage de l'application, voir `src/web/ner-provider.ts`). C'est plus lent que le moteur natif de Node ; l'écart n'est pas connu. C'est la mesure qui compte pour le produit.
- Le rendu de la page (surlignage des détections, listes, aperçus) : le script mesure la logique de découpage, pas l'affichage.
- La mémoire du navigateur.
- La chronologie réelle d'un clic sur « Analyser » jusqu'à l'affichage.

Les textes d'essai sont synthétiques et déterministes : phrases du corpus `corpus/ner-fr.jsonl`, phrases à noms, courriels, IBAN, numéros AVS, téléphones et dates fabriqués (clés de contrôle calculées), et phrases sans donnée personnelle. La densité de données personnelles est volontairement élevée (environ 1 détection pour 55 à 70 caractères), plus qu'un courriel ordinaire.

## Machine et conditions

| | |
|---|---|
| Processeur | Intel Xeon à 2,10 GHz, 2 cœurs |
| Mémoire | 8 Go de RAM |
| Système | Linux x64 |
| Exécution | Node 22.23.4 (V8 12.4) |
| Règles actives | 86 (tous les packs livrés), chargés et compilés en 71 ms |
| Modèle | `Xenova/distilbert-base-multilingual-cased-ner-hrl` (q8), chargé en 625 ms |
| Répétitions | 5 par mesure (3 au plus au-delà de 50 000 caractères), après un essai de chauffe non compté |

Valeurs : médiane (minimum–maximum), en millisecondes. Un « Mo » vaut 1 048 576 octets.

**Réserve sur la fiabilité.** La machine était partagée avec d'autres tâches (compilations et tests lancés en parallèle). Les maxima sont donc bruités. Deux séries complètes ont été faites ; elles concordent à quelques pour cent près sur les valeurs centrales (à 5 000 caractères : NER seul 299 ms et 307 ms, règles et NER 355 ms et 335 ms). Les tableaux ci-dessous sont ceux de la dernière série. Les chiffres de cette page sont des ordres de grandeur sur une petite machine, pas un banc d'essai.

## Résultats sous Node

### Analyse

| Taille visée | Longueur réelle | Détections retenues (règles seules) | Règles seules (ms) | NER seul (ms) | Règles et NER (ms) |
|---:|---:|---:|---|---|---|
| 1 000 | 999 | 10 | 2,06 (1,8–10,0) | 84,7 (81,5–94,7) | 89,4 (61,6–96,3) |
| 5 000 | 4 985 | 44 | 5,13 (4,7–6,5) | 307,0 (299,2–451,6) | 334,8 (319,4–443,7) |
| 20 000 | 19 999 | 284 | 20,9 (20,5–46,5) | 1 363,9 (1 272,9–1 444,1) | 1 968,9 (1 528,0–2 199,5) |
| 100 000 | 99 998 | 1 274 | 121,4 (101,3–173,3) | 8 410,2 (7 548,7–9 920,5) | 9 344,4 (7 002,4–9 791,2) |

Le NER est découpé en segments de 1 000 caractères avec 100 caractères de recouvrement (valeurs par défaut de `src/ner/options.ts`) : son temps croît donc à peu près proportionnellement à la longueur, à environ 60 à 85 ms par millier de caractères sur cette machine. Les règles croissent aussi proportionnellement, environ 1,2 ms par millier de caractères.

Détections retenues au total, règles et NER ensemble : 16 (1 000 caractères), 72 (5 000), 390 (20 000), 1 849 (100 000).

### Travail exécuté sur le fil principal de la page (hors rendu)

Dans le code actuel, la transformation, la réidentification et la préparation des aperçus sont appelées depuis la page, pas depuis le worker. Le résultat de l'analyse arrive du worker par `postMessage` : la colonne « transfert » mesure `structuredClone` du résultat, qui est la copie que la page paie à la réception.

| Taille visée | Transformation, mode Pseudonymisation (ms) | Réidentification (ms) | Découpage du surlignage et des aperçus (ms) | Aperçu de réidentification (ms) | Transfert worker vers page (ms) | Jetons remis |
|---:|---|---|---|---|---|---:|
| 1 000 | 0,26 (0,2–0,3) | 0,11 (0,1–0,1) | 0,02 (0,0–0,0) | 0,01 (0,0–0,2) | 0,07 (0,1–0,1) | 15 |
| 5 000 | 2,44 (2,4–3,5) | 0,58 (0,4–1,4) | 0,07 (0,1–0,1) | 0,02 (0,0–0,0) | 0,19 (0,2–0,2) | 70 |
| 20 000 | 25,1 (19,5–27,2) | 1,28 (1,2–1,4) | 0,36 (0,4–1,3) | 0,11 (0,1–0,1) | 1,04 (1,0–1,2) | 377 |
| 100 000 | 152,0 (137,0–154,8) | 15,4 (8,0–26,9) | 3,51 (0,5–5,5) | 0,54 (0,5–2,3) | 4,79 (4,7–5,1) | 1 818 |

La première exécution à froid est plus lente que les médianes ci-dessus (essai de chauffe exclu) : une sonde ponctuelle sur le texte de 100 000 caractères a donné 235 ms au premier passage de la transformation, contre 85 à 120 ms ensuite.

### Détecteurs les plus coûteux (texte de 100 000 caractères, un passage)

| Détecteur | ms |
|---|---:|
| `lang-fr-en/prenoms-ambigus` | 25,1 |
| `lang-fr-en/prenoms` | 20,7 |
| `dates/fr-weekday-long-d1` | 15,3 |
| `lang-fr-en/noms-famille-ambigus` | 13,3 |
| `lang-fr-en/noms-famille` | 12,8 |
| `lang-fr-en/titres-prenom-particule` | 8,7 |
| `lang-fr-en/titres-nom` | 3,6 |
| `dates/en-mdy-d1` | 3,5 |
| `dates/fr-short-d2` | 2,5 |
| `lang-fr-en/titres-nom-particule` | 2,2 |

La somme de tous les détecteurs (136 ms) est égale, au bruit près, à l'analyse complète par règles (121 ms) : le contexte, la fusion des noms adjacents et la résolution des conflits ne pèsent presque rien. La ligne `dates/fr-weekday-long-d1` est un artefact de la série (elle était absente du classement de la série précédente, où le plus lent était `lang-fr-en/prenoms` à 25 ms).

### Export chiffré (PBKDF2-SHA-256, 600 000 itérations)

Table de 934 entités, fichier chiffré de 147,8 Ko.

| Opération | ms |
|---|---|
| Dérivation de clé seule | 109,6 (107,3–127,8) |
| Export : dérivation et chiffrement (`encryptSnapshot`) | 123,3 (117,5–183,1) |
| Import : dérivation et déchiffrement (`decryptSnapshot`) | 144,8 (132,4–149,3) |

Pendant ces opérations, la boucle d'événements de Node a subi un retard maximal de 27 ms : WebCrypto exécute la dérivation hors du fil JavaScript. Dans un navigateur sur un téléphone, 600 000 itérations prendront plus longtemps ; ce n'est pas mesuré. La durée ne dépend presque pas du nombre d'entités : elle est dominée par la dérivation de clé, voulue lente.

### Mémoire (processus Node)

| Point de mesure | RSS (Mo) | Tas JS (Mo) | Externe et tampons (Mo) |
|---|---:|---:|---:|
| Démarrage | 103 | 12 | 8 |
| Packs chargés | 118 | 17 | 8 |
| Modèle NER chargé | 375 | 40 | 24 |
| Après les mesures à 1 000 caractères | 396 | 41 | 36 |
| Après les mesures à 5 000 caractères | 415 | 42 | 115 |
| Après les mesures à 20 000 caractères | 539 | 39 | 352 |
| Après les mesures à 100 000 caractères | 637 | 46 | 10 |

Pic de mémoire résidente du processus : 649 Mo (exécution avec `--expose-gc`, donc avec ramasse-miettes forcé avant chaque relevé). Ce chiffre inclut Node, `onnxruntime-node` et ses tampons de travail : ce n'est pas la consommation du navigateur. Le modèle seul ajoute environ 257 Mo de mémoire résidente une fois chargé (375 contre 118), et le moteur de règles environ 15 Mo.

### Taille du build (`dist/`)

Le build par défaut ne contient pas de modèle (ADR 0003 et 0004) : il n'est donc pas compté dans `dist/`. Mesure sur un build fait à partir de l'état du dépôt au moment des mesures.

| Catégorie | Taille (Mo) | Compressé gzip (Mo) |
|---|---:|---:|
| JavaScript (page, worker d'analyse, Transformers.js, moteur NER) | 1,2 | 0,4 |
| CSS | 0,0 (14,4 Ko) | 3,2 Ko |
| HTML | 0,0 (1,5 Ko) | 0,8 Ko |
| ONNX Runtime Web (`dist/ort`) | 25,7 | 6,4 (le fichier `.wasm` seul est compressible) |
| Service worker (`sw.js`) | 0,0 (8,7 Ko) | 3,3 Ko |
| **Total** | **26,9** | |

| Fichier | Taille (Ko) | Gzip (Ko) |
|---|---:|---:|
| `assets/index-….js` (page) | 389,8 | 133,0 |
| `assets/analysis.worker-….js` (moteur, packs, worker) | 265,6 | 89,6 |
| `assets/transformers.web-….js` | 533,9 | 152,3 |
| `assets/transformers-engine-….js` | 5,7 | 2,7 |
| `assets/index-….css` | 14,4 | 3,2 |
| `ort/ort-wasm-simd-threaded.asyncify.wasm` | 26 232,2 | 6 533,5 |
| `ort/ort-wasm-simd-threaded.asyncify.mjs` | 51,8 | |

Les noms de fichiers JavaScript et CSS portent une empreinte qui change à chaque build. Le fichier `.wasm` d'ONNX Runtime représente 95 % du poids de l'application ; il n'est téléchargé qu'une fois si un hébergement sert les fichiers compressés (environ 6,4 Mo) et si le cache hors ligne le conserve.

## Comparaison aux cibles

### 5 000 caractères en 5 s au plus après chargement du modèle

- Sous Node : 0,33 s avec règles et NER (0,31 s pour le NER seul), soit environ 15 fois sous la cible. Le chargement du modèle, 0,6 s sous Node, n'est pas compté, conformément à la cible.
- Dans le navigateur : **non mesuré**. La marge de 15 fois est ce que le navigateur peut perdre par rapport à Node avant de dépasser 5 s. ONNX Runtime Web en WebAssembly sur un seul fil est plus lent que le moteur natif, et la machine de Nico peut différer de celle-ci. Ni la marge ni son insuffisance ne sont démontrées : seule la mesure du navigateur tranche.
- Pour mémoire, l'ADR 0001 range ce critère (C4) parmi ceux qui se jugent dans le navigateur.

### Interface jamais bloquée plus de 100 ms

- L'analyse complète (règles, NER, contexte, fusion, conflits) s'exécute dans le worker `analysis.worker.ts` : même à 100 000 caractères et 9 s de NER sous Node, le fil principal n'en est pas bloqué par le calcul.
- Sur le fil principal, restent la transformation, la réidentification, le découpage du surlignage, la réception du résultat, et l'affichage. Sous Node, hors affichage, le total reste sous 30 ms jusqu'à 20 000 caractères (25 ms pour la transformation à 20 000 caractères).
- **À 100 000 caractères, la transformation seule prend environ 150 ms (235 ms à froid) : elle dépasse la cible.** La limite d'entrée du moteur est de 200 000 caractères (`MAX_INPUT_LENGTH`) ; au-delà de 20 000 caractères, la cible n'est donc pas tenue sur cette machine. Les textes visés (courriels, comptes rendus) sont bien plus courts : 5 000 caractères représentent environ 2 pages.
- L'affichage (création des éléments surlignés pour des milliers de détections) n'est pas mesuré ; il peut être plus coûteux que le calcul. À vérifier dans le navigateur.
- L'export chiffré : la dérivation de clé est faite par WebCrypto, de façon asynchrone. À confirmer dans le navigateur.

## Goulots

1. **Le NER domine tout.** À 5 000 caractères : environ 300 ms sur 335, soit 90 % du temps ; les règles en prennent 5. Il est proportionnel à la longueur. Aucune optimisation n'a été tentée. Pistes (non essayées, ordre non mesuré) : réduire le recouvrement entre segments, ne repasser que les segments modifiés après une correction manuelle, WebGPU en option, modèle plus petit.
2. **La transformation en Pseudonymisation croît plus vite que la longueur** : ×10 pour une longueur ×4 (5 000 vers 20 000), ×6 pour ×5 (20 000 vers 100 000). Une sonde ponctuelle montre que le coût vient de la résolution des entités dans la session, pas du réassemblage du texte : sur le même texte de 100 000 caractères, le mode Masquage prend 13 à 39 ms contre 85 à 235 ms pour la Pseudonymisation. Cause exacte non investiguée. Piste : déplacer la transformation dans le worker, ou rendre la recherche d'entités indexée.
3. **Les dictionnaires de prénoms et de noms** pèsent environ la moitié du temps des règles (prénoms, prénoms ambigus, noms de famille, noms ambigus : environ 72 ms sur 136 à 100 000 caractères). Sans effet visible à 5 000 caractères (de l'ordre de quelques millisecondes).
4. **Le poids d'ONNX Runtime** (25,7 Mo) domine le premier chargement de l'application, avant même le modèle.
5. **Le modèle** : 138 Mo à télécharger et à charger une seule fois par l'utilisateur ; le chargement en mémoire du modèle prend 0,6 s sous Node, plus dans le navigateur (non mesuré). Il ajoute environ 257 Mo de mémoire résidente sous Node.

## Reproduire sous Node

```bash
ONNXRUNTIME_NODE_INSTALL=skip npm ci
ONNXRUNTIME_NODE_INSTALL=skip npm run build      # pour mesurer la taille de dist/
node --expose-gc scripts/perf/measure.ts --json /tmp/perf.json
```

Le modèle est cherché dans `models/` puis dans `/mnt/user-data/uploads/lessive/models/` ; sans lui, le NER n'est pas mesuré (ou avec `--no-ner`). Options, dont `--sizes`, `--runs`, `--dist`, `--kdf-runs` et `--write-texts` : en-tête de `scripts/perf/measure.ts`. Le script n'a aucune dépendance. `--expose-gc` n'est pas obligatoire ; sans lui, les relevés de mémoire sont moins nets. Le résultat est un rapport Markdown sur la sortie standard.

## Procédure de mesure dans le navigateur

À faire sur la machine et le navigateur que vous utilisez réellement, puis sur une machine plus modeste si possible. Compter une heure.

1. **Préparer.** Construire et servir l'application telle qu'elle sera publiée :

   ```bash
   ONNXRUNTIME_NODE_INSTALL=skip npm run build
   npm run preview
   ```

   Ouvrir l'adresse affichée dans un navigateur à profil neuf (aucune extension : elles faussent les mesures), avec un seul onglet ouvert.
2. **Texte de 5 000 caractères prêt à coller** : `docs/fixtures/texte-5000.txt` (compte rendu fictif : 46 personnes, adresses, téléphones, courriels, IBAN et AVS à clés valides ; 72 détections par les règles seules). Pour les autres tailles, **générer les textes d'essai** (rapide, sans NER), puis les ouvrir dans un éditeur pour les copier :

   ```bash
   node scripts/perf/measure.ts --no-ner --runs 1 --kdf-runs 1 --write-texts /tmp/lessive-textes
   ```

   Fichiers produits : `texte-1000.txt`, `texte-5000.txt`, `texte-20000.txt`, `texte-100000.txt`.
3. **Charger le modèle** : Réglages, « Charger le modèle depuis mon ordinateur », choisir le dossier du modèle recommandé. Noter le temps du premier chargement, puis recharger la page et noter si le modèle est retrouvé dans le cache du navigateur sans nouvelle sélection.
4. **Surveiller le fil principal.** Dans la console du navigateur (Chrome ou Edge ; Firefox ne propose pas cette interface, utiliser alors l'onglet « Performance »), coller :

   ```js
   window.__long = [];
   new PerformanceObserver((list) =>
     list.getEntries().forEach((e) => window.__long.push(Math.round(e.duration))),
   ).observe({ type: "longtask", buffered: true });
   ```

   Ce code n'enregistre que des durées : il ne touche pas au texte. Il liste toute tâche du fil principal de plus de 50 ms. Pour lire le résultat : `Math.max(0, ...window.__long)`, et pour repartir de zéro : `window.__long.length = 0`.
5. **Mesurer l'analyse.** Pour chaque taille, dans une page rechargée (premier essai, à froid) puis deux essais de plus (à chaud) : coller le texte, mode Pseudonymisation, langue Français, NER activé ; ouvrir l'onglet « Performance » des outils de développement, lancer l'enregistrement, cliquer sur « Analyser », arrêter l'enregistrement dès que les détections sont affichées. Relever :
   - la durée entre le clic et l'affichage des détections (c'est le temps d'analyse, à comparer à 5 s pour 5 000 caractères) ;
   - la plus longue tâche du fil principal (`Math.max(0, ...window.__long)`), à comparer à 100 ms ;
   - dans l'enregistrement, que le calcul du NER figure bien sur le fil du worker et non sur le fil principal.
6. **Mesurer le reste du parcours** sur le texte de 5 000 puis de 20 000 caractères : passage à l'écran « Résultat » (transformation, affichage), copie, collage de la réponse puis « Remettre les vrais noms », avec la plus longue tâche pour chaque étape.
7. **Mesurer l'export chiffré** : durée entre le clic sur « Exporter le fichier chiffré » et le téléchargement, et plus longue tâche pendant ce temps (la phrase de passe doit faire au moins 12 caractères ; utiliser une phrase d'essai).
8. **Mesurer la mémoire** : gestionnaire de tâches du navigateur (Chrome : Maj+Échap), mémoire de l'onglet avant chargement du modèle, après chargement, puis après l'analyse de 100 000 caractères.
9. **Vérifier l'absence de requête hors origine** pendant ces opérations : onglet « Réseau » des outils de développement, aucune ligne vers un autre domaine. Les tests de confidentialité (T6.1) font ce contrôle de façon automatique ; ceci n'est qu'un recoupement.

Tableau à remplir (un exemplaire par machine) :

Navigateur et version : ______ · Machine (processeur, cœurs, RAM) : ______ · Système : ______

| Taille | Analyse à froid (s) | Analyse à chaud, 2 essais (s) | Plus longue tâche du fil principal (ms) | Mémoire de l'onglet après (Mo) |
|---:|---|---|---|---|
| 1 000 | | | | |
| 5 000 | | | | |
| 20 000 | | | | |
| 100 000 | | | | |

| Opération | Durée (ms) | Plus longue tâche du fil principal (ms) |
|---|---|---|
| Premier chargement du modèle depuis le disque (138 Mo) | | |
| Rechargement du modèle depuis le cache du navigateur | | |
| Transformation et affichage du résultat, 5 000 caractères | | |
| Transformation et affichage du résultat, 20 000 caractères | | |
| Remettre les vrais noms, 5 000 caractères | | |
| Export chiffré | | |
| Import chiffré | | |

Reporter ensuite les résultats dans la section « Comparaison aux cibles » de ce document, et remplacer le verdict « Non établi » par le résultat de la mesure.
