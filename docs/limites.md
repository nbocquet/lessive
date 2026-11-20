# Les limites de Lessive

Lessive est un outil d'aide, pas une garantie. Il **réduit le risque** de transmettre des données personnelles à un assistant IA ; il ne le supprime pas, et il **ne rend pas un texte anonyme**. Ce document dit, simplement, ce qu'il peut manquer, ce qu'il ne fait pas du tout, et ce que vous pouvez faire pour compenser.

La règle de base : **relisez toujours le texte transformé avant de l'envoyer**. L'étape « Vérification » de l'application sert à cela.

## 1. Un texte sans les noms peut rester reconnaissable

Remplacer les noms ne suffit pas toujours. Une fonction rare, un lieu et une date, pris ensemble, désignent parfois une seule personne : « la directrice de l'école de Meyrin, absente depuis le 3 mars » reste reconnaissable sans aucun nom. Lessive ne traite pas ce cas, qu'on appelle l'identification indirecte. C'est à vous de juger si ce que vous envoyez peut encore désigner quelqu'un, et de retirer ou de reformuler ces éléments.

Le mode Pseudonymisation conserve la structure du texte : les mêmes repères reviennent (`PERSONNE_001` partout où il y avait la même personne), ce qui permet à l'assistant de suivre l'histoire, et à vous de retrouver les noms ensuite. Le texte garde donc ses liens et son contexte. Ces liens aident l'assistant, mais peuvent aussi aider à identifier quelqu'un.

Le mode Masquage remplace chaque donnée par des astérisques de même longueur (ou par la catégorie, ou la supprime, si vous le choisissez) : la longueur d'un nom masqué reste visible. Il ne garde aucune correspondance : on ne peut pas remettre les vrais noms dans la réponse de l'assistant.

## 2. Ce que Lessive peut manquer

