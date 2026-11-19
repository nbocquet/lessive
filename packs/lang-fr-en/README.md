# Pack `lang-fr-en` : prénoms et titres de civilité

Complète le NER, qui manque des noms, par des dictionnaires de prénoms et de noms de famille, des motifs « titre + nom » et les noms affichés devant une adresse de courriel. Type de pack : `language`.

## Contenu

| Règle | Type | Score de base | Rôle |
|---|---|---|---|
| `courriel-nom-affiche` | motif, PERSON | 1 | Deux mots capitalisés devant une adresse entre chevrons, service facultatif et adresse sur la ligne suivante. |
| `prenoms` | dictionnaire, PERSON | 0,45 | Prénoms courants (Suisse romande, France, monde anglophone), insensible à la casse et aux accents. |
| `prenoms-ambigus` | dictionnaire, PERSON | 0,45 | Prénoms qui sont aussi des mots, des lieux ou des mois (Rose, Pierre, Florence, May, Grace…). Casse exacte (`caseSensitive`) et contexte obligatoire (`context.required`). |
| `titres-nom` | motif, PERSON | 0,7 | `M. Dupont`, `Mme Martin-Favre`, `Dr Keller`, `Mr Smith`, `Maître Rossi`, `Madame Claire Dubois` (un ou deux mots capitalisés). |
| `titres-nom-particule` | motif, PERSON | 0,7 | Nom à particule juste après le titre : `M. de Rougemont`, `Mme de la Fontaine`. |
| `titres-prenom-particule` | motif, PERSON | 0,7 | `de la Fontaine` dans `Mme Anne de la Fontaine` (le prénom `Anne` est détecté par `titres-nom`). |

### Noms affichés dans les courriels

La règle `courriel-nom-affiche` détecte deux mots capitalisés devant une adresse entre chevrons, même absents des dictionnaires, dans les deux ordres : `Cédric Varnelot <cedric@example.org>` et `Varnelot Cédric (DSI) <cedric@example.org>`. Elle accepte une liste séparée par virgules ou points-virgules, les guillemets, accents, capitales, traits d’union et apostrophes, ainsi qu’un retour à la ligne avant l’adresse. Le service entre parenthèses reste hors du nom.

Son score structurel de 1 permet de protéger le nom entier même si le NER n’en détecte qu’un morceau avec un score élevé ; il ne certifie pas une identité. Aucun prénom ou patronyme réel signalé par un utilisateur n’est ajouté aux listes. Les tests utilisent des noms fictifs.

Limites : deux mots capitalisés (un prénom composé avec trait d’union compte comme un mot), pas les noms entièrement en minuscules ni tous les noms à particules. Une boîte collective portant deux mots capitalisés peut être prise pour une personne ; la détection peut être retirée à la vérification. La règle est rédigée à la main dans `rules/courriels.json`, distincte des dictionnaires générés par les scripts.

### Pourquoi 0,45 pour les prénoms

Un prénom seul (« Léa est arrivée ») est un indice faible : ces mots sont aussi des noms de famille, des marques, des lieux. Avec le seuil par défaut de 0,5, une occurrence isolée n'est donc pas retenue (elle reste visible dans les détections écartées). Un mot de contexte à moins de 5 mots ajoute 0,35 : 0,80, retenue. Le contexte est : titres (M., Mme, Monsieur, Madame, Dr, Mr, Mrs, Ms…), formules d'appel et de clôture (bonjour, cher, chère, dear, hi, regards, cordialement, signé…), verbes de relation et d'identité (je suis, my name is, mon collègue, my brother…), étiquettes (prénom, nom, name). Le NER reste le détecteur principal ; ce pack rattrape les prénoms qu'il manque quand le texte donne un indice.

### Prénoms ambigus

