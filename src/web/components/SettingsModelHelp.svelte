<!-- Aide : où trouver le modèle NER et comment le télécharger (ADR 0003). Texte statique. -->
<script lang="ts">
  const RECOMMENDED = "Xenova/distilbert-base-multilingual-cased-ner-hrl";
  const FILES = [
    "config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "onnx/model_quantized.onnx",
  ];
  const command = (repo: string, dir: string) =>
    `hf download ${repo} --local-dir ${dir} ${FILES.map((f) => `--include ${f}`).join(" ")}`;
</script>

<details class="help">
  <summary>Où trouver le modèle ?</summary>
  <p>
    Lessive ne livre pas de modèle : vous le téléchargez une fois, depuis Hugging Face, puis vous le
    chargez ici. Le modèle recommandé est <code>{RECOMMENDED}</code> (français et anglais, environ
    138 Mo). Pour un texte uniquement en français, <code>Xenova/camembert-ner</code> est une alternative
    (environ 114 Mo).
  </p>
  <p>Avec l'outil <code>hf</code> (paquet Python <code>huggingface_hub</code>) :</p>
  <pre><code>{command(RECOMMENDED, "distilbert-ner")}</code></pre>
  <p>
    Choisissez ensuite le dossier téléchargé (ici <code>distilbert-ner</code>) avec le bouton
    ci-dessus. Les fichiers nécessaires sont <code>config.json</code>, <code>tokenizer.json</code>,
    <code>tokenizer_config.json</code>, <code>onnx/model_quantized.onnx</code> (ou
    <code>onnx/model.onnx</code>) ; <code>special_tokens_map.json</code> est facultatif.
  </p>
  <p class="hint">
    Chaque modèle a sa propre licence, que vous acceptez en le téléchargeant (le modèle recommandé
    est sous AFL-3.0, <code>camembert-ner</code> sous MIT). Lessive ne le redistribue pas. Tout reste
    local : les fichiers sont lus par votre navigateur, copiés dans le stockage de cette application sur
    votre appareil, et ne sont envoyés nulle part.
  </p>
</details>

<style>
  .help p,
  .help pre {
    margin: 0.4rem 0;
  }

  pre {
    overflow-x: auto;
    padding: 0.5rem;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