Lessive cherche les données de deux façons : par des **règles** (la forme d'un courriel, d'un IBAN, d'un numéro AVS…) et par un **modèle de reconnaissance des noms**, à installer en un clic dans la version en ligne ou à charger depuis votre disque (voir [deploiement.md](deploiement.md)). Ni l'un ni l'autre ne trouve tout.

### Les noms de personnes, de lieux et d'organisations

Les chiffres ci-dessous viennent de [docs/evaluation-ner.md](evaluation-ner.md), mesurés avec le modèle multilingue DistilBERT ; le modèle fourni par la version en ligne (CamemBERT-NER) donne des résultats proches en français et un peu moins bons en anglais. Ils sont mesurés sur des textes **inventés**, écrits pour mettre le modèle en difficulté, en français et en anglais. Ils donnent un ordre de grandeur et ne prédisent pas ce qui se passera sur vos textes : sur un corpus de cette taille, quelques points d'écart ne sont pas significatifs.

- **Avec le modèle chargé**, environ **9 personnes sur 10** sont trouvées dans ces textes (rappel de 0,91 en français et en anglais ensemble). Environ 1 de ces détections sur 30 ne désigne pas une personne.
- **Sans le modèle**, Lessive ne retrouve qu'un peu plus de la moitié des personnes (0,57), seulement par ses listes de prénoms et ses formules comme « M. Dupont », et **aucun nom de lieu ni d'organisation**. Il le dit : un avertissement s'affiche quand le modèle n'est pas actif.
- **Les lieux** : environ 85 % trouvés avec le modèle. Les communes peu connues (Carouge, Meyrin, Annemasse, Ferney-Voltaire…) sont parfois manquées, ou prises pour des personnes. Un lieu écrit en minuscules ou collé à un emoji échappe souvent.
- **Les organisations** : presque toutes sont repérées, mais souvent **coupées** : « Brasserie » est trouvé sans « du Léman Sàrl ». La suite du nom reste alors dans le texte. Des prénoms sont aussi pris pour des organisations.

Ce qui échappe le plus souvent :

- **Les noms écrits en minuscules** (« jean dupont », « marie lefevre ») : le modèle n'en trouve aucun, les listes de prénoms moins de la moitié. C'est le trou le plus important pour les textes écrits vite.
- **Les noms qui sont aussi des mots courants** : Victoire, Blanche, Fleur, Rose, Faith, Jordan, Victoria… (« Blanche porte une chemise blanche »). Ces prénoms ne sont détectés que s'il y a un indice, comme « Bonjour Rose ».
- **Les prénoms isolés dans une phrase courte**, sans titre ni salutation.
- **Les noms rares ou d'origine peu fréquente**. La liste de prénoms privilégie les prénoms français, suisses romands et anglo-saxons. Les prénoms d'origine arabe, balkanique, portugaise, italienne, africaine ou asiatique, pourtant très présents en Suisse romande et en France, y sont peu représentés. **Un prénom que Lessive ne souligne pas n'est pas pour autant un prénom sûr.**
- **Les titres écrits en minuscules** (« le docteur dupont »).

À l'inverse, Lessive **signale parfois à tort** : un nom de commune lu comme une personne (Meyrin, Vernier), un mot courant qui ressemble à un prénom, une formule de salutation. Vous pouvez retirer ces détections à l'étape « Vérification ».

**Que faire.** À l'étape « Vérification », parcourez le texte surligné et **ajoutez à la main** ce qui manque : la sélection d'un mot suffit, et toutes ses occurrences sont alors traitées. Pour un texte sensible, relisez aussi le texte transformé en entier.

### Les identifiants (courriel, IBAN, téléphone, AVS…)

Ces données ont une forme précise, donc Lessive les trouve mieux, mais avec des règles de prudence qui laissent passer certains cas.

- **Les contrôles de clé peuvent laisser passer des numéros mal recopiés.** Pour les numéros AVS, IDE, SIREN et SIRET, Lessive vérifie la clé de contrôle : un numéro mal recopié (une faute de frappe) est pris pour un nombre quelconque. C'est un choix qui évite des fausses alertes ; il laisse passer les numéros erronés. Exception pour le NIR français : avec un contexte explicite (« sécurité sociale », « NIR », « NSS », etc.), Lessive signale aussi un numéro possible sans clé, à clé fausse ou avec certains groupes irréguliers, sans le déclarer valide.
- **Un numéro AVS écrit sans séparateur** (13 chiffres collés) n'est détecté que si un mot comme « AVS » est proche. Un SIREN seul (9 chiffres) n'est détecté qu'avec un mot comme « SIREN », « société » ou « RCS » à proximité, et un SIREN à l'intérieur d'un numéro de TVA européen ne l'est pas. Les NIR français complets à clé correcte sont reconnus avec espaces, points ou tirets ; les formes incertaines exigent un contexte explicite.
- **Les numéros de téléphone** : Lessive reconnaît les formes habituelles suisses et françaises (`079 123 45 67`, `+41 79 …`, `06 12 34 56 78`, `+33 …`). Il ne vérifie pas l'existence de l'indicatif : un numéro étranger de la même forme peut être pris pour un numéro suisse, et un numéro inexistant sera signalé. Les numéros collés (`0791234567`) ne sont retenus qu'avec un mot comme « tél » ou « mobile » à proximité. Les numéros courts (112, 1818), les numéros français en 08, les extensions (« int. 123 »), les formes avec `(01)` entre parenthèses et les numéros d'autres pays ne sont pas détectés.
- **Les dates** : Lessive repère les dates complètes (`12.03.1985`, `12 mars 1985`, `March 12, 1990`) et les dates sans année (`3 janvier`). Il ne repère pas une année seule (« en 2020 »), un mois avec son année (« mars 1985 »), les heures, ni les dates américaines dont le jour dépasse 12 (`03/25/2020`). Une date abrégée (`12.03.85`) n'est retenue qu'avec un mot comme « né le » à proximité. Des dates impossibles (`31.02.2020`) sont détectées quand même. Les plages de deux jours avec mois partagé (`du 3 au 5 mars`, `les 23 et 24 novembre`, `October 7–11`) sont remplacées en entier, avec leur année si elle est présente. Les listes plus longues, les plages changeant de mois et les ordinaux anglais dans les plages ne sont pas couverts comme une expression complète. « may » en anglais est lu comme le mois.
- **Les codes postaux** ne sont détectés que suivis de leur localité et accompagnés d'un mot comme « adresse », « NPA » ou « code postal » (sauf la forme `CH-1003 Lausanne`) ; en France, la commune doit être écrite en majuscules (`74160 SAINT-JULIEN-EN-GENEVOIS`). Les adresses postales sont reconnues sous leurs formes courantes (« 12 rue des Lilas », « 3, chemin de… », case postale), et la rue, le code postal et la localité qui se suivent sont regroupés ; une adresse écrite autrement (sans numéro, abréviation inhabituelle, lieu-dit) peut échapper.
- **Les cartes bancaires** : seuls les émetteurs courants sont reconnus (Visa, Mastercard, American Express, Discover, Diners Club, JCB, UnionPay, Maestro). Un numéro de SIRET dont la clé est juste et qui commence par 36, 38 ou 300 à 305 peut être pris pour une carte Diners.
- **Les secrets techniques** (clés d'accès, jetons) : seules les formes connues de quelques services (AWS, GitHub, Slack, Stripe, Google, Anthropic, OpenAI, jetons JWT, clés privées PEM) sont reconnues. Un mot de passe n'est détecté que précédé d'un mot comme « mot de passe » ou « password ».
- **Les URL et adresses IP** sont détectées. Un numéro à quatre nombres séparés par des points est lu comme une adresse IP, sauf s'il suit un mot comme « version », « article » ou « v » : un numéro de version écrit autrement peut donc être signalé à tort.

### Les autres pays et les autres langues

- Les identifiants et les formats couverts sont **suisses et français**. Les identifiants d'un autre pays ne sont pas reconnus (sauf les IBAN, les cartes, les courriels, les adresses IP et les URL, qui n'ont pas de pays).
- Lessive est conçu et mesuré pour le **français et l'anglais**. Les règles de contexte (« tél », « né le »…) existent dans ces deux langues. Le modèle DistilBERT multilingue connaît d'autres langues, mais Lessive n'a pas été évalué dessus ; le modèle fourni (CamemBERT-NER) est surtout entraîné sur du français : sur un texte allemand ou italien, comptez sur moins de détections.

## 3. Ce que Lessive ne traite pas

- **Les fichiers** : Lessive traite du **texte** collé, ou un fichier `.txt` ou `.md`. Pas de PDF, de document Word, de tableur, d'image, ni de photo de document. Le texte caché dans un fichier (propriétés, métadonnées, commentaires) n'est pas lu non plus.
- **Les textes très longs** : le texte est limité à 200 000 caractères. Un texte de 5 000 caractères s'analyse en quelques secondes avec le modèle ; au-delà de quelques pages, comptez davantage (voir [docs/performances.md](performances.md)).
- **Le sens du texte** : Lessive ne comprend pas ce qu'il lit. Il ne détecte pas une information sensible exprimée en mots ordinaires (« elle est en arrêt maladie », « il a été licencié »), ni un secret professionnel. Les **données sensibles** au sens de la loi (santé, religion, opinions politiques ou syndicales, vie sexuelle, procédures pénales, aide sociale) ne sont pas repérées : « absente pour raisons médicales » reste en clair, à vous de le reformuler. Il n'est **pas validé pour des données de santé** ni pour des informations couvertes par un secret professionnel. Il ne remplace pas l'avis de votre responsable de la protection des données, ni les règles de votre organisation.

## 4. L'aller-retour avec l'assistant

En mode Pseudonymisation, vous collez la réponse de l'assistant dans Lessive, qui remet les vrais noms. Cela repose sur l'assistant, que Lessive ne contrôle pas.

- **L'assistant peut déformer ou perdre les repères.** Il peut les traduire (`PERSON_001`), changer la casse, ajouter un possessif, couper un repère par un saut de ligne : Lessive reconnaît ces variantes courantes. Mais s'il **oublie** un repère, le remplace par un pronom (« elle »), ou en **invente** un (`PERSONNE_009`), Lessive ne peut rien y faire : un repère manquant ne se récupère pas, un repère inventé est laissé tel quel et signalé.
- **Joignez la consigne** : « Copier avec la consigne pour l'IA » demande à l'assistant de recopier les repères à l'identique. Cela aide, sans garantir.
- Le format des repères a été choisi après un essai sur deux assistants (ChatGPT et Claude, 10 essais chacun) : tous les repères ont été recopiés. C'est un petit échantillon, qui ne garantit rien pour un autre assistant ou un texte plus long (voir [docs/adr/0002-format-jetons.md](adr/0002-format-jetons.md)).
- **Relisez la réponse** une fois les noms remis : un repère ambigu ou inconnu est signalé, jamais remplacé sans votre action.

## 5. Les variantes d'un même nom

Lessive rattache entre elles les variantes d'une même personne (« Claire Martin », « Mme Martin », « C. Martin ») pour leur donner le même repère. Les cas incertains sont marqués « à vérifier ». Il se trompe ou rate encore ceci :

- « Claire » citée seule **avant** « Claire Martin » : deux repères différents, à fusionner à la main.
- « M. Dupont » et « Mme Dupont » reçoivent le **même** repère : si ce sont deux personnes de la même famille, séparez-les à la main.
- Les prénoms composés (« Jean-Pierre » et « Jean »), les noms composés sans trait d'union, l'ordre inversé (« Martin Claire »), les surnoms et les fautes de frappe ne sont pas rapprochés.

Vous pouvez fusionner et séparer les entités dans le panneau des correspondances.

## 6. Vos données et votre ordinateur

Lessive traite votre texte dans votre navigateur, sans l'envoyer à un serveur de traitement. Cela ne protège pas contre ce qui se passe **autour** de la page. Voir [docs/confidentialite.md](confidentialite.md) pour le détail.

- **Les extensions du navigateur** peuvent lire la page et ce que vous collez. Utilisez une fenêtre de navigation privée sans extension, ou un profil dédié.
- **Un ordinateur infecté ou surveillé** (logiciel malveillant, enregistreur de frappe) échappe à Lessive.
- **Le presse-papiers** : ce que vous copiez, y compris le texte transformé, peut être lu par d'autres applications et conservé par l'historique du presse-papiers du système.
- **La table de correspondance** (qui est `PERSONNE_001`) n'existe qu'en mémoire : **recharger la page ou fermer l'onglet l'efface**. Pour la conserver, l'export chiffré demande une phrase de passe d'au moins 12 caractères ; **sans cette phrase, le fichier est inutilisable et personne ne peut la retrouver**. La solidité de la protection dépend de la phrase choisie.
- **Le texte transformé que vous copiez** quitte Lessive : ce que vous en faites ensuite n'est plus sous son contrôle.

## 7. Le modèle de reconnaissance des noms

- La version en ligne fournit `camembert-ner` (licence MIT, environ 114 Mo), téléchargé seulement quand vous cliquez sur « Installer le modèle fourni », puis conservé dans votre navigateur. Vous pouvez aussi charger un autre modèle depuis votre disque, par exemple DistilBERT multilingue, meilleur en anglais (voir [deploiement.md](deploiement.md)).
- Un modèle chargé par vous reste soumis à **sa propre licence** (AFL-3.0 pour DistilBERT), que vous acceptez en le téléchargeant. Les réserves sur les données d'entraînement sont consignées dans [docs/adr/0001-modele-ner.md](adr/0001-modele-ner.md).
- Ces modèles ont été entraînés sur des textes de presse et d'encyclopédie, pas sur des courriels : ils se comportent moins bien sur un style très informel (minuscules, prénoms seuls, abréviations).

## 8. L'état du projet

Lessive en est à sa première version publique (0.1.0). Ses tests automatiques couvrent le moteur et la confidentialité dans Chrome, mais aucune relecture de sécurité indépendante n'a été faite, et il n'est pas validé pour des données de santé ou couvertes par un secret professionnel. N'envoyez pas de données réellement sensibles à un assistant sur la seule foi de Lessive.

## En résumé : avant d'envoyer un texte

1. Lisez le texte transformé en entier.
2. Ajoutez à la main les noms que Lessive n'a pas soulignés, surtout ceux en minuscules, les noms rares et les noms qui ressemblent à des mots.
3. Cherchez ce qui permettrait de reconnaître la personne **sans son nom** (fonction rare, lieu, date, situation) et retirez-le ou reformulez-le.
4. Installez ou chargez le modèle de reconnaissance des noms ; sans lui, une grande partie des noms ne sont pas détectés.
5. En cas de doute sur la sensibilité du texte, ne l'envoyez pas.

## CLI et fichiers de logs

Le CLI traite chaque ligne UTF-8 indépendamment, sans contexte entre lignes : une adresse ou un secret multiligne peut rester partiellement en clair. Il refuse les lignes de plus de 200 000 unités UTF-16 et les encodages invalides. Sans NER explicitement chargé, les règles seules peuvent manquer des noms. Les dates restent visibles par défaut. Le remplacement par catégorie peut rendre un JSON/JSONL invalide.

Une erreur tardive laisse les lignes déjà écrites sur stdout ; contrôlez le code de sortie. Avec `--output`, le fichier final est publié seulement après succès et sans écrasement. Une coupure brutale peut laisser le temporaire transformé. Aucun export de correspondances ni réidentification n'est disponible dans le CLI.

La publication par `--output` exige des liens physiques dans le dossier de destination. FAT/exFAT et certains montages SMB ou Docker ne les prennent pas en charge : la publication échoue alors après le traitement et le temporaire est supprimé. Choisissez un système de fichiers compatible pour la sortie. Un premier Ctrl+C demande un arrêt avec nettoyage ; un second force la sortie (code 130) et peut laisser un temporaire transformé.
