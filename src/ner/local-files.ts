/**
 * Fichiers du modèle NER fournis par l'utilisateur (ADR 0003).
 *
 * Transformers.js 4.3.2 lit chaque fichier du modèle par `getModelFile`, qui consulte d'abord le cache
 * désigné par `env.customCache` (clé : `<localModelPath>/<modèle>/<fichier>`, puis l'URL distante
 * équivalente). Un cache « personnalisé » dont `match` renvoie la `Response` du fichier choisi par
 * l'utilisateur suffit donc : aucune requête, aucune URL à servir, aucun élargissement de la CSP.
 * `put` ne fait rien : le stockage persistant est géré par `src/web/model-store.ts`.
 *
 * Ce module ne dépend ni du DOM ni de Node (seulement de `Response`).
 */

/** Identifiant technique du modèle chargé depuis les fichiers de l'utilisateur. Forme `org/nom` exigée par Transformers.js. */
export const LOCAL_MODEL_ID = "lessive/local-model";

/**
 * Renvoie le contenu du fichier `name` (chemin relatif au dossier du modèle : `config.json`,
 * `onnx/model_quantized.onnx`…) ou `undefined` s'il n'existe pas. Appelée à chaque lecture : elle doit
 * renvoyer une `Response` neuve (un corps ne se lit qu'une fois).
 */
export type LocalModelFileSource = (
  name: string,
) => Promise<Response | undefined> | Response | undefined;

/** Le modèle choisi par l'utilisateur n'est pas disponible (aucun fichier, cache vidé). */
export class LocalModelMissingError extends Error {
  constructor(message = "Aucun modèle n'a été chargé.") {
    super(message);
    this.name = "LocalModelMissingError";
  }
}

/** Sous-ensemble de l'interface de cache de Transformers.js (`CacheInterface`). */
export interface LocalModelCache {
  match(request: string): Promise<Response | undefined>;
  put(request: string, response: Response): Promise<void>;
  delete(request: string): Promise<boolean>;
}

const KEY = new RegExp(`(?:^|/)${LOCAL_MODEL_ID}/(?:resolve/[^/]+/)?([^?#]+)(?:[?#].*)?$`);

/** Nom de fichier relatif au modèle dans une clé de cache de Transformers.js, ou `undefined`. */
export function localModelFileName(key: string): string | undefined {
  const m = KEY.exec(key);
  if (!m?.[1]) return undefined;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return undefined;
  }
}

/** Cache à affecter à `env.customCache` (avec `env.useCustomCache = true`). */
export function createLocalModelCache(source: LocalModelFileSource): LocalModelCache {
  return {
    async match(request) {
      const name = localModelFileName(request);
      return name === undefined ? undefined : await source(name);
    },
    // Rien à écrire : les fichiers viennent de l'utilisateur et sont déjà conservés ailleurs.
    put: () => Promise.resolve(),
    delete: () => Promise.resolve(false),
  };
}
