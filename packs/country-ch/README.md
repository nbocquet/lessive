# Pack `country-ch` (Suisse)

Identifiants et coordonnées suisses. Pack de type `country`, moteur 0.1.0. Les règles ne
dépendent d'aucune langue (`languages` absent) : un numéro AVS est détecté de la même façon
dans un texte français, anglais ou allemand. Les mots de contexte allemands et italiens sont
rangés dans la liste `any`, le schéma des packs ne connaissant que `fr` et `en`.

Ce pack ne contient **aucune règle IBAN** : le pack `global` détecte tous les IBAN, suisses
compris. Les règles de téléphone écartent les IBAN suisses (voir « Limites »).

## Règles

| Règle (`country-ch/…`) | Entité | Score de base | Validateur | Contexte |
|---|---|---|---|---|
| `avs` | `CH_AVS` | 0,7 | `ean13` | non |
| `avs-compact` | `CH_AVS` | 0,5 | `ean13` | **obligatoire** |
| `uid` | `CH_UID` | 0,7 | `ch_uid_mod11` | non |
| `phone-intl` | `PHONE` | 0,75 | aucun | rehausse (+0,35) |
| `phone-intl-00` | `PHONE` | 0,75 | aucun | rehausse |
| `phone-national` | `PHONE` | 0,6 | aucun | rehausse |
| `phone-national-compact` | `PHONE` | 0,4 | aucun | rehausse, et nécessaire pour passer le seuil de 0,5 |
| `postal-code` | `LOCATION` | 0,5 | aucun | **obligatoire** |

Un validateur réussi porte le score à 1,0 ; un validateur échoué supprime la détection.

### AVS (`CH_AVS`)

Numéro à 13 chiffres : `756` (code pays GS1 de la Suisse), 9 chiffres anonymes, 1 chiffre de
clé. Présentation officielle : `756.XXXX.XXXX.XC`. La clé est celle d'un code EAN-13
(validateur `ean13`). Formes acceptées :

- `756.1234.5678.97`, `756 1234 5678 97` (points ou espaces, y compris insécables) : règle `avs`.
- `7561234567897` (13 chiffres collés) : règle `avs-compact`, **avec mot de contexte obligatoire**
  (AVS, AHV, NAVS, Sozialversicherungsnummer, social security…). Raison : les codes-barres
  EAN-13 des produits suisses commencent aussi par 756 et seraient autrement tous signalés
  quand leur clé est juste (elle l'est toujours, c'est un EAN).

### IDE (`CH_UID`)

`CHE-123.456.789`, `CHE123456789`, avec séparateurs points, tirets ou espaces, suivi
facultativement de `TVA`, `MWST` ou `IVA` (le suffixe fait partie de la valeur détectée).
Le préfixe `CHE` est obligatoire dans le motif (neuf chiffres nus donneraient trop de faux
positifs). Clé modulo 11 vérifiée par `ch_uid_mod11`. Le motif est insensible à la casse.

### Téléphones suisses (`PHONE`)

