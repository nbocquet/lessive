# ADR 0003 — Le modèle NER est chargé par l'utilisateur

- **Statut** : Accepté le 2026-11-17 (amendement A20 du cahier des charges d'origine, voir `docs/historique/`)
- **Date** : 2026-11-17
- **Remplace** : la partie « modèle livré dans `dist/` » de l'ADR 0001 (le choix du modèle recommandé reste valable)
- **Complété par** : ADR 0004 (la version en ligne fournit `Xenova/camembert-ner`, MIT ; le chargement depuis le disque reste possible)

## Contexte

L'ADR 0001 recommande `Xenova/distilbert-base-multilingual-cased-ner-hrl` pour la reconnaissance des noms.
Deux faits empêchent de le livrer avec l'application :

- **Taille.** Le fichier ONNX quantifié pèse environ 135 Mo (138 Mo avec le tokenizer), au-delà des 100 Mo
  qu'accepte un dépôt Git ordinaire et de ce qu'un hébergement statique ou une page GitHub Pages sert
  raisonnablement. Livré, il ajoutait environ 140 Mo à `dist/`.
- **Licence.** Le modèle d'origine (Davlan) est sous AFL-3.0, avec des données d'entraînement dont les
  conditions n'ont pas été tranchées (ADR 0001, « Points de licence »). Le projet est sous Apache 2.0 :
  redistribuer le modèle l'engagerait sur une licence et des données qui ne sont pas les siennes.

Les règles du projet restent inchangées : aucune requête réseau à l'exécution, CSP
`default-src 'self'; connect-src 'self'; script-src 'self' 'wasm-unsafe-eval'` (R1), modèles chargés
uniquement depuis des fichiers locaux (R4), aucune donnée de l'utilisateur dans un stockage (R5).

## Décision

Le modèle n'est pas livré. L'utilisateur le télécharge lui-même (il accepte alors sa licence) et le charge
depuis son disque dans Réglages, section NER.

1. **Sélection.** Un `<input type="file" webkitdirectory multiple>` (repli : sélection de plusieurs
   fichiers). Fichiers attendus : `config.json`, `tokenizer.json`, `tokenizer_config.json`,
   `special_tokens_map.json` (facultatif), `onnx/model_quantized.onnx` (repli `onnx/model.onnx`). Le dossier
   du modèle, un dossier parent contenant un seul modèle, ou les fichiers un par un sont acceptés.
2. **Validation** (logique pure, `src/web/model-store.ts`) : fichiers présents ; `config.json` avec un
   `id2label` contenant au moins un des types PER, ORG, LOC (sinon : « Ce modèle ne semble pas être un modèle
   de reconnaissance d'entités compatible. ») ; `tokenizer.json` et `tokenizer_config.json` JSON valides ;
   fichier ONNX d'au moins 1 ko (un pointeur Git LFS est reconnu) ; avertissement au-delà de 400 Mo. L'interface
   affiche le nom (`_name_or_path`, sinon le nom du dossier), la taille et les étiquettes.
3. **Stockage.** Cache Storage, cache `lessive-models-v1`, sous des URL synthétiques de même origine
   `<racine>/models/local/<fichier>`. Ces URL ne sont jamais requêtées : ce sont des clés. Le cache ne
   contient que les fichiers du modèle et une fiche `lessive-model.json` (nom, taille, étiquettes), écrite en
   dernier, dont la présence prouve que la copie est complète (R5 : jamais de texte de l'utilisateur).
   « Oublier le modèle » supprime le cache. Si Cache Storage est indisponible (navigation privée, quota), le
   modèle reste en mémoire pour la session, sous forme de `Blob` (références vers le disque, pas de copie),
   et l'interface l'explique.
4. **Lecture par Transformers.js.** Le worker d'analyse lit les fichiers par `env.useCustomCache = true` et
   `env.customCache` : un objet dont `match()` renvoie la `Response` du fichier demandé (depuis Cache Storage
   que le worker ouvre lui-même, ou depuis les `Blob` transmis une fois) et dont `put()` ne fait rien. Aucun
   octet du modèle ne transite par `postMessage` quand Cache Storage est disponible. `allowRemoteModels`
   reste faux. Un fichier facultatif absent (`special_tokens_map.json`) ferait retomber Transformers.js sur
   une requête : `env.fetch` est enveloppé pour renvoyer un 404 local sur les clés du modèle.
   Le piège de 4.3.2 (une URL http(s) en `localModelPath` fait omettre le tokenizer sans erreur) ne se pose
   plus, puisqu'aucune URL de modèle n'est utilisée ; un test réel vérifie que le tokenizer est chargé.
5. **État.** `modelStatus` : `absent`, `stored`, `loading`, `ready`, `error`. Un modèle déjà en cache est
   détecté au démarrage. NER activé sans modèle : message dans Réglages et avertissement d'analyse
   « chargez d'abord le modèle ». L'analyse ne tombe jamais en erreur pour autant.
6. **Build.** Le plugin Vite ne copie plus le modèle dans `dist/`. En développement seulement, si
   `models/Xenova/distilbert-base-multilingual-cased-ner-hrl/` existe, il est servi à `/models/` et un bouton
   « Utiliser le modèle de développement » apparaît (code isolé dans `src/web/dev-model.ts`, importé
   dynamiquement derrière `import.meta.env.DEV`, absent du build de production).
7. **Aide intégrée.** L'interface recommande ce modèle (français et anglais, environ 138 Mo), donne la
   commande `hf download … --include …` pour chaque fichier, mentionne `Xenova/camembert-ner` (français
   seulement) et rappelle que la licence du modèle est acceptée par l'utilisateur au téléchargement.

## Conséquences

- Le projet ne redistribue aucun modèle : plus de question de licence ni de taille de dépôt ; `dist/` ne pèse
  que l'application et les fichiers WASM d'ONNX Runtime.
- Premier usage plus lourd : il faut télécharger et charger le modèle une fois (démarche guidée dans
  l'interface). Ensuite il reste dans le navigateur de l'utilisateur.
- Sans modèle, Lessive fonctionne avec les seuls détecteurs par règles (packs) et le dit clairement.
- Le stockage est propre à chaque navigateur et à chaque origine ; un utilisateur qui vide les données du site
  doit recharger le modèle. Le navigateur peut évincer un cache sous pression de stockage (pas de
  `navigator.storage.persist()` demandé ici).
- Les fichiers viennent de l'utilisateur : un fichier ONNX est un graphe de calcul, pas du code exécutable par
  la page ; il n'élargit pas la CSP. La validation vérifie la forme, pas l'origine : la confiance dans la
  source du modèle reste à l'utilisateur.
- Le service worker (hors ligne) ne met jamais `models/` dans son cache d'application : le modèle a le sien.
- Reste à faire par l'utilisateur ou un test manuel : un navigateur autre que Chrome (voir le compte rendu de
  la tâche pour ce qui a été vérifié).

## Alternatives écartées

- **Livrer le modèle dans `dist/`** (situation de départ) : taille (> 100 Mo) et licence AFL-3.0 non
  redistribuée par le projet.
- **Télécharger le modèle depuis Hugging Face à l'exécution** : contraire à R1 et R4, élargirait la CSP
  (`connect-src`) et enverrait l'adresse IP de l'utilisateur à un tiers.
- **Modèle plus petit et sous licence permissive, livré** : l'ADR 0001 n'en a pas retenu qui
  combine le rappel attendu, une licence redistribuable sans réserve et moins de 100 Mo ; à rouvrir si un tel
  modèle apparaît.
- **IndexedDB ou OPFS** plutôt que Cache Storage : IndexedDB complique le stockage de fichiers de 140 Mo
  (copies en mémoire) ; OPFS est moins répandu. Cache Storage stocke des `Response` en flux, et c'est ce
  qu'attend le cache personnalisé de Transformers.js.
- **Servir les fichiers par des URL `blob:`** : exigerait `blob:` dans la CSP.
- **Un service worker qui répond aux URL synthétiques** : plus de pièces mobiles, et inutile : le cache
  personnalisé court-circuite la requête.
- **Transférer le modèle au worker par `postMessage`** : copie de 140 Mo ; réservé au repli en mémoire, où
  les `Blob` se transmettent par référence.
