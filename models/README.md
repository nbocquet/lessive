# Modèles NER locaux

Ce dossier n'est pas versionné : les modèles sont trop lourds et ont leurs propres licences.

Les agents ne peuvent pas télécharger de modèle (Hugging Face est hors de leur liste blanche réseau).
Nico dépose chaque modèle à la main, au format attendu par Transformers.js :

```text
models/<organisation>/<nom-du-modele>/
├── config.json
├── tokenizer.json
├── tokenizer_config.json
└── onnx/
    └── model_quantized.onnx   (ou model.onnx)
```

La liste des modèles candidats et la commande de téléchargement figurent dans
`spikes/ner/README.md`.
