# Créer un pack

Ce guide s'adresse aux développeurs qui veulent ajouter un pays, une langue ou des règles à Lessive. Il suit un pack **fictif mais complet**, `country-ze` (la Zélandie, un pays inventé), de la structure des fichiers jusqu'aux tests. Les fichiers de l'exemple ci-dessous ont été chargés par le moteur et passés au même contrôle que les packs livrés (schéma, ReDoS, cas de test avec tous les packs actifs) : ils fonctionnent tels quels. Ils ne font pas partie du dépôt.

Lecture conseillée avant : [ARCHITECTURE.md](../ARCHITECTURE.md) (comment le moteur enchaîne détecteurs, contexte et conflits) et [CONTRIBUTING.md](../CONTRIBUTING.md) (règles R1 à R12). Les packs livrés (`packs/*/README.md`) servent de modèles.

## 1. Ce qu'est un pack, et ce qu'il ne peut pas être

Un pack est un dossier de **données JSON** : un manifeste et des fichiers de règles. Il ne contient **jamais de code** (R8).

- Il déclare des **règles motif** (expression régulière) et des **règles dictionnaire** (liste de termes).
- Il référence les **validateurs** par leur nom, dans une liste fermée de sept (voir section 7).
- Il ne peut utiliser que les **seize types d'entités** du moteur (`src/core/types/entities.ts`) : personne, organisation, lieu, courriel, téléphone, URL, adresse IP, IBAN, carte bancaire, secret technique, date, AVS, IDE, NIR, SIREN, SIRET. Ajouter un type, un validateur ou un opérateur modifie les contrats de `src/core` : c'est une tâche à part (R11), pas un pack.
- Il est livré avec le dépôt, au format JSON. L'import d'un pack par l'utilisateur n'est pas proposé ; s'il l'est un jour, un pack tiers sera traité comme non fiable, et le schéma est déjà strict en ce sens (voir [SECURITY.md](../SECURITY.md)).

L'exemple a donc un cas à part : un numéro d'entreprise n'a pas de type dédié. Il est rattaché à `ORGANIZATION`, ce qui donne le pseudonyme `ORGANISATION_001`. Dans un vrai pack, choisissez le type le plus proche et dites-le dans le README du pack.

## 2. Avant de commencer

1. Vérifiez que la donnée n'est pas déjà couverte. Le pack `global` détecte les IBAN de tous les pays, les courriels, URL, adresses IP, cartes et secrets : un pack pays **ne répète pas** une règle IBAN (voir `packs/country-ch/README.md`). Le pack `dates` couvre les dates, `lang-fr-en` les prénoms et noms.
2. Trouvez la **source officielle** du format (section 14). Sans elle, ne l'écrivez pas.
3. Préparez des **valeurs synthétiques** (section 10). Aucune valeur réelle, jamais (R10).
4. Installez les dépendances : `ONNXRUNTIME_NODE_INSTALL=skip npm ci`.

## 3. Structure d'un pack

```text
packs/country-ze/
├── manifest.json        identité, version, liste des fichiers de règles
├── README.md            obligatoire : règles, sources, limites (modèle : packs/country-fr/README.md)
├── rules/
│   ├── identifiers.json
│   └── places.json
└── tests/
    ├── cases.json       obligatoire : un cas = un texte et ce qui doit être détecté
    └── cross.json       conseillé : cas mêlant plusieurs types, tous packs actifs
```

Aucune étape d'enregistrement : le dossier est découvert automatiquement.

- **Par l'application** : au build, Vite importe `packs/*/manifest.json` et `packs/*/rules/*.json` (`src/web/packs.ts`). Les fichiers de règles doivent donc être **directement dans `rules/`**, pas dans un sous-dossier. Les dossiers dont le nom commence par `_` (comme `_tools`) sont ignorés.
- **Par les tests** : `packs/_tools/load.ts` prend tout dossier de `packs/` qui contient un `manifest.json`.
- Les packs se chargent sans réseau, dans le bundle (R1). Le pack apparaît ensuite dans les réglages, actif par défaut.

