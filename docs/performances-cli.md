# Performances du CLI

Mesures de la V1 du CLI le 19 novembre 2026, sans NER puis avec CamemBERT local sur CPU q8. Le binaire compilé est exécuté dans un nouveau processus pour chaque taille, avec lecture d'un fichier UTF-8 synthétique et écriture par `--output`. Le temps comprend l'initialisation des packs, le chargement du modèle lorsqu'il est demandé, le traitement, les écritures et la publication du fichier final. Une taille de `0` mesure une exécution complète sur entrée vide : initialisation et libération, sans inférence.

## Reproduire

```bash
npm run build:cli
node scripts/perf/measure-cli.ts
node scripts/perf/measure-cli.ts --sizes 10,100,200
node scripts/perf/measure-cli.ts --sizes 0,1,10 --ner models/Xenova/camembert-ner
```

Le script ne lit aucune donnée utilisateur : il génère des lignes ASCII de 1 000 octets, contenant chacune un courriel synthétique `@example.org` et du remplissage sans entité. Les tailles demandées, en Mo décimaux, sont arrondies à la ligne complète supérieure. Entrée synthétique, sortie transformée et module de mesure sont créés dans un dossier temporaire puis supprimés à la fin. Aucun texte traité n'est imprimé dans les résultats.

La durée est mesurée par le processus parent. Un module temporaire chargé avec `node --import` relève `process.resourceUsage().maxRSS` à la sortie du processus enfant : il s'agit du pic de mémoire résidente du CLI en Kio, et non d'un échantillonnage du seul tas JavaScript. La génération du fichier d'entrée et le processus parent sont exclus des mesures.

## Résultats sans NER

Environnement : Apple M5, macOS/Darwin 27.0.0, Node v26.13.1. Un passage par taille ; cache du système de fichiers et charge de la machine non contrôlés.

| Entrée | Lignes | Durée | Débit | Pic RSS du CLI |
|---|---:|---:|---:|---:|
| 10 000 000 octets (10 Mo) | 10 000 | 2,76 s | 3,63 Mo/s | 118 240 Kio |
| 100 000 000 octets (100 Mo) | 100 000 | 24,90 s | 4,02 Mo/s | 146 800 Kio |

La taille d'entrée est multipliée par dix et le pic RSS observé par environ 1,24. Ces deux mesures sont compatibles avec le traitement progressif ; elles ne constituent pas une garantie de plafond RSS. Le ramasse-miettes, l'allocation des objets de détection, les packs et le runtime Node contribuent aussi à la mémoire résidente. Le débit dépend du contenu et de la densité d'entités : ce remplissage synthétique ne représente pas tous les logs.

## Ce qui borne le travail en attente

La lecture d'un fichier utilise des blocs de 64 Kio. `readLines` conserve le bloc courant et la ligne en construction ; la limite de ligne est de 200 000 unités UTF-16, avec un CR terminal éventuellement retenu en attente de LF. L'analyse et l'écriture sont attendues avant de demander la ligne suivante. Aucune file cumulative de lignes ou de détections n'est créée ; les noms ne sont pas retenus d'une ligne à l'autre. Les packs et l'analyseur sont initialisés une seule fois.

La sortie fichier attend chaque écriture. La sortie standard attend également le callback de chaque écriture : un consommateur lent ralentit donc le traitement en amont. Les tests de flux vérifient cette absence d'anticipation ; le benchmark mesure le cas fichier, sans consommateur artificiellement ralenti.

## Mesure avec NER CPU q8

Modèle : `models/Xenova/camembert-ner`, présent localement, et runtime natif `onnxruntime-node` 1.30.0. Le même corpus de lignes de 1 000 octets est utilisé. Aucun téléchargement ni changement du moteur n'est effectué.

La référence sur entrée vide sans NER atteint 81 648 Kio de pic RSS en 0,23 s. Avec NER, l'entrée vide permet d'isoler le coût d'initialisation et de libération ; son pic RSS inclut aussi les allocations transitoires du chargement. Ce pic ne représente pas à lui seul la mémoire résidente stabilisée du modèle.

| Entrée | Lignes | Durée | Débit | Pic RSS du CLI |
|---|---:|---:|---:|---:|
| Vide (initialisation seule) | 0 | 0,43 s | — | 1 119 424 Kio |
| 1 000 000 octets (1 Mo) | 1 000 | 69,20 s | 0,01445 Mo/s | 1 176 640 Kio |
| 10 000 000 octets (10 Mo) | 10 000 | 693,19 s (11 min 33 s) | 0,01443 Mo/s | 1 179 376 Kio |

