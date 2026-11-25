# Textes d'exemple

Sept textes pour essayer Lessive sans utiliser vos propres documents. Ouvrez-en un, copiez-le dans l'application ou importez le fichier avec « Ou importer un fichier texte (.txt, .md) », puis suivez le parcours : vérification, résultat, réponse du LLM. Le journal `.log` se colle dans l'application ou se traite avec le CLI (`lessive docs/exemples/07-acces-nginx.log`).

**Toutes les données sont inventées** ([R10](../../CONTRIBUTING.md#données-synthétiques-r10)) : noms fabriqués, courriels en `example.org`, `example.com` ou `example.fr`, adresses IP réservées à la documentation (`192.0.2.0/24`, `198.51.100.0/24`, `2001:db8::/32`), numéros français des plages réservées à la fiction, IBAN et carte bancaire d'essai publiés, clés de contrôle (AVS, NIR, SIREN, SIRET) calculées. Toute ressemblance avec une personne réelle serait fortuite.

| Fichier | Situation | Ce qu'il montre |
|---|---|---|
| [01-courriel-rh.txt](01-courriel-rh.txt) | Courriel RH, Suisse romande | Téléphones suisses, AVS, adresse et case postale, dates. Sans modèle, les noms rares (`Amandine Corvelet`, `Gaspard Oulevay`) restent en clair ; avec le modèle, ils sont repérés. |
| [02-compte-rendu-reunion.md](02-compte-rendu-reunion.md) | Compte rendu de réunion en Markdown | Plusieurs personnes et organisations, titre « Dr », plage de dates (`du 7 au 11 décembre`). Le modèle est indispensable pour les organisations et les lieux. Idéal pour la Pseudonymisation : la même personne garde le même repère tout au long du texte. |
| [03-demande-remboursement.txt](03-demande-remboursement.txt) | Lettre à un service client | Carte bancaire et IBAN (clés vérifiées), téléphone, adresse. Les règles suffisent presque entièrement. |
| [04-dossier-administratif-fr.txt](04-dossier-administratif-fr.txt) | Dossier administratif, France | NIR, SIREN, SIRET, IBAN français, téléphones fixe et portable français, date de naissance. |
| [05-ticket-support-en.txt](05-ticket-support-en.txt) | Ticket de support en anglais | Adresses IPv4 et IPv6, URL, courriel, dates en anglais. Choisir « Anglais » ou « Automatique » comme langue du texte. |
| [06-limites.txt](06-limites.txt) | Note interne sans aucun nom | Ce que Lessive **ne remplace pas** : la personne reste reconnaissable par sa fonction, son parcours et sa situation (« seule femme de l'équipe », « arrêt maladie »). Voir [les limites](../limites.md). |
| [07-acces-nginx.log](07-acces-nginx.log) | Journal d'accès nginx (format « combined ») | Adresses IPv4, IPv6 et privées, courriels en utilisateur authentifié et dans les paramètres d'URL, URL de provenance, IBAN et nom dans une requête. Idéal pour le CLI, qui traite le fichier ligne par ligne. |

## Ce que donne le moteur sur ces exemples

Résultats observés en novembre 2026 avec le CLI (`lessive --mask-dates`), avec et sans `--ner ./models/Xenova/camembert-ner`. Ils permettent de repérer ce qu'il faut corriger à l'étape « Vérification » :

- **Sans modèle**, les noms peu courants restent en clair dans les exemples 01, 02 et 05 ; les noms des listes intégrées (prénoms et noms fréquents) et ceux précédés de « Mme », « M. » ou « Dr » sont repérés.
- **Avec le modèle**, les formules d’appel « Madame, Monsieur », le libellé « Numéro AVS : » et « IT support » dans une signature sont désormais filtrés ; les numéros et les véritables raisons sociales restent détectables. Il reste des erreurs à corriger à la vérification, notamment les noms de salle ou de bâtiment pris pour des lieux et « Banque Cantonale fictive » classée comme lieu ([#32](https://github.com/nbocquet/lessive/issues/32), [mesure et périmètre](../evaluation-ner.md#vérification-des-faux-positifs-ner-15-32--25-novembre-2026)).
- Dans « Case postale 312, 1211 Genève 3 » (01), le numéro d'office postal final « 3 » reste en clair ([#33](https://github.com/nbocquet/lessive/issues/33)).
- Dans le journal nginx (07), `--mask-dates` remplace désormais les horodatages entiers : `[21/Nov/2026:08:14:02 +0100]` devient `[[DATE]]`, les crochets d'origine étant conservés. Les formes Apache error (`Sat Nov 21 08:14:02.123456 2026`), ISO 8601 (`2026-11-21T08:14:02+01:00`) et syslog (`Nov 21 08:14:02`) sont aussi couvertes, en français comme en anglais. Sans `--mask-dates`, le CLI garde les horodatages intacts ([formats et limites](../../packs/dates/README.md)).
- Dans ce même journal, les valeurs des paramètres d'URL sont désormais décodées pour la reconnaissance : le téléphone `phone=+41+79+412+58+03`, le nom `Romain%20Vuilleumier` et le courriel `romain.vuilleumier%40example.org` sont remplacés en entier par les règles, sans modifier le reste de la ligne ([#30](https://github.com/nbocquet/lessive/issues/30), [#31](https://github.com/nbocquet/lessive/issues/31)). L'URL de provenance de la ligne 7 reste remplacée en entier.
- L'exemple 06 n'a presque rien de remplaçable : seuls les lieux et la date le sont, alors que la personne reste identifiable pour ses collègues.

Ces observations peuvent changer avec les versions du moteur et du modèle.
