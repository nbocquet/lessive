# Évaluation du NER et des packs (T3.4)

**Portée du rapport :** mesures historiques avec DistilBERT et les packs de cette évaluation. La version publiée fournit désormais CamemBERT-NER (ADR 0004, A21). Les chiffres ci-dessous ne valident ni ce modèle ni les ajouts ultérieurs aux packs. Une nouvelle évaluation est requise ; voir [la recette du MVP](recette-mvp.md#5-travail-restant-pour-clôturer-la-recette).

Rapport reproductible : toutes les valeurs ci-dessous sortent de `scripts/eval/evaluate.ts`, sans donnée réelle
(corpus synthétique `corpus/ner-fr.jsonl` et `corpus/ner-en.jsonl`, 150 phrases chacun).

## Reproduire

```bash
ONNXRUNTIME_NODE_INSTALL=skip npm ci
# modèle : models/Xenova/distilbert-base-multilingual-cased-ner-hrl/ (non versionné, voir models/README.md)
node --experimental-transform-types --disable-warning=ExperimentalWarning \
  scripts/eval/evaluate.ts --errors 40 --json /tmp/eval.json
```

Options : `--models <dossier>` (défaut : `models/`, puis `/mnt/user-data/uploads/lessive/models/`), `--json <fichier>`
(comptes bruts, minutes de chargement, exemples d'erreurs), `--errors <n>` (liste d'exemples d'erreurs).
`--experimental-transform-types` est nécessaire parce que `src/core` utilise des propriétés de paramètre de
constructeur, que le mode `--experimental-strip-types` refuse ; aucune dépendance n'est ajoutée. La sortie est
déterministe (deux exécutions identiques).

## Conditions de mesure

- Modèle : `Xenova/distilbert-base-multilingual-cased-ner-hrl`, poids q8 (ADR 0001, candidat n° 1), `minScore` du NER 0,5.
- Exécution : Node 22.23, `onnxruntime-node` (device `cpu`), 2 cœurs Xeon à 2,1 GHz. Ce n'est pas le chemin du
  navigateur (WASM) : les scores devraient être identiques (mêmes poids, même tokenizer), mais pas les temps.
  Voir T6.3 pour les performances navigateur. Pour mémoire : chargement du modèle ≈ 0,6 s, ≈ 5 ms par phrase
  sous Node ; ces chiffres ne valent pas pour le navigateur.
- Configurations :
  1. **Packs seuls** : `createAnalyzer` avec toutes les règles des cinq packs livrés (`country-ch`, `country-fr`,
     `dates`, `global`, `lang-fr-en`), sans NER.
  2. **NER seul** : `TransformersNerEngine.recognize` direct (brut : pas de fusion de personnes adjacentes,
     pas de résolution de conflits, pas de contexte).
  3. **Packs + NER** : `createAnalyzer(...).analyze(texte, { ner })`, comme dans l'interface (seuil 0,5, fusion des
     personnes adjacentes, résolution des conflits).
- Langue passée à l'analyseur : celle du corpus (`fr` ou `en`), comme si l'utilisateur la choisissait.
- Seuls PERSON, ORGANIZATION et LOCATION sont annotés dans le corpus : les autres types détectés par les packs
  (courriel, date, téléphone…) sont ignorés, ni vrais ni faux positifs. Cependant, ils participent à la
  résolution des conflits en configuration 3.
- Appariement un-à-un glouton (une détection ne valide qu'une entité attendue). **Exacte** : mêmes bornes et même
  type. **Recouvrement** : même type et intervalles qui se chevauchent. La cible de l'ADR (C3) et de T3.4 est lue
  en recouvrement (localiser le nom suffit pour le masquer) ; la correspondance exacte est donnée à titre indicatif.
- Une confusion de type (une personne détectée comme LOCATION) compte une fois en faux négatif pour PERSON et
  une fois en faux positif pour LOCATION.
- Limites : 150 phrases par langue, soit 123 PERSON en français et 126 en anglais : une entité pèse environ
  0,8 point de rappel. Les deux corpus sont parallèles (mêmes scénarios), donc les deux langues ne sont pas des
  mesures indépendantes. Le corpus a été écrit pour mettre le modèle en difficulté (minuscules, prénoms seuls,
  pièges) : il n'est pas représentatif de la distribution réelle des textes.

## Résultats

### Correspondance par recouvrement

| Configuration | Langue | Catégorie | Support | Précision | Rappel | F1 |
|---|---|---|---:|---:|---:|---:|
| Packs seuls | fr | PERSON | 123 | 0,987 | 0,602 | 0,747 |
| Packs seuls | fr | ORGANIZATION | 18 | n/a | 0,000 | n/a |
| Packs seuls | fr | LOCATION | 35 | n/a | 0,000 | n/a |
| Packs seuls | fr | Toutes | 176 | 0,987 | 0,420 | 0,590 |
| Packs seuls | en | PERSON | 126 | 1,000 | 0,548 | 0,708 |
| Packs seuls | en | ORGANIZATION | 18 | n/a | 0,000 | n/a |
| Packs seuls | en | LOCATION | 36 | n/a | 0,000 | n/a |
| Packs seuls | en | Toutes | 180 | 1,000 | 0,383 | 0,554 |
| Packs seuls | fr+en | PERSON | 249 | 0,993 | 0,574 | 0,728 |
| Packs seuls | fr+en | ORGANIZATION | 36 | n/a | 0,000 | n/a |
| Packs seuls | fr+en | LOCATION | 71 | n/a | 0,000 | n/a |
| Packs seuls | fr+en | Toutes | 356 | 0,993 | 0,402 | 0,572 |
| NER seul | fr | PERSON | 123 | 0,963 | 0,854 | 0,905 |
| NER seul | fr | ORGANIZATION | 18 | 0,750 | 1,000 | 0,857 |
| NER seul | fr | LOCATION | 35 | 0,906 | 0,829 | 0,866 |
| NER seul | fr | Toutes | 176 | 0,921 | 0,864 | 0,891 |
| NER seul | en | PERSON | 126 | 0,956 | 0,865 | 0,908 |
| NER seul | en | ORGANIZATION | 18 | 0,783 | 1,000 | 0,878 |
| NER seul | en | LOCATION | 36 | 0,912 | 0,861 | 0,886 |
| NER seul | en | Toutes | 180 | 0,924 | 0,878 | 0,900 |
| NER seul | fr+en | PERSON | 249 | 0,960 | 0,859 | 0,907 |
| NER seul | fr+en | ORGANIZATION | 36 | 0,766 | 1,000 | 0,867 |
| NER seul | fr+en | LOCATION | 71 | 0,909 | 0,845 | 0,876 |
| NER seul | fr+en | Toutes | 356 | 0,923 | 0,871 | 0,896 |
| Packs + NER | fr | PERSON | 123 | 0,974 | 0,902 | 0,937 |
| Packs + NER | fr | ORGANIZATION | 18 | 0,818 | 1,000 | 0,900 |
| Packs + NER | fr | LOCATION | 35 | 0,906 | 0,829 | 0,866 |
| Packs + NER | fr | Toutes | 176 | 0,940 | 0,898 | 0,919 |
| Packs + NER | en | PERSON | 126 | 0,959 | 0,921 | 0,939 |
| Packs + NER | en | ORGANIZATION | 18 | 0,810 | 0,944 | 0,872 |
| Packs + NER | en | LOCATION | 36 | 0,912 | 0,861 | 0,886 |
| Packs + NER | en | Toutes | 180 | 0,932 | 0,911 | 0,921 |
| Packs + NER | fr+en | PERSON | 249 | 0,966 | 0,912 | 0,938 |
| Packs + NER | fr+en | ORGANIZATION | 36 | 0,814 | 0,972 | 0,886 |
| Packs + NER | fr+en | LOCATION | 71 | 0,909 | 0,845 | 0,876 |
| Packs + NER | fr+en | Toutes | 356 | 0,936 | 0,904 | 0,920 |

### Correspondance exacte

| Configuration | Langue | Catégorie | Support | Précision | Rappel | F1 |
|---|---|---|---:|---:|---:|---:|
| Packs seuls | fr | PERSON | 123 | 0,987 | 0,602 | 0,747 |
| Packs seuls | fr | ORGANIZATION | 18 | n/a | 0,000 | n/a |
| Packs seuls | fr | LOCATION | 35 | n/a | 0,000 | n/a |
| Packs seuls | fr | Toutes | 176 | 0,987 | 0,420 | 0,590 |
| Packs seuls | en | PERSON | 126 | 0,957 | 0,524 | 0,677 |
| Packs seuls | en | ORGANIZATION | 18 | n/a | 0,000 | n/a |
| Packs seuls | en | LOCATION | 36 | n/a | 0,000 | n/a |
| Packs seuls | en | Toutes | 180 | 0,957 | 0,367 | 0,530 |
| Packs seuls | fr+en | PERSON | 249 | 0,972 | 0,562 | 0,712 |
| Packs seuls | fr+en | ORGANIZATION | 36 | n/a | 0,000 | n/a |
| Packs seuls | fr+en | LOCATION | 71 | n/a | 0,000 | n/a |
| Packs seuls | fr+en | Toutes | 356 | 0,972 | 0,393 | 0,560 |
| NER seul | fr | PERSON | 123 | 0,890 | 0,789 | 0,836 |
| NER seul | fr | ORGANIZATION | 18 | 0,458 | 0,611 | 0,524 |
| NER seul | fr | LOCATION | 35 | 0,906 | 0,829 | 0,866 |
| NER seul | fr | Toutes | 176 | 0,830 | 0,778 | 0,804 |
| NER seul | en | PERSON | 126 | 0,956 | 0,865 | 0,908 |
| NER seul | en | ORGANIZATION | 18 | 0,652 | 0,833 | 0,732 |
| NER seul | en | LOCATION | 36 | 0,912 | 0,861 | 0,886 |
| NER seul | en | Toutes | 180 | 0,906 | 0,861 | 0,883 |
| NER seul | fr+en | PERSON | 249 | 0,924 | 0,827 | 0,873 |
| NER seul | fr+en | ORGANIZATION | 36 | 0,553 | 0,722 | 0,627 |
| NER seul | fr+en | LOCATION | 71 | 0,909 | 0,845 | 0,876 |
| NER seul | fr+en | Toutes | 356 | 0,869 | 0,820 | 0,844 |
| Packs + NER | fr | PERSON | 123 | 0,947 | 0,878 | 0,911 |
| Packs + NER | fr | ORGANIZATION | 18 | 0,500 | 0,611 | 0,550 |
| Packs + NER | fr | LOCATION | 35 | 0,906 | 0,829 | 0,866 |
| Packs + NER | fr | Toutes | 176 | 0,881 | 0,841 | 0,860 |
| Packs + NER | en | PERSON | 126 | 0,950 | 0,913 | 0,931 |
| Packs + NER | en | ORGANIZATION | 18 | 0,714 | 0,833 | 0,769 |
| Packs + NER | en | LOCATION | 36 | 0,912 | 0,861 | 0,886 |
| Packs + NER | en | Toutes | 180 | 0,915 | 0,894 | 0,904 |
| Packs + NER | fr+en | PERSON | 249 | 0,949 | 0,896 | 0,921 |
| Packs + NER | fr+en | ORGANIZATION | 36 | 0,605 | 0,722 | 0,658 |
| Packs + NER | fr+en | LOCATION | 71 | 0,909 | 0,845 | 0,876 |
| Packs + NER | fr+en | Toutes | 356 | 0,898 | 0,868 | 0,883 |

### Rappel PERSON par catégorie de phrase (recouvrement)

Catégories : `std` phrase standard, `swiss` noms suisses, `foreign` noms d'origine étrangère, `accent`, `title`
(Mme, Dr…), `first` prénom seul, `email` style courriel, `emoji`, `lower` minuscules, `trap` noms communs ou
lieux homonymes de prénoms, `org`, `commune`, `none` sans entité.

| Catégorie | Langue | NER seul | Packs + NER | Support |
|---|---|---:|---:|---:|
| accent | fr | 1,000 | 1,000 | 5 |
| accent | en | 1,000 | 1,000 | 5 |
| email | fr | 0,870 | 0,870 | 23 |
| email | en | 0,913 | 1,000 | 23 |
| emoji | fr | 0,875 | 1,000 | 8 |
| emoji | en | 0,875 | 1,000 | 8 |
| first | fr | 0,909 | 0,909 | 11 |
| first | en | 1,000 | 1,000 | 11 |
| foreign | fr | 1,000 | 1,000 | 13 |
| foreign | en | 0,923 | 0,923 | 13 |
| lower | fr | 0,000 | 0,444 | 9 |
| lower | en | 0,000 | 0,444 | 9 |
| std | fr | 1,000 | 1,000 | 20 |
| std | en | 1,000 | 1,000 | 20 |
| swiss | fr | 1,000 | 1,000 | 11 |
| swiss | en | 1,000 | 1,000 | 11 |
| title | fr | 0,917 | 1,000 | 12 |
| title | en | 1,000 | 1,000 | 12 |
| trap | fr | 0,727 | 0,727 | 11 |
| trap | en | 0,714 | 0,714 | 14 |

## Comparaison à la cible

Cible T3.4 : rappel PERSON de la configuration combinée ≥ 0,90 en français et en anglais.

| Langue | Recouvrement | Exacte | Cible (recouvrement) |
|---|---:|---:|---|
| Français | 0,902 (111/123) | 0,878 | atteinte, de justesse : une seule entité de moins la ferait manquer |
| Anglais | 0,921 (116/126) | 0,913 | atteinte |

Le NER seul est à 0,854 (fr) et 0,865 (en) : la cible n'est atteinte que grâce aux packs (+4,8 points en
français, +5,6 en anglais). Avec la correspondance exacte, le français (0,878) n'atteint pas 0,90. La marge en
français est trop faible pour conclure que la cible est robuste : elle dépend d'un corpus de 123 entités. Les
pistes ci-dessous sont à mener même si la cible est formellement atteinte.

## Analyse des erreurs

Exemples tirés du corpus synthétique (`--errors 40` pour la liste complète).

**Faux négatifs PERSON, packs + NER (22 sur 249).**

1. **Noms écrits en minuscules (10)**, c'est le principal trou. Le NER seul ne trouve aucun nom en minuscules
   (rappel 0,00 sur la catégorie `lower`, en fr et en en : le modèle est sensible à la casse). Les packs en
   rattrapent 4 sur 9 par langue (rappel combiné 0,44). Manqués : `jean dupont`,
   `marie lefevre`, `julie roux`, `olivier chevalier`, `john smith`, `emily clarke`, `david walsh`.
2. **Homonymes de noms communs ou de lieux (8, catégorie `trap`)** : `Victoire est arrivée en retard.`, `Blanche
   porte une chemise blanche.`, `Fleur aime les fleurs.`, `Faith kept her faith.`, `Jordan flew to Jordan last
   week.`, `Victoria met Georgia at the station.`. Le rappel `trap` est de 0,73 (fr) et 0,71 (en), identique
   avec et sans packs : c'est le NER qui décide.
3. **Prénoms seuls en contexte court (4)** : `Dis bonjour à Théo de ma part.` (le NER propose LOCATION, d'où
   un faux positif LOCATION associé), `Hello Julie, petit rappel…`, `Bonjour Claire, ci-joint le devis.`,
   `Pascal` en signature. Les formules de salutation et de signature ne sont pas exploitées.
4. **Nom étranger rare (1)** : `Chinedu Okafor will present the results tomorrow.` : le NER l'étiquette
   ORGANIZATION (faux positif ORGANIZATION associé).

**Faux positifs PERSON (8, précision 0,966 fr+en)** : principalement des noms de communes lus comme des
personnes (`Meyrin et Vernier ont voté le même budget.`, `Ferney-Voltaire`), un fragment d'organisation
(`Léman Sàrl` dans `Brasserie du Léman Sàrl`), un prénom composé coupé (`Anne` pour `Anne-Sophie`).

**ORGANIZATION (précision 0,81, rappel 0,97 fr+en en recouvrement ; 0,60 et 0,72 en exacte).** Le modèle trouve
presque toutes les organisations mais coupe mal : `Brasserie` seul au lieu de `Brasserie du Léman Sàrl`, ce qui
explique l'écart entre exacte et recouvrement. Des prénoms ou formules (`Claire`, `Best`) sont aussi étiquetés
ORGANIZATION. Seulement 36 organisations dans le corpus : à prendre avec prudence.

**LOCATION (précision 0,91, rappel 0,85 fr+en).** Les communes suisses et haut-savoyardes peu connues sont
manquées ou lues comme des personnes : `Carouge`, `Meyrin`, `Vernier`, `Annemasse`, `Ferney-Voltaire`, les
lieux en minuscules (`annecy`, `manchester`) et `📍Lausanne` après un emoji. Les packs n'apportent rien en
LOCATION (aucun dictionnaire de lieux livré : rappel 0,00 en configuration 1).

**Packs seuls.** Précision très haute sur PERSON (0,993) mais rappel de 0,574 : ils ne couvrent que les prénoms
du dictionnaire. ORGANIZATION et LOCATION : aucune détection, par construction.

## Pistes (la cible est atteinte de justesse en français ; ordre de rentabilité attendue, non mesuré)

1. **Passage en casse de titre sur une copie du texte** avant le NER (majuscule initiale à chaque mot, en
   conservant la longueur et donc les positions, R7 ; ne pas le faire quand la longueur change, par exemple `ß`).
   Vise directement les 10 faux négatifs en minuscules et les `annecy`/`manchester`. Risque : faux positifs sur
   les mots communs ; à mesurer sur `none` et `trap`.
2. **Dictionnaires de prénoms et règles contextuelles dans les packs** : prénom après `Bonjour`, `Hello`, `Dis
   bonjour à`, `Cc :`, signature après `Bien à toi`, `Best`, `A+`. Aide sur les prénoms seuls et le style
   courriel. Les homonymes (`Victoire`, `Fleur`, `Faith`) resteront ambigus.
3. **Dictionnaire de lieux** (communes de Genève, Vaud, Haute-Savoie) pour LOCATION, avec liste de
   désambiguïsation contre les noms de personnes (`Meyrin`, `Vernier`).
4. **Regroupement des organisations** par motif (forme juridique `Sàrl`, `SA`, `GmbH` : étendre la détection à
   gauche jusqu'au début du groupe nominal) pour corriger les coupures.
5. **Autre modèle** si 1 à 3 ne suffisent pas : `Xenova/bert-base-multilingual-cased-ner-hrl` ou le
   XLM-RoBERTa (ADR 0001, candidats 3 et 4, hors cible de poids) ; `Xenova/camembert-ner` pour le français seul
   (déjà dans `models/`, non mesuré ici). À comparer avec ce même script en changeant `DEFAULT_NER_MODEL`.
6. **Étendre le corpus** (plus de phrases, un second auteur, textes plus longs et plus bruités) avant tout
   arbitrage fin : l'intervalle de confiance sur 123 entités est d'environ ± 5 points.
7. **Correction manuelle dans l'interface** : l'avertissement permanent et l'ajout manuel propagé (PLAN.md,
   risque « Noms manqués par le NER ») restent indispensables, quel que soit le score.
