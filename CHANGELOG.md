# Journal des modifications

Les changements notables de Lessive sont consignés ici. Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le projet adopte le [versionnage sémantique](https://semver.org/lang/fr/). Tant que la version est en 0.x, une version mineure peut changer le format des exports chiffrés ; elle le signalera ici.

## [Non publié]

### Corrigé

- Corriger manuellement un morceau d'adresse ne supprime plus les détections voisines du code postal et de la ville ; les noms rognés près d'une adresse conservent leurs accents décomposés dans le remplacement et la table de correspondance.
- Le NER n'applique plus une entité trouvée à l'intérieur d'un mot (« Objet » devenait `LIEU_001jet`, `JPLAMBERT` devenait `JPLAMPERSONNE_013`), et ne réunit plus deux personnes séparées par un saut de ligne ou de paragraphe (`Claire Martin` puis `Sophie`) en une seule entité (#10, #11).
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