## 4. Le manifeste

**`packs/country-ze/manifest.json`**

```json
{
  "id": "country-ze",
  "version": "0.1.0",
  "engineVersion": "0.1.0",
  "type": "country",
  "name": "Zélandie (pays fictif)",
  "description": "Pack d'exemple du guide de création : téléphones zélandais, numéro d'entreprise et communes. Les valeurs sont toutes inventées.",
  "rules": ["rules/identifiers.json", "rules/places.json"]
}
```

| Champ | Règle |
|---|---|
| `id` | kebab-case, unique, stable (`country-ze`). Il apparaît dans les identifiants de règles. |
| `version` | version sémantique du pack. |
| `engineVersion` | version minimale du moteur (`ENGINE_VERSION` dans `src/core/index.ts`, aujourd'hui `0.1.0`). Un moteur plus ancien refuse le pack. |
| `type` | `global`, `country`, `language` ou `domain`. |
| `name`, `description` | affichés dans les réglages. |
| `dependencies` | facultatif : identifiants des packs requis. Dépendances manquantes ou cycle : le chargement échoue. |
| `rules` | chemins des fichiers de règles, relatifs au dossier du pack. |

Les schémas sont **stricts** (`src/core/registry/schema.ts`) : un champ inconnu est refusé, afin qu'un pack ne transporte rien d'inattendu. Les messages d'erreur disent le fichier et le champ fautifs.

## 5. Règles motif

Un fichier de règles est un objet `{ "rules": [ … ] }`.

**`packs/country-ze/rules/identifiers.json`**

```json
{
  "rules": [
    {
      "kind": "pattern",
      "id": "ze-phone",
      "entityType": "PHONE",
      "score": 0.7,
      "pattern": "(?<![A-Za-z0-9+])\\+999[ \\u00a0\\u202f][0-9]{2}(?:[ \\u00a0\\u202f][0-9]{3}){2}(?![0-9])",
      "context": {
        "words": { "fr": ["telephone", "tel", "portable", "joindre"], "en": ["phone", "mobile"] }
      },
      "description": "Numéro zélandais groupé : +999 12 345 678 (espace ordinaire, insécable U+00A0 ou fine insécable U+202F). Retenu sans contexte (0,7)."
    },
    {
      "kind": "pattern",
      "id": "ze-phone-compact",
      "entityType": "PHONE",
      "score": 0.4,
      "pattern": "(?<![A-Za-z0-9+])\\+999[0-9]{8}(?![0-9])",
      "context": {
        "words": { "fr": ["telephone", "tel", "portable", "joindre"], "en": ["phone", "mobile"] }
      },
      "description": "Numéro zélandais collé : +99912345678. Score sous le seuil de 0,5 : retenu seulement avec un mot de contexte (0,4 + 0,35)."
    },
    {
      "kind": "pattern",
      "id": "ze-numero-entreprise",
      "entityType": "ORGANIZATION",
      "score": 0.6,
      "pattern": "(?<![0-9.])999\\.[0-9]{4}\\.[0-9]{4}\\.[0-9]{2}(?![0-9])",
      "validator": "ean13",
      "context": {
        "words": { "fr": ["entreprise", "société", "registre"], "en": ["company", "business"] }
      },
      "description": "Numéro d'entreprise zélandais fictif : 999.NNNN.NNNN.NC, clé EAN-13 (validateur ean13). Un validateur réussi porte le score à 1,0 ; une clé fausse supprime la détection."
    }
  ]
}
```

Champs d'une règle motif :

| Champ | Rôle |
|---|---|
| `kind` | `"pattern"`. |
| `id` | kebab-case ou snake_case. L'identifiant global est `<pack>/<règle>` : `country-ze/ze-phone`. |
| `entityType` | un des seize types. |
| `score` | score de base entre 0 et 1 (section 9). |
| `pattern` | source de l'expression régulière, sans délimiteurs, 2 000 caractères au plus. |
| `flags` | facultatif : `i`, `m`, `s`, `u`, sans doublon. Le moteur ajoute `g`. |
| `validator` | facultatif : nom d'un validateur (section 7). |
| `context` | facultatif (section 8). |
| `languages` | facultatif : `["fr"]`, `["en"]` ou `"any"`. Absent : toutes les langues. |
| `enabled` | `false` pour livrer la règle désactivée (activable dans les réglages). Absent : active. |
| `description` | texte libre : à remplir, c'est la documentation de la règle. |

Conseils d'écriture, tirés des packs livrés :

- **Doublez les barres obliques inverses** dans le JSON : l'expression `\+999` s'écrit `\\+999` dans le champ `pattern`.
- **Bornez le motif** pour ne pas couper un nombre plus long ni lire un morceau d'un autre identifiant : `(?<![A-Za-z0-9+])` devant, `(?![0-9])` derrière. Sans cela, un IBAN ou un numéro de carte produit des faux téléphones.
- **Acceptez les trois blancs** que l'on rencontre dans les numéros copiés d'un PDF ou d'une page web : l'espace ordinaire, l'espace insécable (U+00A0) et la fine insécable (U+202F). L'exemple écrit `[ \\u00a0\\u202f]` dans le JSON.
- **Écrivez les classes de lettres explicitement** (`[A-ZÀ-ÖØ-Þ]`) plutôt que `\p{Lu}` : cette dernière fait échouer le contrôle ReDoS (voir `packs/lang-fr-en/README.md`).
- **Préférez plusieurs règles simples à une règle à alternatives.** `country-fr` et `dates` multiplient volontairement les règles (une par forme du jour, une par écriture du numéro) parce que le contrôle ReDoS refuse les alternances et les `?` successifs (section 11). C'est la raison pour laquelle `ze-phone` et `ze-phone-compact` sont deux règles.
- Une règle sans `languages` s'applique à toutes les langues, mais ses mots de contexte, eux, dépendent de la langue d'analyse (section 8).

## 6. Règles dictionnaire

**`packs/country-ze/rules/places.json`**

```json
{
  "rules": [
    {
      "kind": "dictionary",
      "id": "ze-communes",
      "entityType": "LOCATION",
      "score": 0.55,
      "terms": ["Port-Lumière", "Haut-Brumeval", "Saint-Orvane"],
      "description": "Communes zélandaises dont le nom n'est pas un mot courant. Insensible à la casse et aux accents."
    },
    {
      "kind": "dictionary",
      "id": "ze-communes-ambigues",
      "entityType": "LOCATION",
      "score": 0.4,
      "caseSensitive": true,
      "terms": ["Marais", "Source"],
      "context": {
        "words": {
          "fr": ["commune de", "ville de", "habite a", "domicilie a"],
          "en": ["town of", "lives in"]
        },
        "required": true
      },
      "description": "Communes dont le nom est aussi un mot courant : majuscule exacte et mot de contexte obligatoire."
    }
  ]
}
```

- `terms` : les termes cherchés, un à 50 000. La recherche porte sur des **mots entiers** (limites de mots Unicode) et ignore la casse **et les accents**, sauf avec `"caseSensitive": true`, qui exige la casse exacte (les accents restent ignorés).
- **Séparez les termes ambigus** de ceux qui ne le sont pas. Une commune qui s'appelle aussi un mot courant (`Marais`, `Source`) irait signaler « le marais » dans n'importe quel texte. L'exemple la range dans `ze-communes-ambigues` : majuscule exacte, score sous le seuil, **mot de contexte obligatoire**. C'est le schéma de `prenoms-ambigus` dans `lang-fr-en`.
- Pour une longue liste issue d'une source officielle, **ne l'éditez pas à la main** : écrivez un script de génération (voir `packs/lang-fr-en/tools/`), relu à chaque régénération, et documentez les commandes dans le README du pack.

## 7. Validateurs : une liste fermée

Un validateur vérifie une valeur déjà trouvée par le motif (somme de contrôle). Il reçoit la valeur brute, séparateurs compris, et la normalise lui-même. Le résultat compte pour le score : **validateur réussi, score porté à 1,0 ; validateur échoué, détection supprimée.**

| Nom | Ce qu'il vérifie |
|---|---|
| `luhn` | clé de Luhn d'un numéro de 12 à 19 chiffres (cartes bancaires). Espaces et tirets ignorés ; une lettre rend la valeur invalide. |
| `iban_mod97` | clé modulo 97 d'un IBAN. |
| `ean13` | clé d'un code EAN-13 (13 chiffres). Le préfixe et la présentation restent à la charge du motif. |
| `fr_nir_key` | clé du numéro de sécurité sociale français (Corse comprise). |
| `ch_uid_mod11` | clé modulo 11 du numéro d'identification des entreprises suisse. |
| `fr_siren_luhn` | clé de Luhn d'un SIREN. |
| `fr_siret_luhn` | clé de Luhn d'un SIRET (exception de La Poste comprise). |

L'exemple utilise `ean13` pour le numéro d'entreprise : le motif impose le préfixe `999` et la forme `999.NNNN.NNNN.NC`, le validateur contrôle la clé. Le cas de test `entreprise-cle-fausse` vérifie qu'une clé fausse ne donne rien.

Un pack ne peut pas apporter son propre validateur : c'est du code (R8). Si votre pays en exige un, ouvrez un ticket pour l'ajouter à `src/core/validators/` (et à `VALIDATOR_NAMES`, contrat de `src/core/types/rules.ts`, R11), avec ses sources et ses tests.

**Un validateur n'est pas toujours possible.** Les numéros de téléphone n'en ont pas : le motif décide seul, et le score reflète ce doute.

## 8. Le contexte

Un mot de contexte proche d'une détection la **rehausse de 0,35**, sans dépasser 1,0. La fenêtre est de **cinq mots avant et cinq mots après**. Avec `"required": true`, une détection sans mot de contexte est écartée (elle reste visible parmi les détections écartées, avec la raison).

```json
"context": {
  "words": {
    "fr": ["telephone", "tel", "portable", "joindre"],
    "en": ["phone", "mobile"],
    "any": ["IBAN"]
  },
  "required": true
}
```

Règles de comparaison (`src/core/context/apply-context.ts`, tests dans le même dossier) :

- **La langue d'analyse choisit les listes** : celle de la langue (`fr` ou `en`) plus `any`. Avec la langue « auto », toutes les listes servent. Dans l'exemple, `Phone: +99912345678` donne un téléphone en anglais et rien en français (cas `telephone-compact-contexte-d-une-autre-langue`).
- **Mot entier** : `domicilié à` ne reconnaît pas `domiciliée à`. Listez les formes dont vous avez besoin.
- **Expression** : plusieurs mots doivent se suivre dans cet ordre (`commune de`).
- **La casse est toujours ignorée.**
- **Les accents : un mot écrit sans accent les ignore ; un mot écrit avec accent l'exige.**
- **Le point : un mot qui se termine par un point exige un point dans le texte** (`M.`, `Dr.`, `art.`) ; sans point dans le mot de contexte, le point du texte est facultatif.

Ce que donnent les quatre écritures d'un même mot, vérifié sur le moteur :

| Mot de contexte | `Tél.` | `Tél` | `Tel.` | `Tel` |
|---|:-:|:-:|:-:|:-:|
| `tel` | oui | oui | oui | oui |
| `tél` | oui | oui | non | non |
| `tél.` | oui | non | non | non |
| `tel.` | oui | non | oui | non |

**Conseil : écrivez les mots de contexte sans accent** (`telephone`, `tel`), sauf quand l'accent distingue deux mots. Vous reconnaissez alors `Téléphone`, `TÉLÉPHONE` et `telephone`. À l'inverse, un mot accentué (`téléphone`) manque `Telephone`, ce qui arrive dans les textes tapés vite. Avec un point, la forme sans point reconnaît aussi les deux écritures du texte : n'ajoutez le point que si vous voulez réellement l'exiger. Dans l'exemple, `habite a` reconnaît `habite à` et `habite a` (cas `commune-ambigue-contexte-accents-ignores` et `commune-ambigue-sans-accent-dans-le-texte`).

Le contexte rend les règles très imprécises plus sélectives, mais c'est un indice lexical : un mot de contexte voisin d'une valeur sans rapport la fait détecter quand même. Dites-le dans les limites du README du pack.

## 9. Scores et seuil

Un score est une heuristique entre 0 et 1, **pas une probabilité**. Le seuil par défaut est **0,5** (modifiable dans les réglages avancés) : une détection plus basse est écartée, mais conservée à part avec son explication.

| Situation | Score final | Exemple de l'exemple |
|---|---|---|
| Motif seul | score de la règle | `ze-phone` : 0,7, retenu sans contexte |
| Motif + mot de contexte | score + 0,35, plafonné à 1,0 | `ze-phone` avec « portable » : 1,0 |
| Motif sous le seuil + contexte | de 0,4 à 0,75 : retenu | `ze-phone-compact` : 0,4 écarté seul, 0,75 avec « joindre » |
| Motif + validateur réussi | 1,0 | `ze-numero-entreprise` avec clé juste |
| Motif + validateur échoué | supprimé | `ze-numero-entreprise` avec clé fausse |
| Contexte `required` sans mot | supprimé | `ze-communes-ambigues` sans « habite a » |

Repères pour choisir un score :

- **0,7 à 0,9** : la forme est quasi certaine à elle seule (courriel, forme très particulière).
- **0,5 à 0,65** : forme assez particulière mais pouvant se rencontrer ailleurs ; retenue sans contexte, avec risque de faux positifs. `ze-communes` est à 0,55.
- **0,4 à 0,45** : forme banale (dix chiffres collés, un prénom). Retenue **seulement avec contexte**. C'est la politique des numéros collés en Suisse et en France.
- Pour les identifiants avec validateur, 0,5 à 0,7 suffit : le validateur porte à 1,0.
- Quand deux détections se chevauchent, le moteur tranche dans cet ordre : détection manuelle, validateur réussi, intervalle inclus avec score au moins égal, score, priorité du type (`ENTITY_PRIORITY`), longueur, puis identifiants. Voir [ARCHITECTURE.md](../ARCHITECTURE.md). Un conflit entre packs se teste par `cross.json` (section 10).

## 10. Tests

Un pack sans tests n'est pas accepté : le banc commun exige `tests/cases.json` et un `README.md`.

**`packs/country-ze/tests/cases.json`** : une liste de cas. `expect` est la liste **exacte** des détections *retenues* produites par les règles **de ce pack**, type et texte, ni plus ni moins. `"expect": []` écrit un cas négatif. Tous les packs sont actifs pendant le test (AC-05), et les détections des autres packs sont ignorées, sauf si elles font disparaître une détection attendue.

```json
{
  "cases": [
    {
      "id": "telephone-groupe-sans-contexte",
      "language": "fr",
      "text": "Appelez le +999 12 345 678 demain.",
      "expect": [{ "type": "PHONE", "value": "+999 12 345 678" }]
    },
    {
      "id": "telephone-groupe-espace-insecable",
      "language": "fr",
      "text": "Tél. : +999\u00a012\u00a0345\u00a0678.",
      "expect": [{ "type": "PHONE", "value": "+999\u00a012\u00a0345\u00a0678" }]
    },
    {
      "id": "telephone-compact-avec-contexte",
      "language": "fr",
      "text": "Pour me joindre : +99912345678.",
      "expect": [{ "type": "PHONE", "value": "+99912345678" }]
    },
    {
      "id": "telephone-compact-contexte-accentue-et-majuscule",
      "language": "fr",
      "text": "TÉLÉPHONE : +99912345678",
      "expect": [{ "type": "PHONE", "value": "+99912345678" }]
    },
    {
      "id": "telephone-compact-contexte-anglais",
      "language": "en",
      "text": "Phone: +99912345678",
      "expect": [{ "type": "PHONE", "value": "+99912345678" }]
    },
    {
      "id": "telephone-compact-contexte-d-une-autre-langue",
      "language": "fr",
      "text": "Phone: +99912345678",
      "expect": []
    },
    {
      "id": "telephone-compact-sans-contexte",
      "language": "fr",
      "text": "Référence +99912345678 du dossier.",
      "expect": []
    },
    {
      "id": "telephone-trop-court",
      "language": "fr",
      "text": "Appelez le +999 12 345 67.",
      "expect": []
    },
    {
      "id": "telephone-dans-un-mot",
      "language": "fr",
      "text": "Code A+999 12 345 678.",
      "expect": []
    },
    {
      "id": "entreprise-cle-juste",
      "language": "fr",
      "text": "L'entreprise est inscrite sous le 999.1234.5678.90.",
      "expect": [{ "type": "ORGANIZATION", "value": "999.1234.5678.90" }]
    },
    {
      "id": "entreprise-cle-fausse",
      "language": "fr",
      "text": "L'entreprise est inscrite sous le 999.1234.5678.91.",
      "expect": []
    },
    {
      "id": "entreprise-un-chiffre-de-trop",
      "language": "fr",
      "text": "Numéro 999.1234.5678.900 inconnu.",
      "expect": []
    },
    {
      "id": "commune-sans-contexte",
      "language": "fr",
      "text": "Nous avons traversé Port-Lumière en début de soirée.",
      "expect": [{ "type": "LOCATION", "value": "Port-Lumière" }]
    },
    {
      "id": "commune-sans-accent-ni-majuscule",
      "language": "fr",
      "text": "arrivée à port-lumiere hier",
      "expect": [{ "type": "LOCATION", "value": "port-lumiere" }]
    },
    {
      "id": "commune-ambigue-mot-de-contexte-different",
      "language": "fr",
      "text": "Elle est domiciliée à Marais depuis 2020.",
      "expect": []
    },
    {
      "id": "commune-ambigue-contexte-accents-ignores",
      "language": "fr",
      "text": "Il habite à Marais depuis 2020.",
      "expect": [{ "type": "LOCATION", "value": "Marais" }]
    },
    {
      "id": "commune-ambigue-sans-contexte",
      "language": "fr",
      "text": "Le marais et la Source sont proches.",
      "expect": []
    },
    {
      "id": "commune-ambigue-minuscule",
      "language": "fr",
      "text": "Il habite à marais.",
      "expect": []
    },
    {
      "id": "commune-ambigue-sans-accent-dans-le-texte",
      "language": "fr",
      "text": "Elle habite a Source depuis 2020.",
      "expect": [{ "type": "LOCATION", "value": "Source" }]
    },
    {
      "id": "commune-ambigue-contexte-trop-loin",
      "language": "fr",
      "text": "Elle connaît la ville de Lyon depuis des années et parle souvent de la Source.",
      "expect": []
    }
  ]
}
```

Les cas de l'exemple suivent la grille à reprendre pour un vrai pack :

- **un cas positif par règle et par forme** (groupé, collé, avec espace insécable) ;
- **un cas négatif par piège connu** : trop court, trop long (`un-chiffre-de-trop`), au milieu d'un mot (`dans-un-mot`), clé fausse, casse ou accent qui ne doit pas passer ;
- **le contexte dans les deux sens** : avec mot, sans mot, mot de l'autre langue, mot trop loin (au-delà de cinq mots) ;
- **les séparateurs blancs** U+00A0 et U+202F, écrits `\u00a0` et `\u202f` dans le JSON des textes (jamais en caractères invisibles).

**`packs/country-ze/tests/cross.json`** : le test précédent ne voit que les détections du pack testé, donc un conflit avec un autre pack lui échappe. `expectAll` est la liste exacte de **toutes** les détections retenues, tous packs confondus.

```json
{
  "cases": [
    {
      "id": "telephone-courriel-et-date",
      "language": "fr",
      "text": "Écrire à zoe.lumiere@example.org ou appeler le +999 12 345 678 avant le 12.03.2026.",
      "expectAll": [
        { "type": "EMAIL", "value": "zoe.lumiere@example.org" },
        { "type": "PHONE", "value": "+999 12 345 678" },
        { "type": "DATE", "value": "12.03.2026" }
      ]
    },
    {
      "id": "numero-entreprise-pas-un-avs",
      "language": "fr",
      "text": "Registre de l'entreprise : 999.8765.4321.09 à Haut-Brumeval.",
      "expectAll": [
        { "type": "ORGANIZATION", "value": "999.8765.4321.09" },
        { "type": "LOCATION", "value": "Haut-Brumeval" }
      ]
    }
  ]
}
```

**Valeurs de test synthétiques uniquement (R10).** Les numéros de l'exemple sont inventés ; leurs clés EAN-13 sont calculées, ce ne sont pas des numéros attribués. Pour un vrai format, procédez de même : fabriquez les valeurs en calculant la clé, ou reprenez les valeurs d'essai que la source officielle publie (les IBAN d'exemple du registre IBAN, les cartes d'essai des prestataires de paiement). Écrivez-le dans le README du pack, comme le font `packs/country-fr/README.md` et `packs/global/README.md`. N'utilisez jamais un numéro vu dans un document réel, même modifié d'un chiffre.

## 11. Contrôle ReDoS

Une expression régulière mal écrite peut mettre des secondes, voire des minutes, à échouer sur un texte adverse : c'est un déni de service dans le navigateur de l'utilisateur. Le banc commun (`packs/_tools/packs.test.ts`) fait deux contrôles sur **chaque règle motif** :

1. **Contrôle statique sur le motif ancré.** Le motif est testé sous la forme `^(?:motif)` par `redos-detector`. On ancre parce que, sans ancre, l'outil compte les redémarrages du balayage et rejette des motifs bornés inoffensifs ; l'ancre isole le vrai danger, le retour arrière explosif dans une seule tentative.
2. **Test de durée sur entrées adverses.** Pour chaque motif, des entrées de 20 000 caractères (répétitions des caractères et des fragments du motif, et de séquences usuelles) sont balayées en entier ; chacune doit prendre **moins de 150 ms**. Ce contrôle ne se lance que si le premier passe.

Le contrôle statique repère un motif comme `(?:[0-9]+[ ]?)+x`, mortel sur une ligne de chiffres sans `x` : 28 chiffres suivis d'un point d'exclamation prennent environ 3 secondes, et chaque chiffre de plus double la durée. Corrections usuelles :

- **bornez toutes les répétitions** : `[0-9]{3}` plutôt que `[0-9]+` ; un format de longueur connue s'écrit sans quantificateur ouvert ;
- **un séparateur obligatoire** entre les groupes (`[ ]`, pas `[ ]?`) ;
- **jamais de quantificateur imbriqué** (`(a+)+`, `(a|ab)*`) ;
- **scindez en plusieurs règles** plutôt qu'une alternance : `phone-intl` et `phone-intl-00` de `country-ch` existent parce que l'alternance `\+41|0041` est refusée.

Pour vérifier un seul pack pendant l'écriture :

```bash
npx vitest run packs -t country-ze
```

**Exceptions relues.** Si le détecteur abandonne sur un motif que vous avez analysé à la main et jugé inoffensif (toutes les répétitions bornées, par exemple), l'exception s'ajoute dans `packs/_tools/redos-exceptions.json` : l'identifiant global de la règle et **la raison de la dispense**. Une exception se **relit par un humain** à la revue ; elle ne dispense que du contrôle statique, jamais du test de durée. Les deux exceptions actuelles (`global/ipv4`, `global/ipv6`) montrent le niveau de justification attendu. Ne demandez pas d'exception pour faire passer un motif dont vous ne comprenez pas le coût : réécrivez-le.

## 12. Le README du pack

Le test exige un `README.md` dans le dossier du pack. Reprenez le plan de `packs/country-fr/README.md` :

1. rôle du pack, type, dépendances ;
2. **tableau des règles** : identifiant, type d'entité, score de base, validateur, contexte (aucun, rehausse, obligatoire) ;
3. **explication de chaque forme** et de ce qui est volontairement refusé, avec les exemples ;
4. **sources** (section suivante) ;
5. **données de test** : dire qu'elles sont synthétiques et comment les clés ont été calculées ;
6. **limites connues**, sans les minimiser : ce que le pack ne détecte pas, les faux positifs possibles, les choix qui sacrifient le rappel. [docs/limites.md](limites.md) en reprend l'essentiel pour le grand public.

## 13. Valider et livrer

```bash
npx vitest run packs -t country-ze   # contrôles du pack seul
npm run lint
npm run typecheck
npm test                             # tous les packs actifs ensemble
```

Un pack qui change la détection d'un autre (cas de `cross.json`) se corrige côté pack, pas en modifiant l'attente du test. Pour les commits, la revue et les messages, voir [CONTRIBUTING.md](../CONTRIBUTING.md).

## 14. Sources officielles et licence des données

**Sources.**

- Citez, pour chaque format, la **source officielle** : textes réglementaires, documentation de l'organisme émetteur (office statistique, autorité de numérotation, registre des entreprises), norme. Écrivez l'adresse et, si possible, la date de consultation.
- **N'affirmez que ce que vous avez lu.** Les README des packs livrés disent ouvertement ce qui n'a pas pu être confirmé en ligne (par exemple « liste exacte des indicatifs non confirmée ») et le laissent à vérifier avant publication. Faites de même : une règle fondée sur un forum ou sur la mémoire du développeur est signalée comme telle.
- Un algorithme de clé se cite avec sa norme ou sa source, dans l'en-tête du fichier du validateur.

**Licence des données.**

- Une liste de termes (prénoms, noms, communes) reprise d'un fichier officiel doit avoir une licence **compatible avec une distribution sous Apache 2.0** (licences ouvertes avec simple obligation d'attribution : Licence Ouverte Etalab 2.0, utilisation libre avec mention de la source, domaine public).
- **Écartez** les licences à partage à l'identique (CC BY-SA), non commerciales (CC BY-NC) ou aux conditions floues. `lang-fr-en/README.md` consigne un cas : une ressource annoncée « CC BY-SA » n'a pas été intégrée tant que ses conditions n'étaient pas lues. En cas de doute, ouvrez une discussion avant d'intégrer le fichier.
- **Chaque source tierce s'inscrit dans le fichier [NOTICE](../NOTICE)** : source, licence, édition, extrait retenu. Même un extrait de faits (noms et effectifs) garde son attribution.
- Les règles écrites pour Lessive sont sous Apache 2.0, comme le reste du dépôt.
- Les motifs repris d'un autre projet (Presidio, sous licence MIT) se déclarent aussi dans `NOTICE`.

## Liste de contrôle

- [ ] `manifest.json` valide, `engineVersion` exacte, fichiers de règles directement dans `rules/`
- [ ] aucun type d'entité, validateur ou code hors des listes fermées
- [ ] chaque motif : borné, trois blancs acceptés, ancré pour le contrôle ReDoS, durée sous 150 ms
- [ ] les termes ambigus séparés, en casse exacte et avec contexte obligatoire
- [ ] mots de contexte sans accent, sauf raison documentée
- [ ] `tests/cases.json` : positifs, pièges, contexte dans les deux sens, séparateurs insécables ; `tests/cross.json` si un autre pack peut être concerné
- [ ] valeurs de test synthétiques ; aucune donnée réelle
- [ ] exceptions ReDoS justifiées dans `redos-exceptions.json`, ou aucune
- [ ] `README.md` du pack : règles, sources avec réserves, limites
- [ ] `NOTICE` mis à jour pour toute donnée tierce
- [ ] `npm run lint`, `npm run typecheck` et `npm test` passent
