# LESSIVE — Cahier des charges v1.1

**Date :** 16 novembre 2026
**Statut :** v1.0 amendée. Les amendements ci-dessous priment sur le texte v1.0 reproduit à la suite. Le plan de construction est dans `PLAN.md`.

## Amendements v1.1

| # | Sujet | Décision | Sections v1.0 touchées |
|---|---|---|---|
| A1 | Contexte | Projet développé par une seule personne sur son temps libre, avec des agents de développement. Usage visé : personnel, communautaire et professionnel. | 1.3 |
| A2 | Cas d'usage principal | Copier-coller avec un LLM en chat : pseudonymiser, envoyer, puis réidentifier la réponse. Le traitement de lots est secondaire. | 1.1, 11.2 |
| A3 | Mode A renommé | Le mode A s'appelle **Masquage**. Le mot « anonymisation » n'apparaît ni dans l'interface ni dans les commandes. L'exemple de réécriture (« Une personne adulte travaille… ») est retiré : il exigerait un modèle génératif, interdit par NF-04. Résultat attendu : `[PERSONNE], née le [DATE], travaille à [LIEU]…` | 3.1, 9.1, 12.1 |
| A4 | Généralisation | Reportée après le MVP. | 3.1, 9.1 |
| A5 | CLI | Reportée après le MVP. NF-08 devient : le moteur ne dépend ni du DOM ni de Node, afin qu'une CLI puisse l'utiliser plus tard. AC-09 est reporté. | 12, 18, 20 |
| A6 | Distribution | Site statique hébergé avec fonctionnement hors ligne après le premier chargement, et auto-hébergement documenté. Seul le traitement doit être local. | NF-02, NF-06, 11.1 |
| A7 | Réseau | Nouvelle exigence NF-16 : une politique CSP interdit toute connexion hors de l'origine de l'application. | 2, 14.2 |
| A8 | Packs | MVP : packs livrés uniquement, au format JSON. Import par l'utilisateur et YAML reportés. Les validateurs sont une liste fermée référencée par nom. | 6.5, 6.6, 18 |
| A9 | Formats | MVP : texte collé (texte brut et Markdown). CSV et JSON structurés reportés. | 13.1, 18 |
| A10 | Paquets | MVP : un seul paquet npm avec trois dossiers (`src/core`, `src/ner`, `src/web`). Le découpage en neuf paquets est reporté. | 5.2, 16 |
| A11 | Résolution d'entités | Exigence explicite : les variantes d'un même nom (nom complet, titre + nom, prénom seul, initiale) sont rattachées à une même entité selon des règles documentées, avec signalement des cas à vérifier et correction manuelle. | 3.1 mode B, 10.2 |
| A12 | Aller-retour LLM | Exigence explicite : le format des jetons est choisi pour être recopié fidèlement par les LLM ; la réidentification tolère les déformations courantes ; une consigne à joindre au prompt est fournie. | 10.4 |
| A13 | NER chiffré | AC-03 devient mesurable : rappel sur les personnes ≥ 0,90 en français et en anglais (NER et dictionnaires combinés) sur le corpus du projet ; modèle ≤ 150 Mo ; 5 000 caractères analysés en 5 s au plus sur CPU. Cibles révisables après le prototype NER. | 8, 20 |
| A14 | Contrat de détection | `source` admet `manual` ; ajout de `validated`, `explanation` détaillée et `supersededBy`. | 7.2 |
| A15 | Types d'entités du MVP | Personne, organisation, lieu, courriel, téléphone, URL, adresse IP, IBAN, carte bancaire, secret technique, date, AVS, IDE, NIR, SIREN, SIRET. Adresses postales reportées. | 6.3, 8.1 |
| A16 | Profils | Le MVP a un seul profil par défaut. Les profils multiples sont reportés. | 1.3, 11.4 |
| A17 | Chiffrement | PBKDF2-SHA-256 et AES-256-GCM via WebCrypto, format versionné. | 10.3 |
| A18 | Limite affichée | L'identification indirecte (fonction, lieu, date combinés) n'est pas traitée par le MVP et figure parmi les limites affichées à l'utilisateur. | 3.1, 21 |
| A19 | Méthode | Les sections 22 et 23 sont remplacées par `PLAN.md`. | 22, 23 |
| A20 | Modèle NER | Le modèle NER n'est pas livré avec l'application : l'utilisateur le télécharge et le charge depuis son disque, l'application le garde en cache local. Le projet ne redistribue donc pas le modèle (taille > 100 Mo, licence propre au modèle). Voir ADR 0003. | 8.4, NF-06 |

---

# Texte v1.0 (référence)

# LESSIVE
## Cahier des charges fonctionnel et technique
### Projet open source de protection des données avant utilisation dans une IA

**Version :** 1.0  
**Date :** 16 novembre 2026  
**Statut :** Cadrage validé — architecture détaillée à concevoir  
**Licence :** Apache License 2.0  
**Dépôt cible :** GitHub — `lessive`  
**Projet de référence :** https://github.com/data-privacy-stack/presidio

---

# 1. Présentation générale

## 1.1. Vision

Lessive est un logiciel open source destiné à identifier, transformer et protéger des informations personnelles, confidentielles ou sensibles avant leur utilisation dans des modèles d'intelligence artificielle.

