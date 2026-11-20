# Pack `dates`

Dates numériques, littérales et plages de deux jours à mois partagé, en français et en anglais (type d'entité `DATE`). Pack global : aucune dépendance.

## Règles

| Fichier | Règles | Langues | Score | Exemples |
|---|---|---|---|---|
| `numeric.json` | `num-dot`, `num-slash`, `num-dash`, `num-iso` | toutes | 0,6 | `12.03.1985` (usage suisse), `12/03/1985`, `12-03-1985`, `1985-03-12` |
| | `num-dot-yy`, `num-slash-yy` | toutes | 0,45, retenue seulement avec contexte (+0,35) | `12.03.85`, `12/03/85` |
| `literal-fr.json` | `fr-long-*`, `fr-weekday-long-*` | fr | 0,7 | `12 mars 1985`, `1er avril 2020`, `15 janv. 2023`, `lundi 5 février 2024` |
| | `fr-short-*` | fr | 0,55 | `3 janvier`, `14 juin` |
| `literal-en.json` | `en-mdy-*`, `en-dmy-*`, `en-weekday-*` | en | 0,7 | `March 12, 1985`, `12 March 1985`, `12th of March 1985`, `Monday, March 12, 1990` |
| | `en-md-*`, `en-dm-*` | en | 0,55 | `Mar. 12`, `12 March`, `1st of September` |
| `ranges.json` | `fr-range-*`, `fr-coordinated-*` | fr | 0,7 | `du 7 au 11 octobre`, `les 23 et 24 novembre 2027` |
| | `en-range-dm-*`, `en-range-md-*` | en | 0,7 | `7 to 11 October`, `23 and 24 November`, `October 7–11, 2027` |

**Pourquoi tant de règles littérales.** Le contrôle ReDoS statique (motif ancré) rejette les alternances de formes du jour et les `?` multiples dans un même motif. Chaque motif littéral est donc décliné par forme du jour : `d1` (un chiffre), `d2` (deux chiffres 01-31, validés par anticipation), `er` (« 1er », français), et, en anglais, avec ou sans suffixe ordinal (`-ord`) et avec « of » (`-ord-of`). Les règles d'un même groupe ont le même score.

- Numérique : jour 1-31 et mois 1-12 (1 ou 2 chiffres) contrôlés par la regex ; année 1900-2099 sur 4 chiffres. Les bornes (chiffre, point, barre oblique devant ; chiffre ou séparateur+chiffre derrière) évitent de couper un nombre plus long : numéros AVS, adresses IP, numéros de téléphone à points.
- `JJ.MM.AA` et `JJ/MM/AA` : jour et mois sur 2 chiffres, score 0,45 (sous le seuil) ; mots de contexte (`né`, `née`, `naissance`, `date`, `le`, `born`, `birth`, `date`, `DOB`) : +0,35.
- Littéral : insensible à la casse et aux accents courants (`février`/`fevrier`, `août`/`aout`). Mois complets ou abrégés (`janv.`, `févr.`, `sept.`, `Mar.`, `Sept`). Le jour de la semaine est inclus dans la valeur seulement pour les formes avec année : français `lundi 5 février 2024`, anglais `Monday, March 12, 1990` et `Monday 12 March 1990` (noms complets). Ailleurs (`samedi 14 juin`, `Tue 4 June`), seule la date est détectée. Le « le » de « le 3 janvier » n'est pas inclus.
- Plages et coordinations : deux jours de 1 à 31 (zéro initial accepté, ainsi que `1er` en français), un mois partagé et une année 1900–2099 facultative. En français, les introducteurs `du … au …` ou `les … et …` sont inclus dans la valeur ; en anglais, les formes `jour to/and jour mois` et `mois jour–jour` / `mois jour and/to jour` sont couvertes. Le tiret anglais est `-` ou `–`, sans espaces. Les règles complètes ont un score de 0,7 pour primer sur la dernière date isolée ; la forme avec année englobe celle sans année et l’emporte à score égal. Les dates de test et les motifs sont synthétiques, écrits pour ces conventions, sans liste tierce ajoutée.
- Les règles littérales françaises ont `languages: ["fr"]`, les anglaises `["en"]`, les numériques `"any"`.

## Ce qui n'est pas détecté

Heures (`12:30`, `12h30`), versions (`1.2.3`), montants (`12.50`), numéros AVS, IBAN, téléphones, adresses IPv4, références de loi (`art. 12.3`), plages de pages, années seules (`en 2020`), mois et année (`March 1985`), jours de la semaine seuls.

## Limites connues

- Les dates impossibles ne sont pas toutes rejetées par la regex : `31.02.2020`, `31/04/2020` sont détectées (la regex contrôle jour 1-31 et mois 1-12, pas le nombre de jours du mois). `32.01.2020` et `31/13/2020` ne sont pas détectées.
- Format américain `MM/JJ/AAAA` : détecté seulement si les deux nombres sont <= 12 (lu alors comme JJ/MM) ; `03/25/2020` n'est pas détecté.
- `JJ.MM.AA` n'est retenue qu'avec un mot de contexte (score 0,45 sous le seuil de 0,5) : une version telle que `10.12.15` n'est pas détectée. Les formes `J.M.AA` à un chiffre ne sont pas prises en compte.
- Années à deux chiffres dans les formes littérales, listes de trois jours ou plus, plages changeant de mois et suffixes ordinaux anglais dans les plages : non gérés comme une expression complète. Les dates simples qu’ils contiennent peuvent être détectées séparément. Les plages ne valident ni le nombre de jours du mois ni l’ordre chronologique des deux bornes.
- `may` et `mar` en anglais sont des mots courants : `may 12` est lu comme une date.
- Les plages exigent un seul espace horizontal (ordinaire, insécable U+00A0 ou fine insécable U+202F) à chaque séparation ; elles ne franchissent pas les retours à la ligne.
- Les séparateurs entre jour, mois et année sont un seul caractère blanc (`\s` : espace, espace insécable U+00A0, espace fine insécable U+202F). Cas de test avec U+00A0 et U+202F dans `tests/cases.json`.
