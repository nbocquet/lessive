# Maquette du parcours sur une page — #38

Prototype de discussion, séparé du site livré. Il conserve la typographie, le logo, les couleurs et les thèmes clair/sombre de l’application actuelle. Il ne branche pas le moteur de Lessive.

## Ouvrir

Depuis la racine du dépôt :

```sh
npx vite --config tools/maquette-38/vite.config.ts
```

Ouvrir http://127.0.0.1:1338.

## Proposition

- Sur grand écran : texte original, entités et résultat côte à côte. La réponse de l’assistant reste sur la même page, en dessous, pour ne pas comprimer la relecture.
- Sur écran intermédiaire : texte sur toute la largeur, vérification et résultat côte à côte.
- Sur téléphone : zones empilées et liens d’accès directs. Aucun changement d’écran et aucun panneau indispensable replié.
- La saisie ou le collage actualise la simulation ; cocher une forme, changer son type, rattacher ou séparer recalcule immédiatement le résultat et retire la validation.
- Une sélection dans le texte peut être ajoutée à la liste. Le rattachement est proposé entre entités de même type.
- La copie exige de confirmer la relecture. Une modification du texte ou de la table impose de confirmer à nouveau.
- La réponse réidentifiée suit la table en direct, avec signalement des repères inconnus. Le masquage désactive cette zone.

## Essai de la maquette

1. Décochez le courriel : il revient en clair dans le résultat ; cochez-le à nouveau.
2. Validez la relecture, puis changez le type d’une entité : la copie doit redevenir indisponible.
3. Séparez « Nérine », puis rattachez cette forme à la première personne : le résultat et la réponse suivent les repères de la table.
4. Sélectionnez « rencontre » dans le texte, puis prenez la sélection : ses occurrences sont traitées.
5. Passez en masquage, puis revenez en pseudonymisation.
6. Videz la session, puis rechargez l’exemple. Essayez aussi une largeur de 390 px et le thème sombre.

## Limites et décisions à prendre

La détection est volontairement simulée : seuls les noms de l’exemple et des courriels sont reconnus, par correspondance littérale. Les saisies sont réservées aux données fictives. Aucun modèle, worker, cache ou stockage n’est utilisé par ce prototype ; le serveur Vite reste un outil de développement.

La réidentification de démonstration attend les repères exacts ; le moteur réel possède davantage de tolérances. Modifier les groupes peut renuméroter les repères : une future implémentation doit conserver les identifiants de session du moteur et traiter explicitement le cas d’une réponse déjà reçue. Une modification du texte reconstruit ici la liste et efface les corrections manuelles : ce comportement de simulation ne doit pas être repris tel quel.

Avant implémentation : valider la densité à trois colonnes, la place de la réponse sous le document et le déclenchement de l’analyse réelle (collage immédiat, saisie temporisée, annulation des analyses dépassées). Prévoir les états du worker, les longs documents, les erreurs de modèle et la conservation des corrections. Les réglages avancés et les exports/imports de session ne sont pas maquettés.