Il doit notamment permettre de préparer des textes et documents avant de les transmettre à des services tels que ChatGPT, Claude, Gemini ou à des LLM hébergés localement.

L'utilisateur doit conserver le contrôle sur ses données originales.

**Lessive n'envoie aucune donnée à un LLM et ne nécessite aucun service externe pour réaliser ses traitements.**

Son rôle est de produire un contenu transformé, prêt à être copié, exporté ou utilisé par l'utilisateur.

## 1.2. Objectifs principaux

- Détecter automatiquement les informations sensibles.
- Permettre l'anonymisation ou la pseudonymisation.
- Proposer ultérieurement la désensibilisation.
- Fonctionner intégralement en local.
- Être utilisable directement dans un navigateur.
- Fournir une interface en ligne de commande.
- Utiliser un moteur commun écrit en TypeScript.
- Intégrer un modèle NER local dès la première version fonctionnelle.
- Permettre l'ajout de nouveaux pays et de nouvelles règles.
- Favoriser les contributions communautaires.
- S'inspirer des fonctionnalités de Presidio sans dépendre de son implémentation Python.

## 1.3. Public cible

Lessive doit être accessible à deux catégories d'utilisateurs.

**Grand public :**
- Interface simple.
- Aucune connaissance technique requise.
- Profils préconfigurés.
- Import, analyse, validation et export.

**Professionnels :**
- Règles configurables.
- Packs géographiques et métier.
- Rapports de détection.
- Traitement automatisé via CLI.
- Intégration dans des scripts et des pipelines.
- Gestion des sessions de pseudonymisation.

Les fonctionnalités avancées ne doivent pas complexifier inutilement l'interface destinée au grand public.

---

# 2. Contraintes fondamentales

Les contraintes suivantes sont non négociables.

| Référence | Exigence |
|---|---|
| NF-01 | Fonctionnement du traitement 100 % local |
| NF-02 | Interface web sans serveur de traitement |
| NF-03 | Aucun envoi de document vers un service externe |
| NF-04 | Aucun appel à un LLM |
| NF-05 | Aucun appel à une API distante pendant le traitement |
| NF-06 | Fonctionnement hors ligne après installation |
| NF-07 | Moteur principal écrit en TypeScript |
| NF-08 | Moteur commun au navigateur et à la CLI |
| NF-09 | Détection NER locale dès le MVP |
| NF-10 | Architecture modulaire |
| NF-11 | Packs pays et métier extensibles |
| NF-12 | Validation humaine avant export dans l'interface web |
| NF-13 | Absence de télémétrie |
| NF-14 | Aucun stockage persistant des données originales sans action explicite |
| NF-15 | Logiciel distribué sous Apache 2.0 |

Le fonctionnement sans serveur de traitement n'interdit pas qu'un serveur statique distribue les fichiers de l'application. Toutefois, aucune donnée fournie par l'utilisateur ne doit lui être transmise.

Les ressources nécessaires au fonctionnement hors ligne doivent pouvoir être embarquées et installées localement.

---

# 3. Périmètre fonctionnel

## 3.1. Modes de traitement

Lessive doit proposer trois modes, dont deux dès le MVP.

### Mode A — Anonymisation

**Priorité : MVP**

Objectif : transformer les données afin de réduire ou supprimer les possibilités d'identification des personnes concernées.

Transformations envisagées :

- Suppression.
- Masquage.
- Généralisation.
- Réduction de précision.
- Suppression d'attributs indirectement identifiants.
- Remplacement par des descriptions génériques.

Exemple :

Original :

> Claire Martin, née le 12 mars 1985, travaille à Genève dans un établissement scolaire.

Résultat recherché :

> Une personne adulte travaille dans un établissement scolaire situé dans une région urbaine.

Il faut distinguer :

1. Le masquage technique des identifiants.
2. La transformation destinée à anonymiser.
3. L'évaluation du risque résiduel de réidentification.

Une suppression automatique des noms ne suffit pas à garantir une anonymisation réelle.

Lessive ne doit jamais présenter un simple remplacement automatique comme la preuve qu'un document est juridiquement anonyme.

Le MVP doit fournir les transformations automatiques disponibles et signaler les risques et limitations connus. Une véritable évaluation approfondie du risque de réidentification peut être développée progressivement.

### Mode B — Pseudonymisation

**Priorité : MVP**

Objectif : remplacer les entités identifiantes par des valeurs artificielles stables et cohérentes.

Exemple :

Original :

> Claire Martin a contacté Paul Dupont. Paul Dupont doit répondre à Claire Martin.

Résultat :

> PERSONNE_001 a contacté PERSONNE_002. PERSONNE_002 doit répondre à PERSONNE_001.

Exigences :

- Cohérence entre les occurrences.
- Cohérence entre plusieurs documents d'une session.
- Identifiants distincts pour les entités distinctes.
- Gestion des ambiguïtés et homonymes.
- Possibilité de corriger les associations.
- Gestion locale des correspondances.
- Export chiffré des correspondances.
- Réimport ultérieur de la table chiffrée.
- Réidentification locale et volontaire d'un texte.
- Aucun export involontaire des valeurs originales.

Les tables de correspondance sont sensibles et doivent être protégées comme des données personnelles.

### Mode C — Désensibilisation

**Priorité : évolution ultérieure**

Objectif : remplacer les informations sensibles par des données fictives cohérentes.

Exemple :

> Claire Martin a signé un contrat de 143 827 CHF.

