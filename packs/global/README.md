# Pack `global`

Identifiants indépendants du pays : courriel, URL, adresses IP, IBAN de tous pays, cartes bancaires, secrets techniques. Seul pack qui détecte les IBAN (les packs pays n'en ont pas). Aucune dépendance. Toutes les valeurs de `tests/cases.json` sont synthétiques.

Seuil par défaut du moteur : 0,5. Un validateur réussi porte le score à 1,0 ; un mot de contexte à moins de 5 mots ajoute 0,35.

## Règles

| Règle | Entité | Score | Validateur | Contexte | Remarque |
|---|---|---|---|---|---|
| `email` | EMAIL | 0,9 | — | — | Local 1 à 64 caractères `[A-Za-z0-9._%+-]`, domaine à étiquettes. |
| `url` | URL | 0,9 | — | — | `http://`, `https://`, `www.`. Ponctuation finale (`.,;:!?`) et parenthèses exclues. |
| `ipv4` | IP_ADDRESS | 0,6 | — | ip, serveur, hôte… (boost) | Quatre octets 0–255 vérifiés par la regex, sans zéro de tête. |
| `ipv6` | IP_ADDRESS | 0,7 | — | ip, ipv6, serveur… (boost) | Forme complète et formes compressées `::`. Pas de forme IPv4 intégrée. |
| `iban-compact` | IBAN | 0,5 → 1,0 | `iban_mod97` | — | `CC99` + 11 à 30 caractères alphanumériques. |
| `iban-grouped` | IBAN | 0,5 → 1,0 | `iban_mod97` | — | Groupes de 4 séparés par une espace, dernier groupe de 1 à 3 caractères. |
| `credit-card-grouped` | CREDIT_CARD | 0,6 → 1,0 | `luhn` | carte, card, Visa, Mastercard, CB, amex… (boost) | 4-4-4-4, 4-6-5 (Amex), 4-6-4 (Diners) ; séparateur espace ou tiret, identique dans tout le numéro. |
| `credit-card-compact` | CREDIT_CARD | 0,6 → 1,0 | `luhn` | idem | 13 à 19 chiffres, premier chiffre 2 à 6, exclut 13 chiffres commençant par 756 (AVS). |
| `aws-access-key-id` | SECRET | 0,9 | — | — | `AKIA` / `ASIA` + 16 caractères base 32. |
| `github-token` | SECRET | 0,95 | — | — | `ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_` + 36 à 255 caractères. |
| `github-fine-grained-pat` | SECRET | 0,95 | — | — | `github_pat_` + 22 à 255 caractères. |
| `slack-token` | SECRET | 0,95 | — | — | `xoxb-`, `xoxp-`, `xoxa-`, `xoxr-`, `xoxs-` + segments séparés par `-`. |
| `stripe-secret-key` | SECRET | 0,95 | — | — | `sk_live_`, `sk_test_`, `rk_live_`, `rk_test_`. |
| `google-api-key` | SECRET | 0,9 | — | — | `AIza` + 35 caractères. |
| `anthropic-api-key` | SECRET | 0,95 | — | — | `sk-ant-<mot><2 chiffres>-` + 20 à 200 caractères. |
| `openai-api-key` | SECRET | 0,85 | — | — | `sk-proj-`, `sk-svcacct-`, `sk-admin-` + 40 à 200 caractères. |
| `openai-legacy-api-key` | SECRET | 0,75 | — | — | `sk-` + 32 à 64 caractères alphanumériques. |
| `jwt` | SECRET | 0,9 | — | — | Trois segments base64url ; en-tête et charge commencent par `eyJ`. |
| `pem-private-key` | SECRET | 0,98 | — | — | Bloc `-----BEGIN … PRIVATE KEY-----` jusqu'à `-----END … PRIVATE KEY-----`. Sans drapeau `s` (le corps utilise `\s`). |
| `password-assignment` | SECRET | 0,4 (0,75 avec contexte) | — | **obligatoire** : password, passwd, pwd, mot de passe, mdp | Ne retient que la valeur, pas le mot-clé (lookbehind). 6 à 64 caractères dont un chiffre ou un symbole. |

## Interactions avec les autres types

- **IBAN / carte** : les cartes groupées exigent un séparateur identique et un premier bloc non précédé d'un mot ou d'un `+`. Un IBAN groupé dont quatre blocs consécutifs passent Luhn (cas `iban-negatif-iban-ne-donne-pas-carte`) est résolu par le moteur : l'IBAN validé contient la carte et l'emporte.
- **AVS (`756.1234.5678.97`)** : les points ne sont pas des séparateurs de carte ; sans points, les 13 chiffres en `756` sont exclus par la règle compacte.
- **Téléphones** : `+41 79 …`, `0041 79 …`, `0033…` ne correspondent à aucun format de carte (groupes différents, premier chiffre 0, `+` interdit devant).
- **URL / IP / courriel** : une URL qui contient une IP ou un courriel (même score 0,9 que le courriel) l'emporte comme intervalle englobant.
- **Dates** (pack `dates`) : `12.03.2024` n'a que trois segments, jamais pris pour une IPv4.

## Valeurs de test publiées

IBAN d'exemple publiés dans le registre IBAN de SWIFT et par les banques centrales (CH93 0076 2011 6238 5295 7, DE89 3704 0044 0532 0130 00, FR76 3000 6000 0112 3456 7890 189, GB82 WEST 1234 5698 7654 32, BE68 5390 0754 7034, ES91…, IT60…, LI21…) ; cartes de test publiées par les prestataires de paiement (4111 1111 1111 1111, 5555 5555 5555 4444, 3782 822463 10005, 3056 930902 5904…) ; clé AWS d'exemple de la documentation AWS (`AKIAIOSFODNN7EXAMPLE`). Le IBAN `DE77 3704 0044 0532 0008 00` a été fabriqué (script jetable hors dépôt) pour que quatre blocs consécutifs passent Luhn. Les autres secrets sont fictifs (`EXAMPLE`, zéros).

## Sources des formats (à revérifier avant publication, non consultées en ligne lors de la rédaction)

- Courriel : RFC 5322 (§3.4.1, forme usuelle). URL : RFC 3986. IPv4 : notation décimale pointée (RFC 791). IPv6 : RFC 4291 §2.2 et RFC 5952.
- IBAN : ISO 13616-1 ; contrôle ISO 7064 modulo 97-10 ; registre IBAN de SWIFT.
- Carte : ISO/IEC 7812-1 (numérotation et clé de Luhn).
- AWS : documentation IAM « Unique identifiers » (préfixes `AKIA` clé d'accès longue durée, `ASIA` clé temporaire).
- GitHub : documentation « About authentication to GitHub », section « GitHub's token formats » (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, `github_pat_`).
- Slack : documentation « Token types » (préfixes `xoxb-`, `xoxp-`, …).
- Stripe : documentation « API keys » (`sk_live_`, `sk_test_`, `rk_live_`, `rk_test_`).
- JWT : RFC 7519 ; JWS RFC 7515 ; base64url RFC 4648 §5.
- PEM : RFC 7468 (encodages textuels), PKCS#8 RFC 5958.
- **Formats observés, non garantis par l'éditeur** : Google `AIza…` (clé d'API, pas de documentation officielle du préfixe), Anthropic `sk-ant-api03-…` / `sk-ant-admin01-…`, OpenAI `sk-…` / `sk-proj-…`.

## Limites connues

- **Contrôle ReDoS du banc : 8 motifs signalés** (`email`, `ipv4`, `ipv6`, `google-api-key`, `anthropic-api-key`, `openai-api-key`, `jwt`, `pem-private-key`). Cause : `redos-detector` préfixe tout motif non ancré par `[^]*` et compte comme ambiguïté les départs possibles à chaque position d'une série de caractères de classe (par exemple le préfixe `AIza` est lui-même composé de caractères de la classe du corps). Avec un `^` devant, les motifs sauf `ipv4` passent, et `ipv6` passe par morceaux. Mesure réelle : au plus 14 ms sur des entrées adverses de 100 000 caractères, motifs à bornes finies, aucun quantificateur imbriqué.
- IBAN groupé : un mot de 1 à 3 caractères en majuscules juste après un IBAN dont le dernier groupe est plein peut être avalé ; le validateur échoue alors et l'IBAN n'est pas détecté. IBAN en minuscules non détecté.
- IBAN avec un autre séparateur que l'espace (point, tiret) : non détecté.
- Carte : seuls les groupements usuels (4-4-4-4, 4-6-5, 4-6-4) ; pas de groupement pour 18 et 19 chiffres ; compacte limitée aux numéros commençant par 2 à 6.
- IPv4 : un numéro de version à quatre segments (`2.10.4.1`) est détecté (score 0,6) ; adresses avec zéro de tête (`010.001.001.001`) non détectées.
- IPv6 : un identifiant de type `ab::cd` (par exemple un espace de noms C++ en hexadécimal) est pris pour une adresse.
- URL : parenthèses balancées dans l'URL (Wikipédia) coupées au premier `(` ; URL sans schéma ni `www.` non détectées.
- Courriel : parties locales entre guillemets, commentaires et domaines à adresse IP entre crochets non pris en charge ; noms de domaine internationalisés non ASCII non détectés.
- Secrets : clé PEM tronquée (sans ligne `END`) non détectée ; en-têtes legacy chiffrés (`Proc-Type:`) non pris en charge ; les blocs publics (`PUBLIC KEY`, `CERTIFICATE`) ne sont volontairement pas détectés.
- `password-assignment` : ne couvre que `mot-clé` puis `:` ou `=` ; pas de valeur sur la ligne suivante, pas de mots de passe sans symbole ni chiffre.
