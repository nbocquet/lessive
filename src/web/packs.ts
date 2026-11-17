/**
 * Chargement des packs livrés (T5.1).
 *
 * Les manifestes et fichiers de règles de `packs/<id>/` sont importés statiquement
 * par Vite au moment du build : ils font partie du bundle et aucune requête réseau
 * n'est faite à l'exécution (R1). Les dossiers dont le nom commence par `_`
 * (outils) sont exclus. Chaque pack est validé par `parsePack` (R8).
 *
 * Le module est utilisable côté page (liste des packs pour les réglages) et dans
 * le worker d'analyse.
 */
import { ENGINE_VERSION, PackRegistry, parsePack, type Pack } from "../core/index.ts";

/** Pack livré, tel que lu sur le disque au build : JSON non validé. */
export interface PackSource {
  /** Nom du dossier sous `packs/`. */
  dir: string;
  manifest: unknown;
  /** Fichiers de règles, clés relatives au dossier du pack (ex. `rules/patterns.json`). */
  files: Record<string, unknown>;
}

/** Un ou plusieurs packs livrés sont invalides. `message` liste tous les problèmes. */
export class PackLoadError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super(`Packs livrés invalides :\n${problems.join("\n")}`);
    this.name = "PackLoadError";
    this.problems = problems;
  }
}

/**
 * Valide les packs fournis et les enregistre dans un registre neuf.
 * Lève `PackLoadError` (avec tous les problèmes) si un pack est invalide, si un
 * identifiant est en double ou si une dépendance manque.
 */
export function buildRegistry(
  sources: readonly PackSource[],
  engineVersion: string = ENGINE_VERSION,
): PackRegistry {
  const problems: string[] = [];
  const packs: Pack[] = [];
  for (const source of sources) {
    const res = parsePack(source.manifest, source.files, engineVersion);
    if (res.ok) packs.push(res.pack);
    else problems.push(...res.errors.map((e) => `[packs/${source.dir}] ${e}`));
  }
  const registry = new PackRegistry();
  for (const pack of packs) {
    try {
      registry.register(pack);
    } catch (err) {
      problems.push(err instanceof Error ? err.message : "Enregistrement de pack impossible.");
    }
  }
  if (problems.length === 0) problems.push(...registry.checkDependencies());
  if (problems.length > 0) throw new PackLoadError(problems);
  return registry;
}

const manifestModules = import.meta.glob(["../../packs/*/manifest.json", "!../../packs/_*/**"], {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

const ruleModules = import.meta.glob(["../../packs/*/rules/*.json", "!../../packs/_*/**"], {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

const PACKS_PREFIX = "../../packs/";

/** Packs livrés, regroupés par dossier, triés par nom de dossier. */
export function bundledSources(): PackSource[] {
  const sources: PackSource[] = [];
  for (const [path, manifest] of Object.entries(manifestModules)) {
    const dir = path.slice(PACKS_PREFIX.length, path.length - "/manifest.json".length);
    const files: Record<string, unknown> = {};
    for (const [rulePath, json] of Object.entries(ruleModules)) {
      if (rulePath.startsWith(`${PACKS_PREFIX}${dir}/`)) {
        files[rulePath.slice(`${PACKS_PREFIX}${dir}/`.length)] = json;
      }
    }
    sources.push({ dir, manifest, files });
  }
  return sources.sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
}

let cached: PackRegistry | undefined;

/**
 * Registre des packs livrés, construit une seule fois par contexte (page ou worker).
 * Ne pas modifier l'activation dans ce registre : l'état de l'interface porte les
 * packs et règles actifs (`AppState`) et les transmet au worker.
 */
export function loadBundledRegistry(): PackRegistry {
  cached ??= buildRegistry(bundledSources());
  return cached;
}