Devient :

> Sophie Bernard a signé un contrat de 125 000 CHF.

Le système pourra générer des informations fictives localement en respectant des contraintes de cohérence.

Ce mode n'est pas requis pour le premier MVP, mais l'architecture doit permettre son ajout sans refonte majeure.

---

# 4. Référence architecturale : Presidio

## 4.1. Projet étudié

Lessive doit s'inspirer du projet :

https://github.com/data-privacy-stack/presidio

L'objectif n'est pas de créer une interface autour de Presidio, mais de réimplémenter en TypeScript les concepts pertinents de son architecture.

Presidio doit être utilisé comme référence fonctionnelle, architecturale et éventuellement comme outil de comparaison des résultats.

## 4.2. Correspondance entre les composants

| Presidio | Responsabilité Lessive |
|---|---|
| AnalyzerEngine | Coordination du moteur d'analyse |
| EntityRecognizer | Contrat des détecteurs |
| PatternRecognizer | Détection regex et dictionnaires |
| RecognizerRegistry | Registre des détecteurs |
| ContextAwareEnhancer | Enrichissement contextuel |
| NLP Engine | Abstraction des moteurs NER |
| AnonymizerEngine | Orchestration des transformations |
| Operators | Transformations configurables |
| Presidio Structured | Adaptateurs de formats structurés |
| Image Redactor | Extension future de traitement des images |

Les interfaces TypeScript n'ont pas besoin de reprendre exactement les noms ou les structures Python.

## 4.3. Fonctionnalités à reproduire

**Priorité haute :**
- Registre de détecteurs.
- Détecteurs prédéfinis.
- Détecteurs personnalisés.
- Détection regex.
- Dictionnaires.
- Vérification algorithmique des identifiants.
- Analyse contextuelle.
- Reconnaissance NER.
- Scores et seuils.
- Résolution des chevauchements.
- Transformations.
- Traçabilité des décisions.

**Priorité moyenne :**
- Détecteurs temporaires.
- Configuration avancée des seuils.
- Profils de traitement.
- Traitement de lots.
- Traitement structuré avancé.

**Hors périmètre initial :**
- OCR.
- Traitement d'images.
- DICOM.
- Connecteurs cloud.
- Services de détection distants.
- Orchestration Kubernetes.

## 4.4. Indépendance

Le moteur Lessive ne doit nécessiter :

- Ni Python.
- Ni Presidio.
- Ni spaCy.
- Ni serveur applicatif.
- Ni service distant.

Le projet peut réutiliser des bibliothèques JavaScript open source, sous réserve de compatibilité des licences, de sécurité et de fonctionnement hors ligne.

---

# 5. Architecture logicielle

## 5.1. Principe

L'architecture doit reposer sur un moteur TypeScript indépendant des interfaces.

Chaîne de traitement cible :

```text
Document original
       |
       v
Importation / normalisation
       |
       v
Chargement des packs actifs
       |
       v
+----------------------------+
| Analyse des informations   |
|                            |
| Regex                      |
| Dictionnaires              |
| Validateurs                |
| Contexte                   |
| NER local                  |
+----------------------------+
       |
       v
Consolidation des résultats
       |
       v
Résolution des conflits
       |
       v
Validation utilisateur
       |
       v
Moteur de transformation
       |
       +--> Anonymisation
       |
       +--> Pseudonymisation
       |
       +--> Désensibilisation future
       |
       v
Contrôle / prévisualisation
       |
       v
Export du document transformé
```

Chaque étape doit avoir une responsabilité claire.

## 5.2. Modules principaux

### lessive-core

Responsabilités :

- Orchestration.
- Gestion des analyses.
- Modèles de données.
- Gestion des résultats.
- Résolution des conflits.
- Gestion des scores et seuils.

### lessive-recognizers

Responsabilités :

- Interfaces des détecteurs.
- Détecteurs regex.
- Détecteurs par dictionnaire.
- Détecteurs programmatiques.
- Validateurs.
- Analyse contextuelle.

### lessive-registry

Responsabilités :

- Découverte et chargement des packs.
- Validation des manifestes.
- Activation des règles.
- Gestion des dépendances.
- Résolution des conflits de configuration.

### lessive-nlp

Responsabilités :

- Interface des moteurs NLP.
- Chargement des modèles locaux.
- Détection NER.
- Correspondance des catégories.
- Conversion des positions.
- Gestion de la mémoire.

### lessive-transformers

Responsabilités :

- Masquage.
- Suppression.
- Remplacement.
- Généralisation.
- Pseudonymisation.
- Transformations personnalisées futures.

### lessive-mapping

Responsabilités :

- Sessions.
- Identités de substitution.
- Relations entre entités.
- Export chiffré.
- Import chiffré.
- Réidentification.

### lessive-formats

Responsabilités :

- Importation.
- Extraction de texte.
- Préservation des structures.
- Exportation.
- Rapports sur les contenus non traités.

### lessive-web

Interface graphique exécutée dans le navigateur.

### lessive-cli

Interface en ligne de commande exécutée localement.

## 5.3. Architecture extensible

Les interfaces doivent dépendre des contrats publics du moteur, et non de ses détails internes.

Il doit être possible :

- D'ajouter un détecteur.
- D'ajouter un pack national.
- D'ajouter une langue.
- D'ajouter un moteur NER.
- D'ajouter un opérateur de transformation.
- D'ajouter un format de fichier.

