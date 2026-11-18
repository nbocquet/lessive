# Modèles NER locaux

Ce dossier n'est pas versionné : les modèles sont lourds et ont leurs propres licences. Il sert au développement, aux tests et au build de la version en ligne.

Déposez chaque modèle au format attendu par Transformers.js :

```text
models/<organisation>/<nom-du-modele>/
├── config.json
├── tokenizer.json
├── tokenizer_config.json
├── special_tokens_map.json
└── onnx/
    └── model_quantized.onnx   (ou model.onnx)
```

- **Modèle fourni** : `node scripts/fetch-bundled-model.ts models/Xenova/camembert-ner` le télécharge et vérifie ses sommes SHA-256. Il est utilisé par `tests/e2e/bundled-model.test.ts` et par le build de publication.
- **Autre modèle** : commandes de téléchargement dans [docs/deploiement.md](../docs/deploiement.md) et [tools/ner-eval/README.md](../tools/ner-eval/README.md).
- En développement (`npm run dev`), `Xenova/distilbert-base-multilingual-cased-ner-hrl`, s'il est présent ici, est proposé par le bouton « Utiliser le modèle de développement ».
- Les tests qui ont besoin d'un modèle sont sautés, avec un message, quand il est absent.
