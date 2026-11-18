# Essais OpenRouter du 18 novembre 2026

Deux expériences distinctes : conservation des repères par trois assistants, puis détection locale de destinataires dans neuf mails fictifs générés par ces assistants. Aucun texte utilisateur, nom réel signalé ou screenshot n'a été envoyé. Les appels sont ceux de l'outil d'évaluation ; l'application ne reçoit aucune intégration OpenRouter.

## Conservation des pseudonymes

Protocole existant de `tools/token-bench/consignes.md` : lot `court`, cinq textes synthétiques, format A (`PERSONNE_001`), traduction et reformulation. Un appel sans historique par réponse, consigne de conservation dans le message utilisateur, température laissée au fournisseur. Identifiants de modèles fixes, avec modèles servis enregistrés dans les fichiers `_modele.txt`.

| Modèle demandé et servi | Réponses complètes | Repères attendus | Strict | Tolérant | Inconnus |
|---|---:|---:|---:|---:|---:|
| `openai/gpt-6.2-sol` | 10 | 78 | 78/78 | 78/78 | 0 |
| `anthropic/claude-sonnet-5.5` | 10 | 78 | 78/78 | 78/78 | 0 |
| `google/gemini-4-hydrogen` | 10 | 78 | 78/78 | 78/78 | 0 |

Le moteur **de production** `src/core/reidentify/reidentify.ts` a ensuite traité ces trente réponses avec les tables de référence du banc : **234 repères distincts attendus et 234 restitués**, sans jeton inconnu ni ambigu, et toutes les valeurs originales synthétiques présentes dans les sorties. Cela ne teste pas les fusions/scissions de session ou le parcours navigateur.

Les possessifs anglais accolés (`PERSONNE_001's`) laissent le repère intact : 4 occurrences dans les réponses GPT, 3 chez Claude et 3 chez Gemini. Les formats B/C, les résumés, les réponses libres, l'absence de consigne et les interfaces de chat grand public ne sont pas évalués ici. Trente réponses ne garantissent pas la conservation sur tout texte ni sur une autre version des modèles.

### Plafonds et essais initiaux

- GPT et Claude : sortie plafonnée à 1 600 jetons par appel pour le lot des repères ; aucune réponse de ce lot n'est tronquée.
- Gemini : le premier lot, également plafonné à 1 600 jetons avec les paramètres de raisonnement par défaut, comportait **9 réponses tronquées sur 10**. Il reste archivé séparément et est exclu du tableau final ; ses omissions ne sont pas imputées à une mauvaise conservation des repères.
- Le lot Gemini entier a été rejoué avec `max_tokens: 6000` et `reasoning: { effort: "minimal" }` : dix réponses complètes, aucune troncature. Les modèles n'ont donc pas tous les mêmes paramètres de raisonnement ; ce tableau est un contrôle de fonctionnement, pas un classement général.
- La première génération de mails a aussi été tronquée pour Claude et Gemini ; le JSON incomplet n'a pas été évalué. Relances : plafond 4 000 pour Claude, 6 000 et raisonnement minimal pour Gemini. Pas de correction manuelle des réponses.

## Détection locale sur les mails fictifs

Chaque assistant a généré trois mails et indiqué leurs deux noms affichés attendus : ordre nom/prénom avec service et adresse à la ligne, capitales/guillemets/prénoms composés, puis minuscules/particules. Les neuf réponses JSON ont été vérifiées structurellement (trois mails, deux noms par mail, chaque nom présent exactement dans le texte). Les textes et annotations sont synthétiques et archivés ; les annotations proposées par les modèles ne constituent pas un corpus de référence indépendant.

Comparaison sur les **18 noms complets attendus**, pas sur chaque prénom isolé :

| Auteur des mails | Packs sans la nouvelle règle | Packs avec `courriel-nom-affiche` | Packs corrigés + CamemBERT |
|---|---:|---:|---:|
| GPT | 0/6 | 4/6 | 6/6 |
| Claude | 1/6 | 4/6 | 6/6 |
| Gemini | 0/6 | 4/6 | 6/6 |
| **Total** | **1/18** | **12/18** | **18/18** |

Une détection compte si un intervalle PERSON retenu couvre le nom complet attendu dans le texte original. Un prénom détecté seul ne compte pas comme une protection du nom complet. La configuration « avant » reprend exactement les mêmes packs en retirant uniquement la nouvelle règle ; la comparaison isole donc son effet.

Les six noms encore manqués par les règles seules sont ceux des cas en minuscules ou à particules, hors du motif limité à deux mots capitalisés. Le CamemBERT local les couvre dans cet échantillon. Le NER exécuté est `Xenova/camembert-ner`, q8, sous Node 26.13.1, backend CPU sur Apple Silicon ; il ne s'agit pas d'une mesure WASM dans le navigateur.

Cette expérience ne mesure ni précision globale ni faux positifs sur un corpus négatif indépendant. Les trois assistants génèrent des cas à partir du même prompt ciblé : les 18/18 ne remplacent pas l'évaluation NER complète fr/en. Les tests de non-régression séparés vérifient notamment l'objet du mail, une boîte sans nom complet, les offsets UTF-16, la sortie masquée/pseudonymisée et un NER partiel.

## Coût et preuves

**45 appels facturés**, toutes tentatives et générations comprises. Somme du champ `usage.cost` renvoyé par OpenRouter : **0,3770885 USD**, soit environ **0,38 $**. Ce montant est celui déclaré par l'API, pas une vérification du relevé de facturation.

Les [preuves et commandes de reproduction](../tools/token-bench/experiences/2026-11-18/README.md) comprennent les réponses brutes, les premières tentatives tronquées, le prompt de génération, les modèles réellement servis, les métadonnées d'usage et les résultats détaillés. La clé locale `.openrouter` est exclue de Git, n'est présente dans aucun de ces fichiers et n'a pas été affichée.