Sans modifier les composants centraux.

---

# 6. Système de packs

## 6.1. Objectif

La communauté doit pouvoir enrichir Lessive sans connaître son fonctionnement interne.

La création de packs doit être aussi simple que possible.

Les règles standards doivent pouvoir être décrites en JSON ou YAML.

Les packs doivent être versionnés, testables et documentés.

## 6.2. Catégories de packs

### Global

Détecteurs indépendants des pays :

- E-mails.
- URL.
- Adresses IP.
- Certains identifiants bancaires.
- Secrets techniques.
- Tokens.
- Identifiants génériques.

### Countries

Règles spécifiques à un pays.

### Languages

Fonctionnalités linguistiques et modèles NER.

### Domains

Détecteurs propres à un secteur d'activité.

## 6.3. Pays du MVP

Les deux premiers pays sont :

**Suisse (CH)**

Détecteurs envisagés :
- Numéro AVS/AHV.
- IDE/UID.
- Téléphones suisses.
- IBAN suisses.
- Codes postaux.
- Identifiants administratifs pertinents.

**France (FR)**

Détecteurs envisagés :
- NIR.
- SIREN.
- SIRET.
- Téléphones français.
- IBAN français.
- Codes postaux.
- Identifiants administratifs pertinents.

Tous les formats doivent être validés à partir de documentations fiables.

Les règles à fort risque de faux positifs doivent bénéficier d'un contexte ou d'une validation supplémentaire.

Les identifiants d'organisations ne sont pas nécessairement des données personnelles, mais peuvent être considérés comme sensibles selon le profil utilisé.

## 6.4. Langues du MVP

- Français.
- Anglais.

Les packs nationaux doivent être indépendants des packs linguistiques lorsque cela est techniquement possible.

Exemple : un numéro AVS doit pouvoir être détecté dans un texte anglais.

## 6.5. Format des packs

Chaque pack doit posséder :

- Un identifiant unique.
- Une version.
- Une version minimale du moteur.
- Un type.
- Une liste de règles.
- Des dépendances éventuelles.
- Une documentation.
- Des tests.
- Une indication des ressources nécessaires.

Structure illustrative :

```text
country-ch/
├── manifest.json
├── rules/
│   ├── avs.json
│   ├── uid.json
│   ├── phone.json
│   └── iban.json
├── tests/
└── README.md
```

Le format doit être indépendant du moteur de détection.

## 6.6. Importation

Le MVP doit proposer :

- Des packs livrés avec Lessive.
- L'importation de packs JSON.
- L'importation de packs YAML.
- Une validation avant activation.
- Une liste des packs chargés.
- L'activation et la désactivation de règles.

Les packs déclaratifs importés ne doivent jamais pouvoir exécuter arbitrairement du JavaScript.

Les validateurs personnalisés non déclaratifs pourront être livrés sous forme de composants préalablement audités et intégrés dans une distribution.

## 6.7. Compatibilité

Prévoir un schéma de versionnement pour les manifestes et les règles.

Les incompatibilités doivent produire un message explicite.

Les identifiants des règles doivent être stables.

---

# 7. Moteur de détection

## 7.1. Types de détecteurs

Le moteur doit au minimum prendre en charge :

1. Regex.
2. Dictionnaires.
3. Validateurs algorithmiques.
4. Détection contextuelle.
5. NER local.
6. Détecteurs composites.

## 7.2. Contrat de détection

Chaque détection doit contenir :

```typescript
interface Detection {
  id: string;
  start: number;
  end: number;
  entityType: string;
  score: number;
  recognizerId: string;
  packId: string;
  source: "pattern" | "dictionary" | "validator" | "ner";
  explanation?: string;
}
```

Ce contrat est indicatif et doit être affiné.

Les positions doivent utiliser une convention unique, compatible avec les chaînes JavaScript et les résultats des modèles NLP.

Il faut gérer correctement Unicode, les caractères composés, les accents et les emojis.

## 7.3. Conflits

Plusieurs détecteurs peuvent identifier les mêmes caractères.

Le moteur doit définir une politique déterministe de résolution des conflits fondée sur :

- La validation algorithmique.
- Le score.
- La spécificité des règles.
- Les chevauchements.
- Les catégories.
- Les priorités configurées.

Une détection conflictuelle doit pouvoir être présentée à l'utilisateur.

## 7.4. Analyse contextuelle

Une correspondance regex peut être insuffisante.

Par exemple, une suite de chiffres peut correspondre à plusieurs catégories d'identifiants.

Le contexte doit permettre d'augmenter ou de diminuer la pertinence d'une détection.

Le traitement doit tenir compte de mots-clés proches, de la langue et des validations disponibles.

La justification doit être consultable.

## 7.5. Scores

Les scores doivent être compris entre 0 et 1.

Ils peuvent provenir de règles heuristiques ou de modèles statistiques.

Il faut documenter clairement leur signification.

Un score de 0,9 ne doit pas automatiquement être interprété comme une probabilité de 90 %.

Les seuils peuvent être définis par profil, détecteur ou type d'entité.

---

# 8. NER local — Obligatoire dès le MVP

## 8.1. Objectif

Lessive doit être capable de reconnaître automatiquement des informations non structurées :

- Noms de personnes.
- Noms d'organisations.
- Localisations.
- Autres catégories couvertes par le modèle sélectionné.