- `phone-intl` : `+41 79 123 45 67`, `+41 (0)79 123 45 67`, `+41791234567`.
- `phone-intl-00` : `0041 22 123 45 67` (règle séparée de `phone-intl` : le détecteur de ReDoS
  refuse l'alternance `\+41|0041`).
- `phone-national` : `079 123 45 67`, `022 123 45 67`, `058 123 45 67`, `079.123.45.67`,
  `022/123 45 67`, et les numéros gratuits ou surtaxés `0800 123 456` / `0900 123 456`.
- `phone-national-compact` : `0791234567`. Score sous le seuil par défaut : il n'est retenu qu'avec
  un mot de contexte (tél, natel, mobile, portable, Handy, phone…).

Chaque numéro compte 10 chiffres avec le zéro de tête, soit 9 sans lui. Les motifs refusent une
correspondance précédée d'un mot, d'un `+`, ou d'un chiffre suivi d'un séparateur : cela évite de
prendre un morceau d'IBAN (`CH56 0483 5012 3456 …`) ou d'un grand nombre pour un téléphone. Les
dates (`01.02.2024`, `2024-03-15`) et montants (`1'234.50`) ne correspondent pas aux formes.
Les numéros français (`04 50 12 34 56`, `+33 …`) ne correspondent pas non plus ; ils relèvent
du pack `country-fr`.

### Codes postaux (`LOCATION`)

Quatre chiffres entre 1000 et 9699, **suivis d'une majuscule** (début d'un nom de localité) ou
**précédés de `CH-`** (la valeur inclut alors `CH-`). Un mot de contexte est obligatoire dans une
fenêtre de 5 mots : NPA, code postal, case postale, CP, adresse, rue, route, chemin, avenue,
domicile, localité ; postcode, postal code, zip, address, street, road ; PLZ, Postleitzahl,
Postfach, Adresse, Strasse, Weg, Gasse ; indirizzo, via, CAP. Seul le code est détecté, pas le nom
de la localité (le NER s'en charge).

La règle est livrée **activée** : l'exigence de contexte cumulée à celle de la majuscule ou de
`CH-` laisse peu de faux positifs dans les tests (montants « 1500 Francs », années, numéros sans
contexte). Elle reste la plus fragile du pack : voir « Limites ».

## Validateurs

`ean13` et `ch_uid_mod11` sont fournis par le moteur (`src/core/validators/`). `ean13` ne vérifie
que les 13 chiffres et la clé : le préfixe 756 et la présentation sont contrôlés par le motif.

## Tests

`tests/cases.json` : 45 cas (fr, en, allemand ; positifs, négatifs et pièges). Toutes les
valeurs sont synthétiques ; les clés EAN-13 et modulo 11 ont été calculées, ce ne sont pas de vrais
numéros. Le banc commun (`packs/_tools/packs.test.ts`) vérifie aussi l'absence de ReDoS.

## Sources

- Numéro AVS à 13 chiffres, structure 756 + 8 chiffres aléatoires + clé :
  CLEISS, « Introduction d'un nouveau numéro AVS depuis le 1er juillet 2008 »
  (https://www.cleiss.fr/actu/2008/0808suisse.html) ; OFAS / ahv-iv.ch, glossaire « numéro AVS »
  (https://www.ahv-iv.ch/fr/Assurances-sociales/Glossaire/term/ahv-nummer) ; directives de l'OFAS sur
  le numéro AVS (https://sozialversicherungen.admin.ch). La clé EAN-13 est documentée dans
  l'en-tête de `src/core/validators/ean13.ts`.
- IDE et suffixes TVA / MWST / IVA : AFC, « Numéro d'identification des entreprises (IDE) »
  (https://www.estv.admin.ch/fr/numero-identification-des-entreprises-ide) : forme
  `CHE-123.456.789 TVA`, suffixe en français TVA, allemand MWST, italien IVA. L'algorithme modulo 11
  vient de la norme eCH-0097 et de la LIDE (RS 431.03), telles que citées dans
  `src/core/validators/ch_uid_mod11.ts` ; la page de l'AFC ne le décrit pas.
- Plan de numérotation : OFCOM (BAKOM), page des prescriptions techniques et administratives
  (https://www.bakom.admin.ch/fr/prescriptions-techniques-et-administratives). Le document
  d'attribution des blocs de numéros consulté ne détaille pas les indicatifs.

**Non confirmé en ligne dans cette session** : la liste exacte des indicatifs (mobiles 075 à 079,
058, 0800, 084x, 090x, régionaux 021, 022, 027, 031, 044…) et la longueur de 9 chiffres hors
zéro de tête. Les motifs reposent sur la forme `0` + 9 chiffres, que Nico peut vérifier dans le plan
E.164 de l'OFCOM (ordonnance sur les ressources d'adressage, RS 784.104) avant publication. Les
motifs n'imposent volontairement aucune liste d'indicatifs : un indicatif inexistant sera signalé.

## Limites

- Les téléphones n'ont pas de validateur : tout `0` + 9 chiffres groupés comme un numéro suisse
  est signalé, même si l'indicatif n'existe pas. Un numéro étranger collé peut être pris pour un
  numéro suisse s'il suit cette forme. Les formes sans séparateur ne sont retenues qu'avec contexte.
- Les numéros avec indicatif `0041` et `(0)` ensemble (`0041 (0)79 …`) ne sont pas reconnus.
- Les numéros courts (112, 1818, 0848 à 6 chiffres) et les extensions (« int. 123 ») ne sont pas
  couverts.
- AVS compact : sans mot de contexte, un numéro AVS collé n'est pas signalé (choix délibéré, voir
  plus haut). La forme avec points ou espaces l'est toujours.
- Codes postaux : une année ou un nombre de 1000 à 9699 suivi d'un mot à majuscule à moins de
  5 mots d'un mot comme « rue » ou « adresse » sera signalé à tort. Les codes postaux du
  Liechtenstein (9485-9498) sont dans la plage ; les NPA suisses 9700 et plus n'existent pas.
  La localité n'est pas détectée.
- Les mots de contexte sont comparés mot entier : « Bahnhofstrasse » ne déclenche pas « Strasse ».
- Un numéro AVS ou IDE à clé fausse (faute de frappe) n'est pas signalé : c'est le choix du
  validateur. À signaler à l'interface si l'utilisateur veut un mode plus prudent.
