# Pack `lang-fr-en` : prénoms et titres de civilité

Complète le NER, qui manque des noms, par un dictionnaire de prénoms courants et par des motifs « titre + nom ». Type de pack : `language`. Aucune règle sur les noms de famille.

## Contenu

| Règle | Type | Score de base | Rôle |
|---|---|---|---|
| `prenoms` | dictionnaire, PERSON | 0,45 | Prénoms courants (Suisse romande, France, monde anglophone), insensible à la casse et aux accents. |
| `prenoms-ambigus` | dictionnaire, PERSON | 0,45 | Prénoms qui sont aussi des mots, des lieux ou des mois (Rose, Pierre, Florence, May, Grace…). Casse exacte (`caseSensitive`) et contexte obligatoire (`context.required`). |
| `titres-nom` | motif, PERSON | 0,7 | `M. Dupont`, `Mme Martin-Favre`, `Dr Keller`, `Mr Smith`, `Maître Rossi`, `Madame Claire Dubois` (un ou deux mots capitalisés). |
| `titres-nom-particule` | motif, PERSON | 0,7 | Nom à particule juste après le titre : `M. de Rougemont`, `Mme de la Fontaine`. |
| `titres-prenom-particule` | motif, PERSON | 0,7 | `de la Fontaine` dans `Mme Anne de la Fontaine` (le prénom `Anne` est détecté par `titres-nom`). |

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

**État actuel : liste rédigée pour Lessive, Apache 2.0.** Les sites officiels (INSEE, data.gouv.fr, SSA) n'étaient pas joignables depuis l'environnement de développement (proxy en liste blanche), et aucune copie tierce n'a été utilisée : leur provenance et leur licence ne sont pas vérifiables. La liste (`tools/handwritten-names.json`, environ 600 prénoms) a donc été écrite à la main par l'auteur du pack, de mémoire, sans copier de fichier. Elle n'est PAS un extrait d'une source officielle et ne doit pas être présentée comme telle. Elle est publiée sous la licence du dépôt (Apache 2.0), sans exigence d'attribution tierce.

### Sources officielles prévues (non intégrées, à vérifier au téléchargement)

| Source | Licence annoncée | Remarques |
|---|---|---|
| INSEE, « Fichier des prénoms » (fichier national, état civil, naissances en France depuis 1900) | Licence Ouverte Etalab 2.0 (via data.gouv.fr). La page INSEE consultée ne la mentionne pas : relever la mention exacte au moment du téléchargement. | Attribution requise : « Source : Insee, Fichier des prénoms, <édition> ». Colonnes : `SEXE`, `PREUSUEL`, `ANNAIS`, `NOMBRE` (anciennes éditions) ; le script détecte aussi `prenom`, `valeur`. |
| SSA, « Baby Names from Social Security Card Applications » (`names.zip`, fichiers `yobAAAA.txt`) | Domaine public (œuvre du gouvernement fédéral des États-Unis). | Format `Nom,Sexe,Effectif`, sans en-tête. Attribution non requise, courtoise. |
| OFS (Office fédéral de la statistique), prénoms des nouveau-nés / de la population résidente, via opendata.swiss | À VÉRIFIER. opendata.swiss distingue plusieurs conditions (libre, avec mention de la source, usage non commercial…). Une ressource consultée (prénoms dès 1987, canton de Fribourg, pas l'OFS) indiquait « CC BY-SA » avec mention de la source : le partage à l'identique est incompatible avec une redistribution Apache 2.0 sans analyse juridique. | N'intégrer un fichier OFS qu'après lecture des conditions d'utilisation de ce fichier précis. Le script `--ofs` est fourni mais ne préjuge pas de la licence. |

Une liste de prénoms dérivée d'un fichier statistique est un extrait de faits (noms et effectifs) ; l'attribution est néanmoins à conserver dans `NOTICE` pour les sources sous Licence Ouverte ou CC-BY.

## Régénérer la liste depuis les sources officielles

Prérequis : Node 22, aucune dépendance. Les fichiers sont téléchargés et décompressés par la personne qui régénère.

1. Télécharger et décompresser : le CSV national INSEE, le dossier SSA (`yob*.txt`), éventuellement un CSV OFS dont les conditions ont été vérifiées.
2. Lancer, depuis la racine du dépôt :

   ```bash
   node packs/lang-fr-en/tools/build.mjs --insee prenoms-nat.csv --ssa names/ [--ofs ofs.csv] \
     [--min-count 1000] [--max-names 6000] [--exclude exclusions.txt]
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