Exemple :

> Marie travaille à Lausanne pour Exemple SA.

Le système doit pouvoir proposer :

- Marie → PERSON
- Lausanne → LOCATION
- Exemple SA → ORGANIZATION

## 8.2. Contraintes techniques

Le moteur NER doit :

- Fonctionner directement dans le navigateur.
- Ne nécessiter aucun serveur d'inférence.
- Ne pas utiliser de LLM génératif.
- Fonctionner hors ligne.
- Supporter le français et l'anglais.
- Permettre le remplacement du modèle.
- S'intégrer au registre des détecteurs.
- Fournir des scores.
- Fonctionner avec les règles classiques.

## 8.3. Technologie candidate

Étudier en priorité :

- Transformers.js.
- ONNX Runtime Web.

Le choix définitif du modèle NER reste à établir.

L'IA chargée du plan devra proposer et comparer plusieurs modèles selon :

- Précision en français.
- Précision en anglais.
- Taille des fichiers.
- Mémoire consommée.
- Temps de chargement.
- Temps d'inférence.
- Compatibilité navigateur.
- Licence et conditions de redistribution.
- Fiabilité de la conversion des positions.

La prise en charge GPU peut être proposée, mais un fonctionnement CPU doit être prévu.

## 8.4. Distribution hors ligne

Les modèles doivent pouvoir être distribués avec une version autonome de Lessive.

Aucun téléchargement automatique depuis Hugging Face ou un autre fournisseur ne doit être nécessaire pendant l'analyse.

L'architecture doit permettre le chargement depuis les ressources locales de l'application.

Les performances de chargement et les besoins mémoire doivent être évalués dès les premiers prototypes.

## 8.5. Traitement des documents longs

Prévoir :

- Découpage du texte.
- Chevauchement éventuel entre segments.
- Reconstitution des positions.
- Déduplication des détections.
- Traitement asynchrone.
- Annulation.
- Gestion de la mémoire.

Les segments ne doivent jamais être envoyés vers un service distant.

---

# 9. Moteur de transformation

## 9.1. Transformations du MVP

| Transformation | Exemple |
|---|---|
| Suppression | Claire Martin → chaîne vide |
| Masquage | Claire Martin → ************* |
| Catégorisation | Claire Martin → [PERSONNE] |
| Pseudonymisation | Claire Martin → PERSONNE_001 |
| Généralisation | 12 mars 1985 → année 1985 ou tranche d'âge |

Les transformations doivent être sélectionnables selon :

- Le mode.
- Le profil.
- Le type d'entité.
- Une décision manuelle de l'utilisateur.

## 9.2. Stabilité

Les transformations doivent préserver autant que possible :

- Le sens.
- La lisibilité.
- La structure.
- Les relations entre entités.

Les modifications susceptibles d'altérer le sens doivent être signalées.

## 9.3. Résultat

Le moteur doit retourner :

- Le texte transformé.
- Les transformations réalisées.
- Les catégories concernées.
- Les éventuelles erreurs.
- Les parties non traitées.

Les valeurs originales ne doivent pas figurer dans les rapports exportés par défaut.

---

# 10. Sessions de pseudonymisation

## 10.1. Gestion des sessions

Une session doit permettre de traiter plusieurs documents avec les mêmes correspondances.

Exemple :

Document A :

> Claire Martin contacte Paul Dupont.

Document B :

> Claire Martin confirme son rendez-vous.

Résultat :

Document A :

> PERSONNE_001 contacte PERSONNE_002.

Document B :

> PERSONNE_001 confirme son rendez-vous.

## 10.2. Table de correspondance

Une table interne associe les entités d'origine et leurs pseudonymes.

Elle doit pouvoir être corrigée manuellement.

Les identifiants attribués doivent être uniques dans leur espace de noms.

## 10.3. Export chiffré

L'utilisateur doit pouvoir :

- Exporter la table de correspondance chiffrée.
- Définir une phrase de passe.
- Réimporter la table.
- Réutiliser les mêmes pseudonymes.
- Réidentifier localement un texte.

Le chiffrement doit utiliser des primitives cryptographiques éprouvées.

L'architecture doit prévoir :

- Une dérivation de clé robuste.
- Un sel aléatoire.
- Un chiffrement authentifié.
- Des paramètres cryptographiques versionnés.
- Des messages d'erreur adaptés.
- Aucune conservation de la phrase de passe en clair.

L'IA chargée du plan devra proposer une solution fondée sur les API cryptographiques disponibles dans le navigateur.

Ne pas concevoir d'algorithme de chiffrement propriétaire.

## 10.4. Réidentification

La réidentification doit être une fonctionnalité explicite.

Elle ne doit jamais être réalisée automatiquement à partir de contenus non validés.

Il faut notamment gérer les ambiguïtés de correspondance, les collisions et les pseudonymes inconnus.

---

# 11. Interface web

## 11.1. Fonctionnement

L'application doit être une application web statique, utilisable hors ligne.

Une distribution de type PWA peut être envisagée.

Le traitement doit être réalisé exclusivement dans le navigateur.

## 11.2. Parcours utilisateur

Le parcours principal doit être simple :

1. Saisir ou importer un document.
2. Sélectionner le mode.
3. Choisir les packs et le profil.
4. Lancer l'analyse.
5. Consulter les détections.
6. Corriger les résultats.
7. Prévisualiser les transformations.
8. Valider.
9. Copier ou exporter le résultat.

