# ADR 0002 — Format des jetons de pseudonymisation

- **Statut** : Proposé — en attente des réponses LLM
- **Date** : 2026-11-16
- **Tâche** : S2 (PLAN.md, phase 0) ; à valider à la porte G0
- **Décideur** : Nico
- **Valeur par défaut tant que rien n'est tranché** : A, `PERSONNE_001` (PLAN.md §3)

## Contexte

En mode Pseudonymisation, Lessive remplace chaque donnée personnelle par un jeton (« Claire Martin » devient `PERSONNE_001`). L'utilisateur colle le texte pseudonymisé dans un LLM (ChatGPT, Claude, Gemini…), puis colle la réponse dans Lessive, qui remet localement les vraies valeurs (réidentification, SPECIFICATIONS.md §10.4 et amendement A12).

Le LLM n'a aucune obligation de recopier les jetons tels quels. Il peut :

- les **traduire** (`PERSONNE_001` devient `PERSON_001` dans une traduction en anglais) ;
- changer la **casse** ou le **séparateur** (`Personne 001`, `PERSONNE-001`), ou échapper le tiret bas en markdown (`PERSONNE\_001`) ;
- retirer ou ajouter des **zéros** (`PERSONNE_1`) ou des **crochets** ;
- accoler un **possessif ou un pluriel** anglais (`PERSON_001's`) ;
- couper le jeton par un retour à la ligne, le mettre en gras ou en code ;
- l'**omettre** (résumé), le **remplacer par un pronom**, ou en **inventer** un (`PERSONNE_009`).

L'analyseur tolérant (`spikes/tokens/analyzer.mjs`) absorbe les cinq premières familles. Il ne peut rien contre une omission, un pronom ou une invention : un jeton absent n'est pas récupérable, un jeton inventé est signalé et laissé tel quel. Le choix du format vise donc à **minimiser ce qui échappe à la tolérance**. Toute déformation rattrapée reste une déformation : un format qui n'en provoque presque aucune est préférable à un format qui en provoque beaucoup mais les fait toutes rattraper.

Cette décision est ouverte parce qu'aucune de ces propriétés ne se déduit de l'extérieur : il faut mesurer.

## Options

Types d'entités couverts : personne, organisation, lieu, courriel, téléphone, IBAN, AVS. Préfixes proposés, modifiables : `PERSONNE`, `ORGANISATION`, `LIEU`, `EMAIL`, `TELEPHONE`, `IBAN`, `AVS` ; pour C, les initiales `P`, `O`, `L`, `E`, `T`, `I`, `A`.

Les remarques sur la tokenisation sont des **hypothèses a priori** (les tokeniseurs des LLM ne sont pas tous publics et ont changé d'une version à l'autre) ; l'expérience les confirmera ou non.

### A — `PERSONNE_001`

Type en français, majuscules, tiret bas, trois chiffres.

Avantages :
- Lisible : l'utilisateur voit tout de suite de quoi il s'agit, y compris dans le texte envoyé au LLM.
- ASCII pur : tapable au clavier, copiable partout, aucune dépendance de police.
- Tokenisation probable en quelques fragments de lettres, un tiret bas et un groupe de chiffres : forme proche d'un identifiant de code, que les LLM recopient en général bien.
- Collision avec du texte réel quasi nulle (majuscules + tiret bas + chiffres) ; le tiret bas évite que `PERSONNE 001` se confonde avec de la prose.
- Aucun délimiteur : pas de problème d'équilibrage ni de lien markdown.

