# Évolution du CLI : wash, tidy et clean

**Statut :** intention fonctionnelle discutée le 20 novembre 2026, à concevoir et à implémenter après la V1. Les sous-commandes ci-dessous ne sont pas disponibles. Le périmètre actuel reste décrit dans [implementation-cli.md](implementation-cli.md).

## Objectif

Préparer des fichiers texte, notamment des logs techniques, pour leur partage en choisissant quelles informations conserver pour l'analyse. Les IP, les logins et les identifiants techniques sont au centre de ce besoin ; la reconnaissance des noms par NER n'est pas nécessaire par défaut pour cet usage.

## Trois sous-commandes envisagées

| Sous-commande | Comportement attendu | IP | Dates | Logins et autres identifiants détectés |
|---|---|---|---|---|
| `wash` | Masquer toutes les données sensibles détectées | Masquées | Masquées | Masqués |
| `tidy` | Conserver IP et dates, masquer les identifiants | Conservées | Conservées | Masqués |
| `clean` | Pseudonymiser toutes les données sensibles détectées | Repères stables | Repères stables | Repères stables |

`wash` correspond à l'intention de retirer toute information identifiante détectée. Le terme retenu dans le produit reste **masquage** : aucune commande ne garantit l'anonymat, et des données non détectées ou le contexte peuvent encore permettre une identification.

`tidy` permet d'étudier les sources, la chronologie et les volumes de requêtes tout en retirant les identifiants de comptes. Les IP et dates restent volontairement visibles.

`clean` conserve les corrélations sans exposer les valeurs détectées : une même IP ou un même login retrouve toujours son repère au fil du fichier. Les repères sont **stables par fichier**, pas entre fichiers ; leurs correspondances ne sont pas réutilisées implicitement lors d'une autre exécution.

Les libellés exacts des repères et les options restent à définir. Exemples d'interface future :

```bash
lessive wash app.log -o app.wash.log
lessive tidy app.log -o app.tidy.log
lessive clean app.log -o app.clean.log
```

## Contraintes à conserver

- Traitement local, sans envoi réseau du texte et sans journalisation de son contenu.
- Fichier source intact, sortie sans écrasement et diagnostics contrôlés.
- Lecture progressive adaptée aux gros fichiers ; mesurer le débit sur des logs synthétiques représentatifs, avec des critères de couverture des détections et de conservation des corrélations.
- Règles adaptées aux champs des logs : un login après `user=` ou `login:` peut être identifié par son contexte ; un mot isolé ne doit pas être considéré automatiquement comme un compte.
- Ne pas reprendre de données du journal réel examiné dans les tests, exemples ou fichiers versionnés : construire des cas synthétiques équivalents.

## Décisions à préciser avant implémentation

- Liste exacte des catégories couvertes par chaque commande, notamment courriels, URL, noms d'hôtes et identifiants de transaction.
- Politique des secrets : mots de passe, clés, jetons et cookies de session. Déterminer si `clean` doit aussi leur attribuer un repère ou déroger au « tout pseudonymiser » en les masquant systématiquement.
- Format des dates pseudonymisées par `clean` et informations temporelles à préserver, notamment l'ordre et les intervalles. `tidy` conserve les dates originales.
- Normalisation des valeurs équivalentes, notamment les écritures IPv6, et distinction entre les rôles client et serveur sans perdre l'identité commune d'une IP.
- Réversibilité de `clean` et éventuel export chiffré demandé explicitement ; aucun stockage implicite de correspondances en clair.
- Stratégie de stabilité des repères et mémoire : une table cumulative grandit avec le nombre de valeurs distinctes. Ne pas promettre la même borne mémoire que pour le masquage V1 sans avoir choisi et mesuré une solution.
- Compatibilité avec la syntaxe actuelle du CLI et adaptation des règles ou contrats publics nécessaires, dans un changement dédié.

Ces intentions ne modifient pas à elles seules le périmètre validé de la #24 ni le comportement du CLI existant.
