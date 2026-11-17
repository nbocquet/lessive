# ADR 0004 — Version en ligne avec un modèle NER fourni (CamemBERT-NER)

- **Statut** : Décidé par Nico le 2026-11-17 (amendement A21 de SPECIFICATIONS.md)
- **Décideur** : Nico
- **Complète** : ADR 0003 (le chargement depuis le disque reste possible) ; révise l'amendement A20

## Contexte

Nico veut publier Lessive comme un produit fini, sur le web (GitHub Pages), avec un modèle de reconnaissance
des noms prêt à l'emploi, sans que le modèle soit versionné dans le dépôt. L'ADR 0003 avait écarté la
redistribution pour deux raisons : la taille (plus de 100 Mo, limite d'un fichier dans Git) et la licence
AFL-3.0 du modèle DistilBERT, qui impose d'obtenir l'accord exprès des destinataires.

## Décision

1. **Modèle fourni : `Xenova/camembert-ner`** (q8, environ 114 Mo), conversion ONNX du modèle
   `Jean-Baptiste/camembert-ner`, **licence MIT**. Choisi pour sa licence simple (mention de copyright et texte
   de la licence, pas d'acceptation exigée) et sa qualité en français (rappel PERSON 0,87 sous Node, meilleurs
   ORG et LOC que DistilBERT, ADR 0001). Il est plus faible en anglais (rappel PERSON 0,79).
2. **Jamais dans Git.** Le workflow `.github/workflows/pages.yml` télécharge le modèle au build depuis
   Hugging Face, vérifie ses sommes SHA-256 (`scripts/bundled-model/camembert-ner.json`) puis le copie dans
   `dist/models/bundled/` avec une fiche `bundle.json` et le texte de licence (`LICENSE.txt`). Une somme
   différente fait échouer la publication : le modèle publié est exactement celui qui a été évalué.
3. **Servi par le site lui-même.** L'application ne lit le modèle que sur sa propre origine : CSP inchangée
   (`connect-src 'self'`), règles R1 et R4 respectées. Jamais de lecture directe depuis Hugging Face.
4. **Téléchargé à la demande.** Au démarrage, l'application lit seulement `bundle.json` (moins d'un ko). Le
   bouton « Installer le modèle fourni » (écran Texte et Réglages) télécharge le modèle, le valide comme un
   modèle chargé depuis le disque, et le range dans `lessive-models-v1`. Ensuite rien ne change par rapport à
   l'ADR 0003 : chargement par `customCache`, fonctionnement hors ligne, « Oublier le modèle ».
5. **Le service worker ne le met pas en cache** (dossier `models/` exclu du manifeste) : un seul exemplaire,
   dans le cache de l'application, et seulement si l'utilisateur l'a demandé.
6. **Le chargement depuis le disque reste proposé** (« Utiliser un autre modèle ? »), par exemple pour
   DistilBERT multilingue (français et anglais), que Lessive ne redistribue pas.
7. **Build sans modèle par défaut.** Seule la variable `LESSIVE_BUNDLED_MODEL` (dossier local du modèle)
   l'inclut ; `npm run build` produit le même site qu'avant.

## Conséquences

- Licence : MIT exige de conserver la mention de copyright et le texte de la licence ; ils sont servis à côté
  du modèle (`models/bundled/LICENSE.txt`), liés depuis l'interface, et cités dans `NOTICE`.
- Zone grise non tranchée : le corpus d'entraînement wikiner-fr est dérivé de Wikipédia. L'effet de ses
  conditions sur les poids n'est pas établi ; risque jugé faible (modèle très largement redistribué). À faire
  confirmer par un juriste avant un usage institutionnel.
- Hébergement GitHub Pages : site d'au plus 1 Go, bande passante indicative de 100 Go par mois, soit environ
  800 premières installations du modèle par mois. Le cache du navigateur évite les retéléchargements.
- Confidentialité : GitHub, comme tout hébergeur, voit l'adresse IP des visiteurs et les fichiers demandés
  (dont le modèle) ; il ne voit jamais le texte. Voir `docs/confidentialite.md`.
- Tests : `tests/e2e/bundled-model.test.ts` vérifie dans Chrome que rien d'autre que `bundle.json` n'est lu
  avant le clic, que le modèle vient de l'origine, que le nom est pseudonymisé et qu'aucun texte n'est stocké.
  Le workflow de publication l'exécute avec le modèle téléchargé ; la CI ordinaire le saute.