Inconvénients :
- **Risque de traduction du mot** : `PERSONNE` est un mot français courant, un LLM qui traduit peut écrire `PERSON_001` (rattrapé par l'analyseur) ou, pire, `PERSON 1`, `Person One`, ou faire disparaître le jeton dans une tournure (« the person »).
- Le mot PERSONNE a un sens (« nobody ») : risque de contresens à la lecture par le LLM (« personne n'a répondu »).
- Sans délimiteur, les bornes du jeton sont moins nettes : `PERSONNE_001s`, `PERSONNE_001's`.
- Le tiret bas est parfois échappé en markdown (`PERSONNE\_001`) ou interprété comme italique à côté d'autres tirets bas ; rattrapé par l'analyseur.
- Zéros de tête : `PERSONNE_1` ou `PERSONNE_0001` fréquents ; rattrapé.

### B — `[PERSONNE_1]`

Même mot, entre crochets, numéro sans zéros.

Avantages :
- Les crochets disent au LLM « ceci est un emplacement réservé » : les LLM ont l'habitude des `[NOM]`, `[DATE]` et ont tendance à les conserver.
- Bornes nettes, lisible, ASCII, tapable.
- Pas de zéros à gérer (une cause de déformation en moins).
- Le crochet isole le mot PERSONNE de la phrase et réduit le risque de contresens.

Inconvénients :
- **Même risque de traduction du mot** que A (`[PERSON_1]`).
- Un emplacement réservé invite le LLM à le **remplir** ou à demander l'information (« veuillez préciser [PERSONNE_1] »), voire à le remplacer par un nom inventé : c'est la déformation la plus gênante, et la plus difficile à repérer.
- Le markdown peut y voir un texte de lien (`[PERSONNE_1](…)`) ou le dé-échapper (`\[PERSONNE\_1\]`) ; rattrapé.
- Plus long que A en caractères et probablement en tokens (deux caractères de plus).
- Collision possible avec des crochets du texte réel (`[1]`, `[sic]`) : sans effet tant que le contenu des crochets doit contenir un type connu.

### C — `⟦P1⟧`

Lettre du type, numéro, délimiteurs Unicode « crochets blancs » (U+27E6, U+27E7).

Avantages :
- **Aucun mot à traduire** : la lettre et le numéro n'ont pas d'équivalent anglais ; le risque de traduction du type disparaît.
- Court en caractères ; collision avec du texte réel nulle (les délimiteurs n'apparaissent presque jamais dans un texte courant).
- Les délimiteurs rares encadrent le jeton sans ambiguïté, y compris collé à un possessif.

Inconvénients :
- **Tokenisation probablement coûteuse et instable** : les caractères U+27E6 et U+27E7 sont rares, probablement découpés en plusieurs octets ou tokens ; certains LLM peuvent les normaliser (`[[P1]]`, `[P1]`), en perdre un, ou les prendre pour de la notation mathématique et les « interpréter ».
- **Illisible pour l'utilisateur** : `P1`, `O2`, `L3` sont des codes à mémoriser ; deux lettres suffisent à créer des ambiguïtés (`P` personne, `T` téléphone).
- **Saisie clavier impossible** sans combinaison spéciale : l'utilisateur ne peut pas retaper ni corriger un jeton à la main, seulement copier-coller. Un jeton retapé avec `[[P1]]` reste reconnu par l'analyseur, mais ce n'est pas un format que l'on veut apprendre aux gens.
- Dépendance de police : le glyphe peut s'afficher en case vide (« tofu ») dans certaines polices, certains terminaux ou applications anciennes ; risque de mauvais encodage au passage par un éditeur, un courriel ou un tableur.
- Accessibilité : lecteurs d'écran qui lisent mal ou pas du tout ces caractères.
- Moins lisible dans les journaux et les exports de revue.

## Critère de décision

Un format est **retenu** s'il atteint **au moins 98 % de jetons retrouvés en mode tolérant**, pour **chaque LLM testé**, sur les essais à consigne **complète** (`traduire`, `reformuler`) **avec consigne système**.

Précisions :

1. Le taux est calculé par `spikes/tokens/score.mjs` : jetons distincts de la source retrouvés dans la réponse / jetons distincts de la source, sommés sur les réponses (section 1 de `results.md`).
2. Les consignes partielles (`resumer`, `repondre`, `extraire`) et le témoin sans consigne système n'entrent pas dans le critère : ils éclairent les déformations.
3. **Puissance statistique limitée** : un texte contient 7 à 8 jetons distincts ; le lot 1 compte environ 78 jetons attendus par format et par LLM. Un jeton manquant donne 98,7 %, deux donnent 97,4 %. Le seuil de 98 % revient donc à « au plus un jeton perdu sur le lot 1 ». C'est volontairement sévère. Si deux formats échouent à un jeton près, étendre avec les lots 2 et 3 avant de conclure.
4. Un taux de jetons « inconnus » élevé (inventions) est un signal d'alerte même si le taux retrouvé est bon.

**Départage** si plusieurs formats passent : (1) le plus haut taux **strict** (moins de déformations à rattraper) ; (2) le moins d'inconnus ; (3) la meilleure lisibilité et saisie au clavier (A > B > C) ; (4) le meilleur résultat au témoin sans consigne système.

**Si aucun format ne passe** : examiner les jetons non retrouvés par `results.md` (section 5), puis au choix : renforcer la consigne système, essayer une variante (ex. préfixe anglais, délimiteurs `<<…>>`), ou assumer que la réidentification exige une revue manuelle des jetons non retrouvés (signalés dans l'interface). Ne pas abaisser le seuil sans en parler à Nico.

## Procédure

1. Les 5 textes synthétiques et leurs 15 versions pseudonymisées sont dans `spikes/tokens/textes/` (générés par `generate.mjs` à partir de tables d'entités, aucun jeton écrit à la main).
2. Nico suit `spikes/tokens/consignes.md` : lot 1 (30 essais) dans 2 ou 3 LLM, en nouvelle conversation à chaque essai, consigne système en tête du message, réponses sauvegardées sans retouche dans `spikes/tokens/reponses/<llm>/<texte>-<format>-<consigne>.txt`.
3. `node spikes/tokens/score.mjs` produit `spikes/tokens/results.md`.
4. Compléter la section « Résultats » ci-dessous (tableau de la section 1 de `results.md`, déformations dominantes, décision), faire passer le statut à **Accepté** avec le format retenu, ou **Rejeté**.
5. Porte G0 : Nico valide. Le format retenu est alors figé dans `src/core` (tâche T1.2 et suivantes) et le texte de la consigne système est repris dans l'interface.

## Consigne système à joindre (proposée)

Texte à joindre au prompt, adapté au format retenu (versions exactes dans `spikes/tokens/config.mjs`) :

- A : « Les mots de la forme PERSONNE_001 (par exemple ORGANISATION_002 ou LIEU_003) sont des pseudonymes : recopie-les à l'identique, sans les traduire, les modifier ni les expliquer. »
- B et C : même phrase, avec la forme du format, « crochets compris » (B) ou « délimiteurs ⟦ et ⟧ compris » (C).

## Résultats

_À remplir après l'expérience._

## Recommandation a priori

Avant toute mesure : **A**, avec la consigne système, est le meilleur candidat de départ (lisible, ASCII, tapable, collision nulle, et c'est la valeur par défaut du plan). **B** est le repli naturel si les LLM traduisent ou déforment le tiret bas ; son risque propre est l'effet « emplacement à remplir ». **C** supprime le risque de traduction mais coûte en lisibilité, en saisie et probablement en fiabilité de recopie du caractère rare ; il ne devrait être retenu que si A et B échouent à cause de la traduction du type. Cette recommandation n'a pas de valeur tant que `results.md` n'existe pas.

## Conséquences

- Le format retenu devient un contrat de `src/core` ; en changer plus tard casserait les tables de correspondance exportées.
- L'analyseur tolérant du spike (`analyzer.mjs`) est le prototype de la réidentification tolérante de PLAN.md §5 ; il sera repris en TypeScript pur dans `src/core` (R3) avec ses tests, une fois le format fixé.
- La réidentification reste une action explicite de l'utilisateur ; les jetons inconnus sont laissés tels quels et signalés (SPECIFICATIONS.md §10.4).
