/**
 * Logique du worker d'analyse, sans accès à `self` : testable en Node (T5.1).
 * `analysis.worker.ts` ne fait que la brancher sur `postMessage`.
 */
import {
  AbortError,
  createAnalyzer,
  type ActiveRule,
  type Analyzer,
  type NerEngine,
  type PackRegistry,
} from "../core/index.ts";
import { LocalModelMissingError } from "../ner/local-files.ts";
import type {
  AnalysisErrorCode,
  AnalyzeRequest,
  ModelSourceSpec,
  NerStatus,
  WorkerRequest,
  WorkerResponse,
} from "./analysis-protocol.ts";
import type { NerProvider } from "./ner-provider.ts";

export interface AnalysisHandler {
  handle(request: WorkerRequest): void;
}

class RequestError extends Error {
  constructor(
    readonly code: AnalysisErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RequestError";
  }
}

/** Toutes les règles du registre, packs dans l'ordre des dépendances, sans tenir compte de l'activation. */
function allRules(registry: PackRegistry): ActiveRule[] {
  return registry.orderedPacks().flatMap((pack) =>
    pack.rules.map((rule) => ({
      globalId: `${pack.manifest.id}/${rule.id}`,
      packId: pack.manifest.id,
      rule,
    })),
  );
}

/** Message d'erreur sûr : jamais de valeur du texte (R5). */
function toResponseError(err: unknown): { code: AnalysisErrorCode; message: string } {
  if (err instanceof RequestError) return { code: err.code, message: err.message };
  // Les RangeError du moteur (texte trop long, bornes manuelles) sont sans valeur par contrat.
  if (err instanceof RangeError) return { code: "invalid_input", message: err.message };
  return { code: "internal", message: "Erreur interne pendant l'analyse." };
}

/**
 * @param getRegistry registre des packs ; peut lever (pack invalide) : l'erreur est alors renvoyée à chaque requête.
 * @param post envoi d'une réponse à la page.
 * @param loadNer fournisseur du moteur NER (voir `ner-provider.ts`).
 */
export function createAnalysisHandler(
  getRegistry: () => PackRegistry,
  post: (response: WorkerResponse) => void,
  loadNer: NerProvider,
): AnalysisHandler {
  const controllers = new Map<number, AbortController>();
  let analyzerCache: { key: string; analyzer: Analyzer } | undefined;
  let nerEngine: NerEngine | undefined;
  /** Source du modèle choisie par la page ; sans message, le worker lit Cache Storage. */
  let modelSpec: ModelSourceSpec | undefined;

  function analyzerFor(ruleIds: readonly string[]): Analyzer {
    const key = ruleIds.join("\n");
    if (analyzerCache?.key === key) return analyzerCache.analyzer;
    const rules = allRules(getRegistry());
    const known = new Map(rules.map((r) => [r.globalId, r]));
    const unknown = ruleIds.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new RequestError("invalid_request", `Règle(s) inconnue(s) : ${unknown.join(", ")}.`);
    }
    const wanted = new Set(ruleIds);
    const analyzer = createAnalyzer(rules.filter((r) => wanted.has(r.globalId)));
    analyzerCache = { key, analyzer };
    return analyzer;
  }

  async function run(req: AnalyzeRequest, signal: AbortSignal): Promise<void> {
    post({ type: "progress", id: req.id, stage: "rules", progress: 0 });
    const analyzer = analyzerFor(req.activeRuleIds);
    const extraWarnings: string[] = [];
    let ner: NerEngine | undefined;
    let nerStatus: NerStatus | undefined;
    if (req.ner) {
      nerStatus = "ready";
      try {
        // Chargement paresseux au premier besoin ; un échec n'est pas mis en cache (le modèle
        // peut être chargé ensuite) et ne fait jamais échouer l'analyse : simple avertissement.
        nerEngine ??= await loadNer(
          (progress) => post({ type: "progress", id: req.id, stage: "ner", progress }),
          modelSpec,
        );
        ner = nerEngine;
        if (!ner) {
          nerStatus = "error";
          extraWarnings.push(
            "La reconnaissance des noms (NER) a été demandée mais n'est pas disponible dans cette version.",
          );
        }
      } catch (err) {
        if (signal.aborted) throw new AbortError();
        if (err instanceof LocalModelMissingError) {
          nerStatus = "missing";
          extraWarnings.push(
            "La reconnaissance des noms (NER) est activée mais aucun modèle n'est chargé : chargez d'abord le modèle dans les Réglages. Seuls les détecteurs par règles ont été appliqués.",
          );
        } else {
          nerStatus = "error";
          // Message volontairement générique : l'erreur d'origine peut citer des chemins, jamais le texte (R5).
          extraWarnings.push(
            "La reconnaissance des noms (NER) n'est pas disponible : modèle introuvable ou illisible. Seuls les détecteurs par règles ont été appliqués.",
          );
        }
      }
    }
    const result = await analyzer.analyze(req.text, {
      minScore: req.minScore,
      signal,
      manual: req.manual,
      ...(req.language ? { language: req.language } : {}),
      ...(ner ? { ner } : {}),
    });
    if (signal.aborted) throw new AbortError();
    post({
      type: "result",
      id: req.id,
      result: { ...result, warnings: [...extraWarnings, ...result.warnings] },
      ...(nerStatus ? { nerStatus } : {}),
    });
  }

  return {
    handle(request) {
      if (request.type === "cancel") {
        controllers.get(request.id)?.abort();
        return;
      }
      if (request.type === "set-model") {
        modelSpec = request.model;
        // Le moteur en mémoire lit l'ancien modèle : on l'abandonne, le suivant sera rechargé.
        const old = nerEngine;
        nerEngine = undefined;
        void old?.dispose().catch(() => undefined);
        return;
      }
      const controller = new AbortController();
      controllers.set(request.id, controller);
      void run(request, controller.signal)
        .catch((err: unknown) => {
          if (controller.signal.aborted || err instanceof AbortError) {
            post({ type: "cancelled", id: request.id });
          } else {
            post({ type: "error", id: request.id, ...toResponseError(err) });
          }
        })
        .finally(() => controllers.delete(request.id));
    },
  };
}
