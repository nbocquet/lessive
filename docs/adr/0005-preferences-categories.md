# ADR 0005 — Mémoriser sur demande le choix des catégories

- **Statut** : Accepté le 2026-11-25
- **Complète** : #26 (choix des catégories à nettoyer)

## Contexte

Le choix des catégories à nettoyer (#26) restait en mémoire et revenait au défaut, toutes cochées, à chaque
rechargement. Un utilisateur qui laisse toujours les dates lisibles devait refaire son choix à chaque visite.

R5 interdit d'écrire le texte original et la table de correspondance dans un stockage. Une liste de catégories
n'est ni l'un ni l'autre. Le projet allait pourtant plus loin : aucun stockage navigateur dans `src/web`
(`conventions.test.ts`) et `localStorage` vide après le parcours (`privacy.test.ts`).

Le risque n'est pas une fuite : c'est l'oubli. Sur un appareil partagé, ou des semaines plus tard, une
catégorie décochée et oubliée laisse des données lisibles sans que l'utilisateur s'en souvienne.

## Décision

1. **Sur demande seulement.** Une case « Mémoriser ce choix sur cet appareil », décochée par défaut. Tant
   qu'elle n'est pas cochée, rien n'est écrit. La décocher efface la préférence.
2. **Une seule clé, `lessive-preferences-v1`**, dans `localStorage`, lue et écrite par le seul module
   `src/web/preferences.ts`. Contenu : `{"v":1,"excludedCategories":[…]}`, des identifiants de catégories.
3. **On enregistre les catégories décochées**, pas les cochées : une catégorie ajoutée plus tard est cochée
   d'office. Un identifiant inconnu est ignoré ; une valeur illisible est effacée et le défaut s'applique.
4. **Rappel visible** : quand le choix est enregistré, le résumé replié des catégories l'indique et le panneau
   dit combien de catégories restent lisibles à chaque visite.
5. **Catégories seulement.** Les réglages avancés (packs, règles, seuils, modèle) restent en mémoire : une
   règle désactivée et oubliée serait encore moins visible qu'une catégorie décochée.
6. Stockage absent ou refusé : la case n'est pas proposée. Échec d'écriture : la mémorisation est désactivée
   et un message le dit ; l'ancienne préférence est effacée pour qu'elle ne revienne pas au rechargement.
   Si cet effacement échoue aussi, le message prévient que l'ancien choix peut revenir et invite à vider
   les données du site. Le choix en cours reste valable jusqu'au rechargement.

## Conséquences

- `conventions.test.ts` n'admet `localStorage` que dans `preferences.ts`, et toujours ni `sessionStorage`
  ni IndexedDB.
- `privacy.test.ts` continue d'exiger un `localStorage` vide sans demande. `preferences.test.ts` (e2e)
  vérifie qu'après demande seule la clé existe, avec le contenu attendu, sans aucun fragment du texte, et que
  décocher l'efface.
- Recharger la page ne vide plus tout quand la mémorisation est active : le texte et les correspondances
  restent effacés, le choix des catégories est conservé.

## Options écartées

- **Enregistrement automatique** : écrit sans consentement et rend l'oubli plus probable.
- **Mémoriser aussi les réglages avancés** : voir point 5.
- **Enregistrer les catégories cochées** : une nouvelle catégorie resterait lisible par défaut.
