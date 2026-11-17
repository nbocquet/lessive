import type { Classifier, RawToken } from "./postprocess.ts";

/**
 * Faux pipeline `token-classification` pour les tests, sans modèle : chaque mot du lexique reçoit
 * son étiquette, les autres sont ignorés (comme `ignore_labels: ["O"]`). L'`index` compte tous les
 * mots, de sorte que deux entités séparées par un mot non étiqueté ne sont pas contiguës.
 * `fold` imite un modèle dont le décodage perd casse et accents.
 */
export function fakeClassifier(
  lexicon: Readonly<Record<string, string>>,
  { fold = false, score = 0.9 }: { fold?: boolean; score?: number } = {},
): Classifier & { calls: string[] } {
  const calls: string[] = [];
  const classify = (text: string): Promise<RawToken[]> => {
    calls.push(text);
    const tokens: RawToken[] = [];
    let index = 1;
    for (const m of text.matchAll(/[\p{L}\p{N}]+/gu)) {
      const entity = lexicon[m[0]];
      if (entity !== undefined) {
        const word = fold ? m[0].normalize("NFD").replace(/\p{M}/gu, "").toLowerCase() : m[0];
        tokens.push({ entity, word, score, index });
      }
      index++;
    }
    return Promise.resolve(tokens);
  };
  return Object.assign(classify, { calls });
}