## 11.3. Interface d'analyse

L'interface doit permettre :

- Le surlignage des détections.
- La visualisation par catégorie.
- La consultation des scores.
- La consultation de l'origine d'une détection.
- L'ajout manuel d'une entité.
- La suppression d'une détection.
- La modification de sa catégorie.
- La modification de la transformation.
- La visualisation avant/après.

## 11.4. Interface de configuration

Prévoir :

- La sélection des packs pays.
- La sélection des langues.
- La sélection des profils.
- Les seuils de détection.
- Le choix des transformations.
- La gestion des packs importés.

## 11.5. Interface de pseudonymisation

Prévoir :

- La liste des pseudonymes.
- La correction des associations.
- La gestion de session.
- L'export chiffré.
- L'import chiffré.
- La réidentification volontaire.

## 11.6. Expérience utilisateur

L'interface doit :

- Être accessible aux non-techniciens.
- Présenter clairement les avertissements.
- Séparer les fonctions simples et avancées.
- Rester utilisable avec des documents de taille raisonnable.
- Afficher la progression du NER.
- Permettre d'annuler une analyse.
- Ne pas bloquer durablement le navigateur.

Les traitements lourds doivent, si possible, être déplacés vers des Web Workers.

---

# 12. Interface CLI

## 12.1. Objectif

Fournir une commande locale pour les utilisateurs avancés et les processus automatisés.

Exemples de syntaxe cible :

```bash
lessive scan document.txt
lessive scan document.txt --country CH,FR
lessive anonymize document.txt
lessive pseudonymize document.txt
lessive pseudonymize document.txt --output resultat.txt
```

La syntaxe définitive sera précisée dans le plan technique.

## 12.2. Fonctionnalités

- Analyse d'un fichier.
- Analyse de plusieurs fichiers.
- Entrée standard.
- Sortie standard.
- Profils de traitement.
- Sélection des pays.
- Sélection des langues.
- Chargement des packs.
- Chargement local d'un modèle NER.
- Rapports JSON.
- Sessions de pseudonymisation.
- Import et export des correspondances chiffrées.

## 12.3. Compatibilité

Cibles :

- Windows.
- Linux.
- macOS.

Node.js est le runtime initial envisagé.

La CLI doit utiliser le même moteur que l'interface web.

Contrairement à l'interface graphique, la CLI doit pouvoir fonctionner automatiquement sans validation interactive, sur demande explicite de l'utilisateur.

---

# 13. Formats de fichiers

## 13.1. MVP

Formats prioritaires :

- TXT.
- Markdown.
- JSON.
- CSV.

Le traitement doit préserver les structures et éviter d'endommager les documents.

Pour JSON et CSV, prévoir des stratégies adaptées aux champs, clés et cellules.

## 13.2. Évolutions

- DOCX.
- PDF contenant du texte.
- HTML.
- XLSX.
- Images avec OCR local.

Les formats complexes ne doivent pas être ajoutés au détriment de la fiabilité du moteur.

## 13.3. Couverture de l'analyse

Lessive doit signaler lorsqu'un contenu n'a pas été analysé.

Exemples :

- Contenu non extractible.
- Format non pris en charge.
- Champ ignoré.
- Échec du traitement.

Un document partiellement traité ne doit jamais être présenté comme entièrement protégé.

---

# 14. Sécurité

## 14.1. Confidentialité

Aucune donnée originale ne doit être :

- Transmise à une API.
- Envoyée vers une plateforme analytique.
- Placée dans une requête réseau.
- Conservée automatiquement sur un serveur.
- Insérée dans un rapport de diagnostic exporté par défaut.

## 14.2. Sécurité du navigateur

Prévoir notamment :

- Content Security Policy restrictive.
- Absence de ressources tierces à l'exécution.
- Protection contre les injections HTML.
- Validation des fichiers importés.
- Validation des packs.
- Gestion des erreurs.
- Absence de stockage persistant des données originales par défaut.

Attention : une application exécutée localement dans un navigateur reste exposée aux risques liés au navigateur, aux extensions, au système et aux dépendances.

La distribution autonome doit pouvoir être vérifiée et ses ressources doivent être maîtrisées.

## 14.3. Sécurité des packs

Les packs JSON/YAML doivent être traités comme des données non fiables.

Ils ne doivent pas permettre :

- L'exécution arbitraire de JavaScript.
- Des accès réseau.
- Des accès non autorisés au stockage.
- L'exécution de commandes système.

Une attention particulière doit être portée à la complexité des regex et aux risques de déni de service par expressions régulières.

## 14.4. Sécurité des dépendances

Prévoir :

- Versions verrouillées.
- Analyse des dépendances.
- Suivi des vulnérabilités.
- Inventaire des dépendances.
- Vérification des licences.
- Mises à jour documentées.

---

# 15. Tests et qualité

## 15.1. Tests fonctionnels

Tester :

- Chaque type de détecteur.
- Chaque transformateur.
- Chaque pack.
- Les validations de formats.
- Les collisions.
- Les chevauchements.
- Les sessions de pseudonymisation.
- L'import/export chiffré.
- La réidentification.

## 15.2. Tests NLP

Constituer des corpus synthétiques ou correctement autorisés.

Mesurer notamment :

