# Pack `country-fr`

Identifiants français : NIR, SIRET, SIREN, téléphones, codes postaux suivis d'une commune.
Pack de type `country`, moteur 0.1.0. Les packs `country-fr` et `country-ch` peuvent être actifs ensemble.

**Pas de règle IBAN.** Le pack `global` détecte tous les IBAN, français compris. Un IBAN FR n'est donc
jamais traité ici ; les motifs de ce pack refusent d'ailleurs de démarrer au milieu d'une suite de chiffres
ou collés à des lettres, pour ne pas lire un fragment d'IBAN comme un téléphone ou un SIREN.

## Règles

| Règle | Entité | Score de base | Validateur | Contexte |
|---|---|---|---|---|
| `fr-nir-compact` | `FR_NIR` | 0,6 | `fr_nir_key` | facultatif (+0,35) |
| `fr-nir-spaced` | `FR_NIR` | 0,6 | `fr_nir_key` | facultatif (+0,35) |
| `fr-siret` | `FR_SIRET` | 0,6 | `fr_siret_luhn` | facultatif (+0,35) |
| `fr-siren` | `FR_SIREN` | 0,5 | `fr_siren_luhn` | **obligatoire** |
| `fr-phone-national` | `PHONE` | 0,65 | aucun | facultatif (+0,35) |
| `fr-phone-international` | `PHONE` | 0,8 | aucun | facultatif (+0,35) |
| `fr-phone-international-compact` | `PHONE` | 0,8 | aucun | facultatif (+0,35) |
| `fr-phone-international-paren` | `PHONE` | 0,8 | aucun | facultatif (+0,35) |
| `fr-postal-code-commune` | `LOCATION` | 0,5 | aucun | **obligatoire** |

Un validateur réussi porte le score à 1,0 ; un validateur échoué supprime la détection. Seuil par défaut : 0,5.
Mots de contexte : fenêtre de 5 mots de chaque côté, sans tenir compte de la casse ni des accents.
Les sigles (SIREN, SIRET, NIR, INSEE, tel, fax…) sont déclarés sous `any`, donc valables en français et en anglais.

### NIR (`FR_NIR`)

15 caractères : sexe (1 ou 2), année (2 chiffres), mois, département (2 chiffres, ou `2A`/`2B` pour la Corse),
commune (3 chiffres), numéro d'ordre (3 chiffres), clé (2 chiffres).

- Mois accepté : 01 à 12, ou 20 à 42 et 50 à 99 (cas spéciaux : mois de naissance inconnu, numéros d'attente, etc.).
  00, 13 à 19 et 43 à 49 sont refusés par le motif.
- Deux écritures : sans espaces (`185057800608491`, clé éventuellement séparée), et avec espaces
  (`1 85 05 78 006 084 91`). Pour l'outre-mer (département à 3 chiffres), le groupement
  `1 90 12 971 06 045 73` est reconnu.
- Le validateur `fr_nir_key` calcule la clé (97 moins le reste modulo 97 du numéro de 13 chiffres ; Corse : 2A vaut 19
  et 2B vaut 18). Une clé fausse supprime la détection : un NIR mal recopié n'est pas détecté.
- Le contexte (sécurité sociale, sécu, NIR, INSEE, carte Vitale…) est facultatif : la clé suffit (1 faux positif sur 97).

### SIRET (`FR_SIRET`) et SIREN (`FR_SIREN`)

- SIRET : 14 chiffres (SIREN de 9 chiffres + NIC de 5 chiffres), écrits `123 456 782 00010`, `12345678200010`,
  `123456782 00010`, séparateurs espace, point, espace insécable. Validé par Luhn (exception La Poste dans le validateur).
- SIREN : 9 chiffres, `123 456 782`, `123.456.782` ou `123456782`. **Le contexte est obligatoire** (SIREN, RCS, immatriculé,
  entreprise, société, raison sociale, Kbis, SAS, SARL…), car un nombre de 9 chiffres sur 10 passe Luhn.
- Un SIREN n'est jamais détecté à l'intérieur d'un SIRET : le motif SIREN refuse un numéro suivi de 5 chiffres
  (le NIC) ou de tout autre chiffre, et refuse un début précédé d'un chiffre. Cela vaut aussi quand la clé du
  SIRET est fausse : le SIRET est alors écarté et son SIREN ne ressort pas (cas de test dédiés). Quand les deux
  apparaissent, le SIRET validé l'emporte sur tout chevauchement dans la résolution des conflits.

### Téléphones (`PHONE`)

- National : `0X XX XX XX XX`, séparateurs espace, point, tiret, espace insécable, ou aucun (`0612345678`).
  Préfixes 01 à 07 et 09.
- International : `+33 X XX XX XX XX`, `+33 (0)X XX XX XX XX`, `0033 X XX XX XX XX`, `+33612345678`.
- Exclus : les numéros 08 (numéros verts et à valeur ajoutée, qui ne désignent pas une personne) ; les numéros courts
  (112, 15, 17, 18, 3949, 118 xxx…), faute de motif à 10 chiffres. Ne sont pas non plus lus comme téléphones : un NIR, un
  SIRET, un IBAN, une date, un montant, un ISBN (motif interdit de démarrer au milieu d'une suite de chiffres ou collé à
  des lettres, et interdit de continuer par un chiffre).
- Pas de validateur : le score de 0,65 (0,8 en international) passe le seuil sans contexte. Le contexte (tél, téléphone,
  portable, mobile, phone, fax…) porte le score à 1,0.

### Codes postaux (`LOCATION`)

Cinq chiffres (01000 à 98999 sauf 96xxx et 99xxx ; Corse 20xxx comprise), une espace, puis un nom de commune en
majuscules (tirets, apostrophes et espaces admis, lettres accentuées comprises) : `74160 SAINT-JULIEN-EN-GENEVOIS`. La
détection couvre le code et la commune. Contexte **obligatoire** : code postal, CP, adresse, domicile, rue, avenue,
boulevard, chemin, impasse, allée, place, route, résidence, cedex, BP ; en anglais postal code, zip, address, street,
road. La règle est activée, car la double exigence (majuscules + mot de contexte) la rend assez sélective ;
elle reste la plus fragile du pack.

## Sources

- INSEE, définition du NIR : <https://www.insee.fr/fr/metadonnees/definition/c1409> (13 chiffres + clé de 2 chiffres ;
  sexe, année, mois, lieu de naissance, ordre). Le calcul de la clé et le cas de la Corse sont ceux documentés dans l'en-tête
  de `src/core/validators/fr_nir_key.ts`. Les plages de mois spéciaux (20-42, 50-99) sont reprises de la documentation
  RNIPP/INSEE relayée par les organismes sociaux : elles n'ont pas pu être relues sur une page INSEE lors de la recherche.
