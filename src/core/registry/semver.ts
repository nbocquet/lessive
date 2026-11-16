/**
 * Comparaison sémantique de versions (semver 2.0.0), écrite à la main :
 * aucune dépendance (R9). Les métadonnées de build (`+...`) sont ignorées.
 */

export interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

/** Expression officielle de semver.org (sans groupes nommés). */
export const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export function isValidSemver(value: string): boolean {
  return SEMVER_PATTERN.test(value);
}

/** Décompose une version ; renvoie `null` si elle n'est pas valide. */
export function parseSemver(value: string): ParsedSemver | null {
  const m = SEMVER_PATTERN.exec(value);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ? m[4].split(".") : [],
  };
}

const NUMERIC = /^\d+$/;

function comparePrerelease(a: string[], b: string[]): -1 | 0 | 1 {
  // Une version sans pré-version est supérieure à la même avec pré-version.
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] as string;
    const y = b[i] as string;
    if (x === y) continue;
    const xn = NUMERIC.test(x);
    const yn = NUMERIC.test(y);
    if (xn && yn) return Number(x) < Number(y) ? -1 : 1;
    if (xn) return -1; // les identifiants numériques précèdent les alphanumériques
    if (yn) return 1;
    return x < y ? -1 : 1;
  }
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
}

/** Renvoie -1, 0 ou 1. Lève une `Error` si une des versions est invalide. */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa) throw new Error(`Version invalide : « ${a} »`);
  if (!pb) throw new Error(`Version invalide : « ${b} »`);
  for (const key of ["major", "minor", "patch"] as const) {
    if (pa[key] !== pb[key]) return pa[key] < pb[key] ? -1 : 1;
  }
  return comparePrerelease(pa.prerelease, pb.prerelease);
}

/** Vrai si le moteur (`engineVersion`) satisfait la version minimale requise. */
export function satisfiesMinimum(engineVersion: string, minimum: string): boolean {
  return compareSemver(engineVersion, minimum) >= 0;
}