- Précision.
- Rappel.
- Score F1.
- Faux positifs.
- Faux négatifs.

Les résultats doivent être mesurés séparément pour le français et l'anglais et par catégorie d'entité.

## 15.3. Comparaison avec Presidio

Utiliser Presidio comme référence de comparaison sur des corpus communs.

Les différences doivent être identifiées, analysées et documentées.

L'objectif n'est pas nécessairement d'obtenir des résultats identiques, mais de comprendre les divergences.

## 15.4. Tests hors ligne

Créer des tests vérifiant :

- L'absence de requêtes externes.
- Le chargement local des modèles.
- Le fonctionnement sans connexion Internet.
- L'absence de fuite de données.
- Le comportement après rechargement de l'application.

## 15.5. Performances

Mesurer :

- Temps de chargement.
- Taille des ressources.
- Temps d'analyse.
- Consommation mémoire.
- Temps d'inférence NER.
- Comportement sur différents volumes de texte.

Le plan devra définir des seuils mesurables sur des machines et navigateurs de référence.

---

# 16. Organisation du dépôt GitHub

Proposition initiale :

```text
lessive/
├── apps/
│   ├── web/
│   └── cli/
│
├── packages/
│   ├── core/
│   ├── recognizers/
│   ├── registry/
│   ├── nlp/
│   ├── transformers/
│   ├── mapping/
│   └── formats/
│
├── packs/
│   ├── global/
│   ├── countries/
│   │   ├── ch/
│   │   └── fr/
│   ├── languages/
│   │   ├── fr/
│   │   └── en/
│   └── domains/
│
├── tests/
├── docs/
├── examples/
├── README.md
├── ARCHITECTURE.md
├── SPECIFICATIONS.md
├── CONTRIBUTING.md
├── SECURITY.md
├── LICENSE
└── package.json
```

L'organisation exacte doit être validée lors de la conception.

Le monorepo doit permettre des tests et des publications indépendants lorsque cela est utile.

---

# 17. Gouvernance open source

## 17.1. Licence

La licence retenue est **Apache License 2.0**.

Toutes les dépendances et les modèles embarqués doivent être compatibles avec les conditions de redistribution du projet.

L'IA chargée du plan devra identifier les obligations de notices, attribution et redistribution.

## 17.2. Contributions

Prévoir :

- Guide de contribution.
- Normes de développement.
- Tests obligatoires.
- Documentation des règles.
- Gestion des issues.
- Revues de code.
- Politique de sécurité.

## 17.3. Contributions géographiques

Un contributeur doit pouvoir proposer un nouveau pays en fournissant :

- Son manifeste.
- Ses règles.
- Ses validateurs nécessaires.
- Ses exemples synthétiques.
- Ses tests.
- Sa documentation.
- Ses références officielles.

Chaque pack doit pouvoir être testé indépendamment.

---

# 18. Périmètre du MVP

Le MVP doit inclure obligatoirement :

- Moteur TypeScript.
- Registre de détecteurs.
- Regex.
- Dictionnaires.
- Validateurs.
- Analyse contextuelle.
- NER local français/anglais.
- Packs globaux.
- Packs Suisse et France.
- Import JSON/YAML.
- Masquage, suppression et remplacement.
- Pseudonymisation cohérente.
- Sessions multi-documents.
- Export/import chiffré des correspondances.
- Interface web autonome.
- Prévisualisation.
- Correction manuelle.
- Validation avant export.
- CLI.
- Formats TXT, Markdown, JSON et CSV.
- Tests de confidentialité.
- Tests de fonctionnement hors ligne.
- Documentation initiale.

Il faut distinguer le MVP fonctionnel d'une version stable destinée à la production.

---

# 19. Hors périmètre du MVP

Les éléments suivants doivent être prévus architecturalement, mais pas nécessairement implémentés immédiatement :

- Désensibilisation avec valeurs fictives.
- OCR.
- PDF avancé.
- DOCX.
- XLSX.
- Traitement d'images.
- Marketplace de plugins.
- Téléchargement de packs via Internet.
- Connecteurs LLM.
- Backend cloud.
- Gestion multi-utilisateur.
- API serveur.
- Évaluation juridique automatisée de l'anonymisation.

---

# 20. Critères d'acceptation

Le MVP est acceptable si les scénarios suivants fonctionnent.

### AC-01 — Fonctionnement local

Une application installée peut être utilisée hors ligne sans transmission de données à un service distant.

### AC-02 — Détection structurée

Les détecteurs pris en charge identifient les formats prévus par les packs installés.

### AC-03 — NER

Le moteur détecte des noms de personnes, organisations et lieux en français et en anglais avec des résultats évalués et documentés.

### AC-04 — Modularité

Une nouvelle règle déclarative peut être ajoutée sans modifier le moteur.

### AC-05 — Packs géographiques

Les packs Suisse et France peuvent être activés simultanément.

### AC-06 — Pseudonymisation

Une même entité conserve son pseudonyme à travers plusieurs documents d'une session.

### AC-07 — Chiffrement

Une table de correspondance peut être exportée, chiffrée, réimportée et utilisée après déchiffrement autorisé.

### AC-08 — Interface

L'utilisateur peut corriger les détections et valider les transformations avant export.

### AC-09 — CLI

Le même moteur fonctionne depuis la ligne de commande.

### AC-10 — Transparence

