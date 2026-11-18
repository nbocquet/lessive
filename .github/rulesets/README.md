# Règles de protection du dépôt

`main.json` décrit la protection de la branche `main`, à importer dans GitHub : **Settings → Rules → Rulesets → New ruleset → Import a ruleset**, puis choisir ce fichier.

- Pas de suppression de `main`, pas de poussée forcée.
- Toute modification passe par une demande de fusion (aucune approbation exigée : le projet a un seul mainteneur), fusion par « squash » ou « rebase ».
- Les contrôles `check` et `e2e` du workflow CI doivent réussir, sur une branche à jour avec `main`.
- Les administrateurs du dépôt peuvent passer outre en cas d'urgence ; les agents et les autres contributeurs, non.
