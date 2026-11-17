/** Plafonds communs aux fichiers choisis sur disque et au modèle fourni (en octets). */
const MIB = 1024 * 1024;
export const MAX_MODEL_JSON_BYTES = MIB;
export const MAX_TOKENIZER_BYTES = 32 * MIB;
export const MAX_MODEL_ONNX_BYTES = 512 * MIB;
export const MAX_MODEL_TOTAL_BYTES = 550 * MIB;

export function modelFileLimit(name: string): number | undefined {
  switch (name) {
    case "config.json":
    case "tokenizer_config.json":
    case "special_tokens_map.json":
      return MAX_MODEL_JSON_BYTES;
    case "tokenizer.json":
      return MAX_TOKENIZER_BYTES;
    case "onnx/model_quantized.onnx":
    case "onnx/model.onnx":
      return MAX_MODEL_ONNX_BYTES;
    default:
      return undefined;
  }
}

/** Contrôle les métadonnées avant toute lecture ou écriture persistante. */
export function checkModelSizes(files: Iterable<{ name: string; size: number }>): string | null {
  let total = 0;
  const seen = new Set<string>();
  for (const { name, size } of files) {
    const limit = modelFileLimit(name);
    if (limit === undefined || seen.has(name) || !Number.isSafeInteger(size) || size <= 0) {
      return "Liste des fichiers du modèle invalide.";
    }
    seen.add(name);
    if (size > limit) {
      return `Fichier du modèle trop volumineux : ${name} (maximum ${limit / MIB} Mio).`;
    }
    total += size;
    if (total > MAX_MODEL_TOTAL_BYTES) {
      return "Modèle trop volumineux : maximum 550 Mio au total.";
    }
  }
  return null;
}