- INSEE, répertoire Sirene (SIREN 9 chiffres, NIC 5 chiffres, SIRET 14 chiffres, Luhn) : <https://www.sirene.fr/>.
  La page de définition INSEE n'était pas accessible depuis l'environnement de développement ; la structure
  est confirmée par l'en-tête des validateurs `fr_siren_luhn` et `fr_siret_luhn`.
- ARCEP, décision n° 2022-1583 (plan national de numérotation) : <https://www.arcep.fr/uploads/tx_gsavis/22-1583.pdf>
  et version française : <https://www.arcep.fr/fileadmin/cru-1714402758/user_upload/44-22-version-francaise.pdf>.
  Retenu : numéros géographiques 01 à 05, mobiles 06 et 07, 09 ; 08 = services à valeur ajoutée ; numéros courts
  de 3 à 6 chiffres (15, 17, 18, 112, 3949, 118 xxx).
- ARCEP, fiche pratique sur le plan de numérotation : <https://www.arcep.fr/mes-demarches-et-services/entreprises/fiches-pratiques/plan-numerotation-professionnels.html>.

## Données de test

`tests/cases.json` ne contient que des valeurs synthétiques : clés NIR et clés de Luhn calculées, jamais de vrais numéros.
Les SIREN `123456782` et `987654324` sont des suites construites pour passer Luhn ; ils peuvent coïncider par hasard avec
une entreprise réelle. Les téléphones ont été choisis dans des plages que l'on sait réservées à la fiction (01 99 00, 06 39 98,
07 38 76, 04 65 71), non vérifiées auprès de l'ARCEP pendant cette recherche.

## Limites connues

- Un NIR dont la clé est fausse (faute de frappe) n'est pas détecté. Un NIR avec des séparateurs autres que l'espace
  (points, tirets) ou une répartition d'espaces inhabituelle n'est pas détecté.
- Sexe limité à 1 et 2 : les numéros provisoires (3, 4, 7, 8) ne sont pas couverts.
- Un SIREN sans mot de contexte à moins de 5 mots n'est pas détecté. Un SIREN qui fait partie d'un numéro de TVA
  intracommunautaire (`FR 12 123 456 789`) n'est pas détecté.
- Téléphones : les numéros 08, les numéros courts et les formats avec parenthèses autour de l'indicatif régional
  `(01) 23 45 67 89` ne sont pas détectés. Un nombre de 10 chiffres commençant par 0 et groupé par paires est lu comme
  un téléphone, même s'il s'agit d'une référence.
- Les autres pays et les territoires d'outre-mer à indicatif propre (+262, +590, +594, +596…) ne sont pas couverts.
- Codes postaux : communes écrites en minuscules ou en casse mixte ignorées ; `CEDEX` est inclus dans la détection
  mais pas son numéro ; une ligne tout en majuscules précédée d'un nombre de 5 chiffres près d'un mot comme « place »
  peut donner un faux positif. Les adresses postales complètes (rue, numéro) restent hors MVP.
- Les motifs sont écrits pour passer le contrôle ReDoS du banc (alternatives à longueur fixe, pas de séparateurs
  facultatifs successifs) : c'est la raison de la multiplication des règles NIR et téléphone.