Les trois exécutions ont réussi (code 0). Le coût par ligne reste proche de 69 ms sur 1 et 10 Mo. À 10 Mo, ce passage est environ 251 fois plus lent que le relevé sans NER de 2,76 s sur le même corpus ; ces passages ne sont pas simultanés ni répétés et la charge de la machine n'est pas contrôlée.

Le pic RSS de 10 Mo est d'environ 1,12 Gio et reste proche de celui de 1 Mo (+0,23 %). Deux relevés ponctuels avec `ps` pendant le passage de 10 Mo donnent 482 736 Kio à 2 min 22 s et 371 728 Kio à 5 min 53 s. Ils montrent que le pic de chargement ne correspond pas à la résidence courante durant tout le traitement ; ils ne constituent pas une mesure continue ni une garantie de plafond mémoire.

Le passage de 100 Mo avec NER n'a pas été exécuté. Le passage de 100 Mo sans NER est documenté plus haut. L'essai WebGPU, reporté le 19 novembre, a été réalisé le 20 novembre ; voir la comparaison courte ci-dessous.

## Limites des mesures

Les longues suites de `x` du remplissage ne représentent pas la distribution de jetons d'un log habituel. Les mesures portent sur ce corpus et ne prédisent pas le débit sur d'autres données. Il reste à comparer des contenus et longueurs de lignes variés. Aucun seuil minimal de débit n'est fixé à partir de ce premier relevé.

Le CLI V1 impose le CPU. Aucun résultat GPU n'est inclus dans les chiffres du CLI CPU ci-dessus. Le fournisseur CoreML n'a pas été essayé.

## Comparaison courte CPU et WebGPU — 20 novembre 2026

Même Mac Apple M5, Node v26.13.1, `onnxruntime-node` 1.30.0 et modèle CamemBERT local q8. Essai reproductible :

```bash
node scripts/perf/compare-ner-devices.ts cpu
node scripts/perf/compare-ner-devices.ts webgpu
```

Le script appelle directement l'adaptateur NER existant, sans les packs ni les entrées/sorties du CLI. Il bloque `fetch`, désactive les caches persistants de Transformers.js et lit les fichiers locaux par la même source confinée que le CLI. Une phrase synthétique contenant une personne doit produire une détection `PERSON` ; cette vérification réussit sur CPU et WebGPU. Ce contrôle ne remplace pas une évaluation de qualité sur corpus.

Chaque processus charge une seule fois le modèle, effectue une inférence sur la phrase puis un échauffement sur la ligne de benchmark. Trois séries de 20 lignes sont ensuite chronométrées, séquentiellement. Chaque ligne contient les mêmes 999 caractères que dans le benchmark CLI (1 000 octets avec LF), notamment le remplissage en `x`. Les durées ci-dessous excluent le chargement et l'échauffement.

| Appareil demandé | Série 1, ms/ligne | Série 2 | Série 3 | Médiane | Pic RSS du processus |
|---|---:|---:|---:|---:|---:|
| CPU | 56,35 | 56,94 | 56,85 | 56,85 | 1 128 848 Kio |
| WebGPU | 145,97 | 144,55 | 151,72 | 145,97 | 1 251 984 Kio |

Le chemin WebGPU charge le modèle q8 et exécute les inférences, mais sa médiane est environ **2,57 fois plus lente** que celle du CPU dans cet essai. Les deux essais comparés ont été exécutés hors du bac à sable avec les mêmes permissions. Le premier essai WebGPU dans le bac à sable échouait à obtenir un adaptateur (`No supported adapters`) ; la relance avec accès au GPU fonctionne.

Il ne s'agit ni d'un benchmark GPU sur 10 Mo, ni d'une preuve que tous les opérateurs ont été placés sur le GPU : le placement et les éventuels replis sur CPU n'ont pas été profilés. Le coût des transferts, l'effet des petites inférences séquentielles et la compatibilité des opérateurs q8 restent à analyser avant de conclure sur la cause du ralentissement. Les résultats ne prédisent pas les performances avec un autre modèle, une autre précision, un traitement par lots ou des logs plus représentatifs. Aucun gain GPU ni réduction de mémoire n'est démontré ici. Le CLI reste configuré sur CPU.
