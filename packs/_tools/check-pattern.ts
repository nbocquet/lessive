/** Contrôle ReDoS isolé pour libérer toute la mémoire du vérificateur entre deux motifs. */
import { isSafePattern } from "redos-detector";

const { pattern, ...options } = JSON.parse(process.argv[2] ?? "{}") as {
  pattern: string;
  timeout: number;
  caseInsensitive: boolean;
  unicode: boolean;
  dotAll: boolean;
  multiLine: boolean;
};
process.stdout.write(String(isSafePattern(pattern, options).safe));
