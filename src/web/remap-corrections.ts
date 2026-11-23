import type { AnalysisResult, Detection } from "../core/index.ts";
import type { Corrections } from "./state.svelte.ts";

/** Identité d'un passage sur le même texte, indépendante du compteur d1, d2… du moteur. */
function detectionKey(d: Detection): string {
  return JSON.stringify([d.start, d.end, d.entityType, d.packId, d.recognizerId, d.source]);
}

function index(result: AnalysisResult | null): Map<string, Detection[]> {
  const out = new Map<string, Detection[]>();
  for (const d of [...(result?.detections ?? []), ...(result?.discarded ?? [])]) {
    if (d.source === "manual") continue;
    const key = detectionKey(d);
    const matches = out.get(key) ?? [];
    matches.push(d);
    out.set(key, matches);
  }
  return out;
}

/**
 * Transfère les corrections après une relance sur le même texte. Une correspondance absente ou
 * ambiguë est abandonnée : réutiliser un identifiant pourrait laisser un autre passage en clair.
 * Les clés manuelles sont déjà décalées par removeDetection quand un ajout est supprimé.
 */
export function remapCorrections(
  corrections: Corrections,
  previous: AnalysisResult | null,
  next: AnalysisResult,
): Corrections {
  const before = index(previous);
  const after = index(next);
  const ids = new Map<string, string>();
  for (const [key, oldMatches] of before) {
    const newMatches = after.get(key);
    if (oldMatches.length === 1 && newMatches?.length === 1) {
      ids.set(oldMatches[0]!.id, newMatches[0]!.id);
    }
  }
  for (let i = 0; i < corrections.added.length; i++) ids.set(`m${i + 1}`, `m${i + 1}`);
  function remap<T>(record: Readonly<Record<string, T>>): Record<string, T> {
    const out: Record<string, T> = {};
    for (const [id, value] of Object.entries(record)) {
      const mapped = ids.get(id);
      if (mapped) out[mapped] = value;
    }
    return out;
  }
  return {
    added: corrections.added,
    removedIds: corrections.removedIds.flatMap((id) => {
      const mapped = ids.get(id);
      return mapped ? [mapped] : [];
    }),
    typeOverrides: remap(corrections.typeOverrides),
    operatorOverrides: remap(corrections.operatorOverrides),
  };
}