Le logiciel indique ses limites et ne garantit pas une anonymisation qu'il n'a pas pu établir.

### AC-11 — Sécurité

Les tests démontrent l'absence de transmission externe des documents pendant le traitement.

### AC-12 — Tests

Les modules disposent de tests automatisés et les résultats des évaluations NER sont documentés.

---

# 21. Risques techniques à étudier

L'IA chargée de la planification doit impérativement analyser :

1. Le poids et les performances des modèles NER dans les navigateurs.
2. La qualité de la reconnaissance en français.
3. La disponibilité d'un modèle redistribuable sous une licence compatible.
4. La gestion des caractères Unicode et des positions de détection.
5. Les conflits entre détecteurs.
6. Les regex potentiellement dangereuses.
7. Le stockage et le chiffrement des correspondances.
8. La fiabilité des détecteurs nationaux.
9. Le fonctionnement hors ligne des ressources NLP.
10. Les difficultés de compatibilité entre navigateur et Node.js.
11. La détection des informations indirectement identifiantes.
12. Le risque de divulgation accidentelle lors d'un export.

Chaque risque doit comporter une stratégie de mitigation.

---

# 22. Travail demandé à l'IA chargée du plan

À partir de ce cahier des charges, produire un plan de conception et de développement exploitable.

## Livrable A — Analyse architecturale

Étudier précisément :

https://github.com/data-privacy-stack/presidio

Identifier :

- Les composants à reproduire.
- Les concepts à adapter.
- Les fonctionnalités inutiles pour Lessive.
- Les points faibles ou contraintes d'une réimplémentation TypeScript.
- Les fonctionnalités nécessaires pour assurer la modularité.

Ne pas présumer que les concepts ou API de Presidio doivent être copiés à l'identique.

## Livrable B — Architecture cible

Proposer :

- Les packages.
- Leurs responsabilités.
- Leurs dépendances.
- Les interfaces TypeScript publiques.
- Le modèle de données.
- Le pipeline d'analyse.
- Le pipeline de transformation.
- Le fonctionnement des packs.
- L'abstraction NER.
- Le gestionnaire de sessions.
- La sécurité des échanges et du stockage.

Inclure des diagrammes d'architecture lorsque cela améliore la compréhension.

## Livrable C — Choix technologiques

Comparer les technologies candidates pour :

- Monorepo.
- Build TypeScript.
- Interface web.
- Gestion des états.
- CLI.
- Validation JSON/YAML.
- NER navigateur.
- Tests.
- Chiffrement.
- Distribution PWA.

Privilégier les solutions simples, maintenables, actives et compatibles avec le fonctionnement hors ligne.

Justifier les choix.

## Livrable D — Plan de développement

Découper le développement en phases ordonnées.

Pour chaque phase :

- Objectif.
- Fonctionnalités.
- Packages concernés.
- Dépendances.
- Risques.
- Tests.
- Critères d'acceptation.
- Livrables.

Mettre les prototypes techniques à haut risque suffisamment tôt, en particulier le NER.

## Livrable E — Backlog GitHub

Produire des GitHub Issues structurées.

Pour chaque issue :

- Titre.
- Description.
- Type.
- Priorité.
- Dépendances.
- Critères d'acceptation.
- Tests attendus.
- Milestone.

Organiser les issues en groupes cohérents.

## Livrable F — Validation du MVP

Proposer une stratégie permettant de vérifier que le MVP correspond à toutes les exigences obligatoires.

Définir des indicateurs mesurables de qualité, de confidentialité, de performances et de stabilité.

---

# 23. Instructions méthodologiques pour l'IA

Respecter les règles suivantes :

1. Ne pas commencer directement par générer tout le code.
2. Analyser le dépôt Presidio et sa documentation.
3. Proposer une architecture avant de définir les tâches.
4. Identifier les décisions techniques restant ouvertes.
5. Prioriser les risques techniques importants.
6. Éviter les architectures excessivement complexes.
7. Ne pas introduire de backend ou service distant non demandé.
8. Ne pas remplacer le moteur TypeScript par une dépendance Python.
9. Ne pas retirer le NER du MVP.
10. Ne pas confondre anonymisation et masquage.
11. Préserver les possibilités d'extension communautaire.
12. Séparer les fonctions indispensables des améliorations futures.
13. Justifier les technologies retenues.
14. Produire un plan réaliste et progressif.
15. Ne pas ajouter de fonctionnalités hors périmètre sans justification.

L'objectif est de concevoir un projet open source durable, sécurisé, compréhensible et techniquement crédible.

---

# 24. Synthèse finale

**Lessive doit devenir un moteur open source de détection et de protection des données sensibles, inspiré de Presidio, entièrement réimplémenté en TypeScript.**

Ses caractéristiques principales seront :

- Utilisation directement dans le navigateur.
- Aucune transmission de données.
- Fonctionnement hors ligne.
- NER local dès le MVP.
- Moteur partagé avec la CLI.
- Anonymisation et pseudonymisation.
- Sessions avec correspondances chiffrées.
- Architecture extensible.
- Packs nationaux et métier.
- Règles JSON/YAML.
- Interface simple avec validation humaine.
- Licence Apache 2.0.

**Le résultat attendu de la phase suivante est un plan technique complet, découpé en modules, étapes et issues GitHub, permettant de démarrer le développement de Lessive dans de bonnes conditions.**