Les prénoms qui sont aussi des mots courants sont retirés de `prenoms` et placés dans `prenoms-ambigus` (liste dans `tools/ambiguous-names.json`) : la casse doit être exacte (« rose » n'est jamais détecté) et un mot de contexte est obligatoire. « Rose a écrit hier » n'est donc pas détecté, « Bonjour Rose » l'est. Limite : le contexte est lexical, « Dear Grace » et « thanks for May » seront détectés ; une phrase comme « Merci, May est un beau mois » aussi.

### Titres : l'intervalle exclut le titre

`titres-nom` utilise un lookbehind : seul le nom est détecté, pas le titre. La pseudonymisation donne ainsi « Mme PERSONNE_001 », et la résolution d'entités peut rapprocher « M. Dupont » de « Dupont ». Pour que ces détections l'emportent sur un prénom du dictionnaire au même endroit (« Mme Martin-Favre » contient « Martin »), le titre est aussi déclaré comme mot de contexte de la règle : score 0,7 + 0,35 = 1,0 contre 0,8.

Choix et limites des motifs :
- Casse stricte : « Dupont » ou « DUPONT » après un titre, pas « dupont ». Un titre en minuscules (« le docteur dupont ») n'est pas reconnu.
- Le nom ne franchit pas une fin de ligne ; un seul espace (deux pour `titres-nom`) entre titre et nom.
- Un second mot capitalisé est avalé : « Dr Keller Hospital » donne « Keller Hospital ». Après un titre abrégé, les pronoms Il(s), Elle(s), Je, Nous, Vous, He, She, It, We sont refusés (« M. Il… »), mais « M. Ensuite… » donne un faux positif.
- `Mme Anne de la Fontaine` produit deux détections adjacentes (« Anne », « de la Fontaine ») : une expression régulière unique serait rejetée par le contrôle ReDoS.
- Absents volontairement : « Me » (« Tell Me More »), « Dame » (« Notre Dame »), les titres écrits en capitales.
- Motifs ancrés vérifiés par le banc commun (statique ancré + entrées adverses). Les classes de lettres sont explicites (`[A-ZÀ-ÖØ-Þ…]`) parce que `\p{Lu}` fait échouer le détecteur.

## Sources et licences des listes

**État actuel : sources officielles françaises et suisses, complétées par la liste rédigée pour Lessive.**

Prénoms (`rules/prenoms.json`, environ 5 200) :

- **INSEE, Fichier des prénoms, édition 2025** (`prenoms-2025-nat.csv`) : naissances en France à partir de 1925 (`--since 1925`), effectif cumulé d'au moins 1000 ; `_PRENOMS_RARES` et années inconnues ignorés. Licence Ouverte Etalab 2.0.
- **OFS, prénoms de la population résidante, Suisse, 2025** (STATPOP, tableau su-q-01.04.00.12, feuille 2025) : prénoms portés par au moins 200 personnes (féminin + masculin). Utilisation libre, obligation d'indiquer la source.
- **Liste rédigée pour Lessive** (`tools/handwritten-names.json`, environ 600 prénoms, Apache 2.0) : complète pour les prénoms anglophones et d'autres origines (source SSA non intégrée).

Noms de famille (`rules/noms-famille.json`, environ 6 300 + 1 100 ambigus) :

- **OFS, noms de famille de la population résidante permanente, Suisse, 2025** (STATPOP, tableau su-q-01.04.00.13, feuille CH) : noms portés par au moins 300 personnes. Graphie d'origine conservée (Müller, Da Silva).
- **INSEE, fichier des noms de famille** (`noms2008nat_txt.txt`, naissances par décennie) : décennies 1921-1930 à 1991-2000, au moins 2000 naissances. Noms en majuscules sans accents à la source, mis en casse de titre ; la recherche ignore les accents.
- Les mots de contexte (titres, formules d'appel : « Bonjour », « Maître » sont aussi des noms en Suisse) sont retirés.

Mots courants : prénoms et noms ont été recoupés avec des dictionnaires français et anglais (an-array-of-french-words, MIT ; hunspell en_US), utilisés seulement à la génération.

- Prénoms qui sont aussi des mots fréquents (roman, franc, fleur, matin, mari, lui, can, even…) : `tools/ambiguous-names.json`, règle `prenoms-ambigus` (majuscule exacte, mot de contexte obligatoire). D'autres collisions jugées rares en texte (Louis, Robert, Martin…) restent dans la règle principale.
- Noms qui sont aussi des mots (Blanc, Boulanger, Berger, Bouquet…) : `tools/ambiguous-lastnames.json`, règle `noms-famille-ambigus` (majuscule exacte, score 0,3) : retenus seulement accolés à un prénom (« Pierre Blanc »).

Comment les règles se combinent :

- prénom seul : 0,45, retenu avec un mot de contexte (titre, formule d'appel) ;
- nom seul : 0,4, idem ;
- prénom et nom adjacents (« Claire Müller ») : le moteur les réunit en une seule détection rehaussée de 0,35, donc un seul pseudonyme ;
- titre + nom (« Mme Keller ») : motif dédié, 0,7, rehaussé par le titre.

Commandes utilisées (les CSV OFS ont été exportés des classeurs Excel : colonnes `prenom;valeur` et `nom;valeur`) :

```bash
node packs/lang-fr-en/tools/build.mjs --insee prenoms-2025-nat.csv --since 1925 --ofs ofs-prenoms-2025-min200.csv
node packs/lang-fr-en/tools/build-lastnames.mjs --ofs ofs-noms-2025.csv --insee noms2008nat_txt.txt
```

### Sources officielles (INSEE et OFS intégrées ; SSA prévue)

| Source | Licence annoncée | Remarques |
|---|---|---|
| INSEE, « Fichier des prénoms » (fichier national, état civil, naissances en France depuis 1900) | Licence Ouverte Etalab 2.0 (via data.gouv.fr). La page INSEE consultée ne la mentionne pas : relever la mention exacte au moment du téléchargement. | Attribution requise : « Source : Insee, Fichier des prénoms, <édition> ». Colonnes : `SEXE`, `PREUSUEL`, `ANNAIS`, `NOMBRE` (anciennes éditions) ; le script détecte aussi `prenom`, `valeur`. |
| SSA, « Baby Names from Social Security Card Applications » (`names.zip`, fichiers `yobAAAA.txt`) | Domaine public (œuvre du gouvernement fédéral des États-Unis). | Format `Nom,Sexe,Effectif`, sans en-tête. Attribution non requise, courtoise. |
| OFS (Office fédéral de la statistique), prénoms des nouveau-nés / de la population résidente, via opendata.swiss | À VÉRIFIER. opendata.swiss distingue plusieurs conditions (libre, avec mention de la source, usage non commercial…). Une ressource consultée (prénoms dès 1987, canton de Fribourg, pas l'OFS) indiquait « CC BY-SA » avec mention de la source : le partage à l'identique est incompatible avec une redistribution Apache 2.0 sans analyse juridique. | N'intégrer un fichier OFS qu'après lecture des conditions d'utilisation de ce fichier précis. Le script `--ofs` est fourni mais ne préjuge pas de la licence. |

Une liste de prénoms dérivée d'un fichier statistique est un extrait de faits (noms et effectifs) ; l'attribution est néanmoins à conserver dans `NOTICE` pour les sources sous Licence Ouverte ou CC-BY.

## Régénérer la liste depuis les sources officielles

Prérequis : Node 26, aucune dépendance. Les fichiers sont téléchargés et décompressés par la personne qui régénère.

1. Télécharger et décompresser : le CSV national INSEE, le dossier SSA (`yob*.txt`), éventuellement un CSV OFS dont les conditions ont été vérifiées.
2. Lancer, depuis la racine du dépôt :

   ```bash
   node packs/lang-fr-en/tools/build.mjs --insee prenoms-nat.csv --ssa names/ [--ofs ofs.csv] \
     [--since 1925] [--min-count 1000] [--max-names 6000] [--exclude exclusions.txt] [--no-handwritten]
   npx prettier --write packs/lang-fr-en
   npx vitest run packs -t lang-fr-en
   ```

3. Le script : lit les effectifs cumulés, applique un seuil (INSEE 1000, SSA 20000, OFS 100 par défaut), met en forme (`JEAN-LUC` devient `Jean-Luc`), retire les prénoms de `tools/ambiguous-names.json` (et ceux de `--exclude`), ne garde que les 6000 plus fréquents. Il réécrit les trois fichiers de `rules/`.
4. Relire à la main : les listes statistiques contiennent beaucoup de mots courants (autres que ceux déjà listés). Compléter `ambiguous-names.json` ou `--exclude`, regénérer. Vérifier que `rules/prenoms.json` reste sous 200 Ko.
5. Mettre à jour la section « État actuel » de ce README, la version du manifeste et `NOTICE`.

Sans option de source, `build.mjs` régénère la liste rédigée (`tools/handwritten-names.json`) et les motifs. Les fichiers de `rules/` sont donc générés : modifier les scripts et les JSON de `tools/`, pas les règles à la main.

## Limites

- Biais de couverture culturelle : la liste rédigée privilégie les prénoms français, suisses romands et anglo-saxons des générations récentes et moyennes. Les prénoms d'origine arabe, balkanique, portugaise, italienne, africaine, asiatique, très présents en Suisse romande et en France, sont à peine couverts (une cinquantaine dans « other »). Un prénom absent n'est PAS un prénom sûr : le NER et l'ajout manuel restent nécessaires. Les listes officielles couvrent mieux mais gardent un biais vers les naissances enregistrées en France, aux États-Unis ou en Suisse.
- Les prénoms ambigus ou rares ne sont détectés qu'avec un contexte ; les prénoms en capitales (signatures) ne le sont pas dans `prenoms-ambigus`.
- Les pseudo-prénoms, surnoms et noms de famille ne sont pas traités.
- Les mots de contexte sont lexicaux : faux positifs possibles (« dear » devant un mot du dictionnaire qui n'est pas une personne).
