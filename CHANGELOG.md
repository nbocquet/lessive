# Journal des modifications

Les changements notables de Lessive sont consignés ici. Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le projet adopte le [versionnage sémantique](https://semver.org/lang/fr/). Tant que la version est en 0.x, une version mineure peut changer le format des exports chiffrés ; elle le signalera ici.

## [Non publié]

### Corrigé

- Les adresses suisses incluent le numéro d’office postal final (`Case postale 312, 1211 Genève 3`), sans absorber une quantité suivie de texte (#33).

- Le modèle ne remplace plus les formules d’appel « Madame, Monsieur » et « Mesdames, Messieurs », les libellés de numéro AVS/NIR/IBAN/IDE, « IT support » en signature et la fonction « Ingénieur/Ingénieure systèmes » sur sa propre ligne. Les titres suivis de noms et les raisons sociales restent proposés ; les noms de salle et de bâtiment restent à vérifier (#15, #32 partiellement).

- Les noms de personnes écrits dans l’ordre inversé (« Jean Dupont », « DUPONT Jean ») partagent le même repère lorsque leurs mots complets correspondent hors titres et particules. Le rattachement reste à vérifier ; plusieurs candidats gardent une entité distincte et les séparations manuelles sont respectées (#36).

- Les valeurs des paramètres d'URL sont reconnues après un décodage UTF-8 unique : les noms (`Romain%20Vuilleumier`), courriels (`%40`) et téléphones (`%2B`, séparateurs `+`) sont remplacés en entier dans le navigateur et le CLI. Les positions restent celles du texte original, les triplets `%XX` ne sont pas coupés et le texte hors des remplacements reste intact (#30, #31).

- Les mentions homonymes ambiguës peuvent être rattachées séparément dans la vérification : chaque passage affiche son contexte et permet de choisir une personne connue, sans fusionner les autres occurrences ni leurs correspondances (#12). Ce choix vaut pour le document courant, en mémoire seulement.

- Les horodatages nginx/Apache, Apache error, ISO 8601 et syslog sont remplacés en entier (date, heure et fuseau fourni), quelle que soit la langue choisie. Dans le CLI, ils restent intacts sans `--mask-dates` (#29).

- Les corrections par passage restent attachées à la bonne détection lorsqu'un réglage relance l'analyse : un identifiant réattribué ne peut plus laisser un autre passage en clair. Les corrections sans correspondance certaine sont abandonnées et le résultat doit être relu et validé.

- La description du mode Masquage annonce ce qu'il produit réellement : des astérisques de même longueur, la catégorie (`[PERSONNE]`) restant au choix à l'étape « Vérification ».

- L'écran « Réponse du LLM » n'est plus une impasse : en Masquage, il explique pourquoi rien ne peut être réidentifié et propose de passer en Pseudonymisation ; après un rechargement, la table chiffrée s'importe directement sur cet écran, sans nouvelle analyse.

- Les plages et dates coordonnées à deux jours avec mois partagé sont entièrement remplacées (`du 7 au 11 octobre`, `les 23 et 24 novembre`), avec leur année éventuelle ; formes anglaises courantes également couvertes (#14).
- Les identifiants dérivés (`CMARTIN`, `EMOREL`, `JPLAMBERT`…) détectés comme personnes rejoignent le pseudonyme du nom complet correspondant, même s’ils le précèdent dans le document. Un identifiant partagé par plusieurs personnes reste distinct et à vérifier (#13).

- Les analyses répétées contenant des personnes réutilisent les dictionnaires de noms ambigus préparés à la création de l’analyseur, sans conserver les noms des textes précédents.

- Accessibilité : les confirmations « Nouvelle session » et « Remplacer la session » prennent le focus à leur apparition, se ferment avec Échap et rendent le focus au bouton d’origine ; les aperçus « Avant / Après » ne sont plus annoncés comme des champs de saisie.

- Lisibilité : les textes d’aide et les descriptions passent de 12 à 14 px, les titres d’écran et de section se distinguent nettement du texte courant, et la liste de langue n’est plus en petit corps (zoom automatique évité sur iPhone). Les encadrés d’état du modèle, d’erreur et la consigne pour l’IA adoptent le même cadre que les autres avis ; l’indicateur « Prêt hors ligne » reste lisible en thème sombre.

- CLI : second Ctrl+C pour forcer l’arrêt, statut de succès conservé après publication, diagnostics sans accumulation d’écouteurs et ordre des packs indépendant de la locale. Analyse accélérée en l’absence de personnes à propager ; mesures du débit complétées pour les lignes courtes.

### Ajouté

- Le choix des catégories à nettoyer peut être mémorisé sur l’appareil, sur demande : la case « Mémoriser ce choix sur cet appareil » enregistre dans le navigateur les seules catégories décochées, jamais le texte. Le choix enregistré est signalé à chaque visite ; décocher la case l’efface (ADR 0005).

- Dans les règles avancées du pack Dates, les horaires, intervalles, repères relatifs français et mois–année en contexte peuvent être activés séparément. Ils restent lisibles par défaut ; les expressions comme `mardi prochain entre 14 h et 16 h` sont remplacées en entier avec les règles correspondantes (#16).

- Textes d'exemple entièrement inventés dans `docs/exemples/` (courriel RH, compte rendu, demande de remboursement, dossier administratif français, ticket de support en anglais, journal d'accès nginx, note qui illustre les limites), avec ce que le moteur repère et manque sur chacun ; référencés dans le README.

- Choix des catégories à nettoyer dans l’interface : identité, dates, adresses postales, lieux, coordonnées et identifiants. Les catégories décochées restent lisibles dans les deux modes ; l’aperçu s’actualise sans nouvelle analyse et exige une nouvelle validation avant copie. Les corrections manuelles par passage restent prioritaires (#26).

- CLI local `lessive` pour masquer un fichier UTF-8 ou stdin par catégories, ligne par ligne : dates optionnelles, NER CPU local facultatif, sortie fichier publiée sans écrasement après succès (#24). Compilation et installation depuis le dépôt, sans publication npm. Les chemins d'entrée et de modèle doivent désigner des fichiers ordinaires ; les tubes nommés sont refusés sans attendre de producteur.

### Modifié

- Parcours sur une seule page (#38) : texte original, données à vérifier et texte à copier côte à côte, puis la réponse de l'assistant en dessous ; zones empilées avec liens d'accès directs sur téléphone. Plus de navigation par étapes ni de bouton « Analyser » : l'analyse se lance au collage ou à l'import, et après une courte pause de la saisie ; un changement de réglage la relance en gardant les corrections. La colonne « À vérifier » regroupe les formes par entité : une case par entité (état partiel quand seules certaines formes restent en clair), une case par forme quand l'entité en a plusieurs, changement de type, « Séparer » et « Rattacher à… » en pseudonymisation. Le texte est figé dès la première correction ; « Modifier le texte » les abandonne après confirmation. La réponse de l'assistant est réidentifiée en direct, et suit les corrections de la table ; elle n'est plus déclenchée par un bouton. Interface allégée : thème clair par défaut (thème sombre au choix en pied de page, pour la visite), état du modèle sur une ligne dans la barre d'outils, rappel sur les noms non détectés au moment de valider, vocabulaire unifié (« repère », « assistant »), titres d'étape de même taille, mode de traitement en liste déroulante, langue du texte déplacée dans les réglages, limites permanentes repliées, un seul bouton « Copier le texte pour l'IA » (la consigne pour l'IA est incluse par défaut en pseudonymisation, une case permet de l'exclure), en-tête réduit au minimum, avertissement permanent intégré à l'en-tête, et étapes numérotées de 1 à 4 (coller, vérifier, copier, retrouver les données).

- Écran « Résultat » : la validation et la copie suivent directement l'aperçu « après » ; les catégories, la consigne pour l'IA et la sauvegarde chiffrée de la session sont repliées avec un résumé. Au-delà de 20 entités, la table des pseudonymes est écourtée (les entités à vérifier restent affichées). Sur téléphone, les étapes tiennent sur une ligne.

- Après une analyse à jour, « Passer à la vérification » devient l'action principale de l'écran « Texte ».

- Les jetons de remplacement (`PERSONNE_001`, `[PERSONNE]`, `*****`) apparaissent en capsule turquoise, reprise du logo, dans l'aperçu « après », la table des pseudonymes, l'écran « Réponse du LLM » et la description des modes ; la marque Lessive est agrandie au-dessus des titres d'étape.

- Avertissements moins répétitifs : l'absence de modèle de reconnaissance des noms, déjà annoncée en tête de l'écran « Texte », n'y est plus répétée sous les boutons et ne bloque plus le passage direct à la vérification. Dans le résultat, seuls les avis propres à l'analyse restent dans l'encadré d'alerte ; les limites permanentes passent en texte d'aide, et les passages remplacés sont repérés en bleu plutôt qu'en jaune.

- Développement : Node.js 26 ou plus récent est requis (CI et publication comprises, version fixée par `.nvmrc`). Les scripts de mesure se lancent directement avec `node`, sans option expérimentale. Aucun changement pour les personnes qui utilisent l'application.

### Corrigé

- Le rognage près d'une unité protégée conserve la ponctuation du bord intact ; une détection validée (motif, IBAN…) rognée perd sa validation, qui portait sur la valeur entière, mais sa partie extérieure reste remplacée (#18).
- Les détections écartées au profit d'une unité protégée désignent la détection finalement retenue, même si cette unité perd ensuite un conflit (#19).
- Le NER sépare aussi les noms situés de part et d'autre d'un saut de page ou d'une tabulation verticale (#20).
- Corriger manuellement un morceau d'adresse ne supprime plus les détections voisines du code postal et de la ville ; les noms rognés près d'une adresse conservent leurs accents décomposés dans le remplacement et la table de correspondance.
- Le NER n'applique plus une entité trouvée à l'intérieur d'un mot (« Objet » devenait `LIEU_001jet`, `JPLAMBERT` devenait `JPLAMPERSONNE_013`), et ne réunit plus deux personnes séparées par un saut de ligne ou de paragraphe (`Claire Martin` puis `Sophie`) en une seule entité ; un nom à trait d'union renvoyé à la ligne (`Jean-` puis `Pierre`) reste une seule personne (#10, #11).
- Une adresse e-mail entière et une adresse postale réunie par les règles (rue, code postal, ville) sont des unités protégées : un fragment du modèle de reconnaissance des noms (nom dans un e-mail, lieu dans une adresse), même très confiant, ne les découpe plus, en Masquage comme en Pseudonymisation.
- Les noms affichés devant une adresse dans les listes de destinataires sont protégés même avec un patronyme absent des dictionnaires, dans l’ordre prénom/nom ou nom/prénom, avec un service entre parenthèses et une adresse sur la ligne suivante.

## [0.1.0] — 2026-11-18

Première version publique, en ligne sur https://nbocquet.github.io/lessive/.

### Ajouté

- Parcours complet dans le navigateur : saisie ou import (`.txt`, `.md`), analyse, vérification et correction des détections, transformation, copie avec consigne pour l'assistant, réidentification de la réponse.
- Deux modes : **Pseudonymisation** (repères stables `PERSONNE_001`, table de correspondance en mémoire) et **Masquage** (astérisques, catégorie ou suppression).
- Moteur de détection en TypeScript pur, à base de packs JSON : `global` (courriels, URL, IP, IBAN, cartes, secrets techniques), `country-ch` (AVS, IDE, téléphones, adresses), `country-fr` (NIR, SIREN, SIRET, téléphones, adresses), `dates`, `lang-fr-en` (prénoms et noms Insee et OFS, titres, mots de contexte).
- Validateurs de clés de contrôle (modulo 97, Luhn, EAN-13…), résolution des conflits déterministe, fusion des noms et des adresses, propagation des noms et des identifiants dérivés.
- Reconnaissance des noms par modèle local (Transformers.js, ONNX Runtime Web en WebAssembly) : modèle `Xenova/camembert-ner` fourni par la version en ligne et installé à la demande, ou modèle chargé depuis le disque.
- Résolution d'entités (variantes d'un même nom), fusion et scission manuelles, réidentification tolérante aux déformations courantes des repères.
- Export chiffré de la table de correspondance (PBKDF2-SHA-256, 600 000 itérations, AES-256-GCM).
- Fonctionnement hors ligne par un service worker écrit à la main.
- Tests de confidentialité de bout en bout dans Chrome : aucune requête hors origine, aucune donnée dans les stockages, CSP appliquée, hors ligne.
- Publication automatique sur GitHub Pages, modèle vérifié par sommes SHA-256.

[Non publié]: https://github.com/nbocquet/lessive/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/nbocquet/lessive/releases/tag/v0.1.0
