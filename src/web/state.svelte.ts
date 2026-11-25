/**
 * État partagé de l'application (T5.1).
 *
 * C'est le SEUL endroit où vit l'état partagé de l'interface : les écrans lisent
 * `app.<champ>` et appellent les méthodes ; ils ne gardent en local que de l'état
 * purement visuel (sélection de texte en cours, menu ouvert…).
 *
 * R5 : tout est en mémoire. Le texte original, la session de pseudonymisation et
 * les textes produits ne sont jamais écrits dans un stockage du navigateur, ni
 * journalisés, ni repris dans un message d'erreur. L'export chiffré (T5.5) est la
 * seule exception, à la demande explicite de l'utilisateur.
 *
 * Invariant de validation : `validated` ne vaut vrai qu'entre un appel réussi à
 * `validate()` et la modification suivante, quelle qu'elle soit (texte, mode,
 * langue, seuil, NER, règles, corrections, session). Chaque transition ci-dessous
 * dit si elle remet la validation à faux.
 *
 * Analyse automatique (#38) : avec `autoAnalysisDelayMs`, un collage lance l'analyse tout de
 * suite, une frappe la lance après une pause, et un réglage qui la rend obsolète la relance en
 * gardant les corrections. Une analyse dépassée est annulée.
 *
 * Convention d'identifiants : les détections issues du moteur sont `d1`, `d2`…, les
 * ajouts manuels `m1`, `m2`… (dans l'ordre d'ajout). Les corrections par détection
 * (suppressions, types, opérateurs) sont indexées par ces identifiants.
 */
import { NER_INACTIVE_WARNING } from "../core/analyzer/analyzer.ts";
import {
  ENTITY_TYPES,
  MAX_INPUT_LENGTH,
  TransformError,
  createSession,
  reidentify,
  transform,
  type AnalysisResult,
  type ReidentifyResult,
  type Detection,
  type EntityType,
  type Language,
  type Mode,
  type OperatorId,
  type PackRegistry,
  type Session,
  type TransformPlan,
  type TransformResult,
} from "../core/index.ts";
import {
  AnalysisCancelledError,
  AnalysisClient,
  AnalysisFailure,
  type AnalysisJob,
  type AnalysisService,
} from "./analysis-client.ts";
import type { AnalysisStage } from "./analysis-protocol.ts";
import {
  forgetStoredModel,
  prepareModel,
  readStoredModel,
  storeModel,
  type ModelInfo,
  type PickedFile,
  type PreparedModel,
} from "./model-store.ts";
import { fetchBundledModel, probeBundledModel, type BundledManifest } from "./bundled-model.ts";
import { loadBundledRegistry } from "./packs.ts";
import { remapCorrections } from "./remap-corrections.ts";
import { applyOccurrenceAssignments } from "./occurrence-assignments.ts";

import {
  ALL_CLEANING_CATEGORIES,
  selectCleaningDetections,
  type CleaningCategory,
} from "./cleaning-categories.ts";
import {
  browserPreferenceStore,
  parseSelectedCategories,
  serializeExcludedCategories,
  type PreferenceStore,
} from "./preferences.ts";

export type LanguageChoice = Language | "auto";
export type AnalysisStatus = "idle" | "running" | "done" | "error";
/** État du modèle NER chargé par l'utilisateur (ADR 0003). */
export type ModelStatus = "absent" | "stored" | "loading" | "ready" | "error";

export const DEFAULT_MIN_SCORE = 0.5;
/** Pause de saisie avant l'analyse automatique (ms). */
export const AUTO_ANALYSIS_DELAY_MS = 800;

/** Intervalle choisi à la main (indices UTF-16 sur le texte original, `end` exclu). */
export interface ManualSpan {
  start: number;
  end: number;
  entityType: EntityType;
}

/** Corrections de l'utilisateur sur le résultat de l'analyse. */
export interface Corrections {
  /** Ajouts manuels, dans l'ordre : le n-ième devient la détection `m<n>`. */
  added: readonly ManualSpan[];
  /** Détections du moteur supprimées par l'utilisateur. */
  removedIds: readonly string[];
  typeOverrides: Readonly<Record<string, EntityType>>;
  /** Opérateur choisi pour une détection (priorité maximale du plan). */
  operatorOverrides: Readonly<Record<string, OperatorId>>;
  /** Repère de la personne choisie pour cette occurrence seulement, sans fusion de session. */
  entityAssignments?: Readonly<Record<string, string>>;
}

const EMPTY_CORRECTIONS: Corrections = {
  added: [],
  removedIds: [],
  typeOverrides: {},
  operatorOverrides: {},
};

export interface AppStateOptions {
  /** Service d'analyse ; par défaut le worker (créé au premier appel). */
  service?: AnalysisService;
  /** Registre des packs ; par défaut les packs livrés. */
  registry?: PackRegistry;
  /**
   * Pause de saisie avant l'analyse automatique (ms) ; `null` ou absent : pas d'analyse
   * automatique, seul `analyze()` la lance.
   */
  autoAnalysisDelayMs?: number | null;
  /** Stockage des préférences mémorisées sur demande ; absent : rien n'est lu ni écrit. */
  preferences?: PreferenceStore | null;
}

export interface SetTextOptions {
  /** Collage ou import : analyse tout de suite au lieu d'attendre la fin de la saisie. */
  immediate?: boolean;
}

const MANUAL_ID = /^m(\d+)$/;

/** Décale les clés `m<k>` après suppression de `m<removed>` (les ajouts suivants avancent d'un rang). */
function rekeyAfterManualRemoval<T>(
  record: Readonly<Record<string, T>>,
  removed: number,
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(record)) {
    const m = MANUAL_ID.exec(key);
    const k = m ? Number(m[1]) : 0;
    if (!m) out[key] = value;
    else if (k < removed) out[key] = value;
    else if (k > removed) out[`m${k - 1}`] = value;
  }
  return out;
}

export class AppState {
  // ---- Entrées de l'utilisateur ----
  /** Texte source, original et jamais modifié (R7). Utiliser `setText`. */
  text = $state("");
  /** Mode de traitement. Utiliser `setMode`. */
  mode = $state<Mode>("masking");
  /** Langue du texte ; « auto » = aucun filtre par langue. Utiliser `setLanguage`. */
  language = $state<LanguageChoice>("auto");
  /** Seuil de score, 0..1. Utiliser `setMinScore`. */
  minScore = $state(DEFAULT_MIN_SCORE);
  /** Demande la reconnaissance de noms (NER). Sans effet tant que `ner-provider.ts` n'a pas de moteur. */
  ner = $state(false);

  // ---- Sélection partagée entre le texte surligné, le détail et les corrections (T5.2, T5.3) ----
  /** Détection sélectionnée (identifiant), ou `null`. Utiliser `selectDetection`. */
  selectedDetectionId = $state<string | null>(null);
  /** Sélection de texte en cours dans la vue surlignée (indices UTF-16, `end` exclu), ou `null`. */
  textSelection = $state.raw<{ start: number; end: number } | null>(null);

  // ---- Analyse ----
  analysis = $state.raw<AnalysisResult | null>(null);
  analysisStatus = $state<AnalysisStatus>("idle");
  /** Progression 0..1 de l'étape en cours, `null` hors analyse. */
  progress = $state<number | null>(null);
  analysisStage = $state<AnalysisStage | null>(null);
  /** Message de la dernière erreur d'analyse, sans valeur du texte (R5). */
  errorMessage = $state<string | null>(null);
  /** Vrai si un réglage ou une correction a changé depuis le calcul de `analysis`. */
  analysisStale = $state(false);
  /** Vrai si une analyse automatique attend la fin de la pause de saisie. */
  analysisScheduled = $state(false);

  // ---- Corrections manuelles ----
  corrections = $state.raw<Corrections>(EMPTY_CORRECTIONS);
  /** Opérateur par type d'entité (priorité entre le défaut du mode et les choix par détection). */
  operatorByType = $state.raw<Partial<Record<EntityType, OperatorId>>>({});

  /**
   * Catégories à remplacer ; les catégories décochées restent lisibles. En mémoire, et sur cet
   * appareil seulement si `rememberCategories` (identifiants de catégories, jamais de texte : R5).
   */
  cleaningCategories = $state.raw<readonly CleaningCategory[]>([...ALL_CLEANING_CATEGORIES]);
  /** L'utilisateur a demandé de mémoriser le choix des catégories sur cet appareil. */
  rememberCategories = $state(false);
  /** Échec d'enregistrement ou d'effacement de la préférence, sans valeur du texte. */
  preferencesError = $state<string | null>(null);

  // ---- Réglages : packs et règles ----
  disabledPackIds = $state.raw<readonly string[]>([]);
  /** Surcharges d'activation par identifiant global de règle (`<pack>/<règle>`). */
  ruleOverrides = $state.raw<Readonly<Record<string, boolean>>>({});

  // ---- Transformation, validation, session ----
  /** Texte transformé ; `null` tant que `refreshTransform()` n'a pas réussi, ou après toute modification. */
  transformed = $state.raw<TransformResult | null>(null);
  /** Message de la dernière erreur de transformation, sans valeur du texte. */
  transformError = $state<string | null>(null);
  /** L'utilisateur a relu et validé le résultat ; condition de la copie. */
  validated = $state(false);
  /** Session de pseudonymisation, en mémoire seulement ; créée à la première pseudonymisation. */
  session = $state.raw<Session | null>(null);

  // ---- Réponse du LLM (T5.6, en direct depuis #38) ----
  llmResponse = $state("");
  /**
   * Compteur de révision de la session : les méthodes de la session la modifient en place,
   * ce compteur signale aux dérivés (réidentification) qu'elle a changé.
   */
  sessionRevision = $state(0);

  // ---- Dérivés ----
  readonly registry: PackRegistry;

  /** Détections à remplacer : catégories choisies, suppressions et corrections manuelles appliquées. */
  detections = $derived.by<Detection[]>(() => {
    if (!this.analysis) return [];
    const { removedIds, typeOverrides } = this.corrections;
    const corrected = this.analysis.detections
      .filter((d) => !removedIds.includes(d.id))
      .map((d) => {
        const type = typeOverrides[d.id];
        return type && type !== d.entityType ? { ...d, entityType: type } : d;
      });
    return selectCleaningDetections(corrected, this.analysis.discarded, this.cleaningCategories, [
      ...Object.keys(this.corrections.typeOverrides),
      ...Object.keys(this.corrections.operatorOverrides),
      ...Object.keys(this.corrections.entityAssignments ?? {}),
    ]);
  });

  /** Détections écartées par le moteur (sous le seuil ou perdantes d'un conflit). */
  discarded = $derived<Detection[]>(this.analysis?.discarded ?? []);
  warnings = $derived<string[]>(this.analysis?.warnings ?? []);
  detectionCount = $derived(this.detections.length);

  /** Plan de transformation courant, déduit du mode et des corrections d'opérateur. */
  plan = $derived<TransformPlan>({
    mode: this.mode,
    defaultOperator: this.mode === "masking" ? "mask" : "pseudonymize",
    byEntityType: { ...this.operatorByType },
    byDetectionId: { ...this.corrections.operatorOverrides },
  });

  /** Identifiants globaux des règles actives (packs actifs, règles actives), dans l'ordre du registre. */
  activeRuleIds = $derived.by<string[]>(() => {
    const ids: string[] = [];
    for (const pack of this.registry.orderedPacks()) {
      if (this.disabledPackIds.includes(pack.manifest.id)) continue;
      for (const rule of pack.rules) {
        const gid = `${pack.manifest.id}/${rule.id}`;
        if (this.ruleOverrides[gid] ?? rule.enabled ?? true) ids.push(gid);
      }
    }
    return ids;
  });

  canAnalyze = $derived(
    this.text.trim().length > 0 &&
      this.text.length <= MAX_INPUT_LENGTH &&
      this.analysisStatus !== "running",
  );
  /** La copie n'est possible que si le résultat est validé et à jour. */
  canCopy = $derived(this.validated && this.transformed !== null && !this.analysisStale);

  /** Vrai si l'utilisateur a corrigé l'analyse : le texte est alors figé (#38). */
  hasCorrections = $derived(
    this.corrections.added.length > 0 ||
      this.corrections.removedIds.length > 0 ||
      Object.keys(this.corrections.typeOverrides).length > 0 ||
      Object.keys(this.corrections.operatorOverrides).length > 0 ||
      Object.keys(this.corrections.entityAssignments ?? {}).length > 0,
  );

  /**
   * Réponse du LLM réidentifiée, recalculée à chaque saisie et à chaque changement de la session.
   * `null` sans réponse ou sans correspondance. Reste en mémoire, jamais stockée (R5).
   */
  reidentification = $derived.by<ReidentifyResult | null>(() => {
    void this.sessionRevision;
    const session = this.session;
    if (!session || this.llmResponse.trim().length === 0) return null;
    if (session.entities().length === 0) return null;
    return reidentify(this.llmResponse, session);
  });

  readonly #given: AnalysisService | undefined;
  readonly #preferences: PreferenceStore | null;
  readonly #autoDelay: number | null;
  #autoTimer: ReturnType<typeof setTimeout> | undefined;
  #service: AnalysisService | undefined;
  #job: AnalysisJob | null = null;
  #runId = 0;

  constructor(options: AppStateOptions = {}) {
    this.registry = options.registry ?? loadBundledRegistry();
    this.#given = options.service;
    this.#autoDelay = options.autoAnalysisDelayMs ?? null;
    this.#preferences = options.preferences ?? null;
    this.#loadPreferences();
    // Pas de détection sous Vitest ni sans navigateur : aucun stockage à interroger.
    if (typeof caches !== "undefined" && import.meta.env.MODE !== "test") void this.refreshModel();
  }

  // ======================================================================
  // Sélection
  // ======================================================================

  /** Sélectionne une détection (`null` : aucune). N'affecte ni la validation ni le résultat. */
  selectDetection(id: string | null): void {
    this.selectedDetectionId = id;
  }

  /** Mémorise la sélection de texte courante (`null` : aucune). N'affecte ni la validation ni le résultat. */
  setTextSelection(selection: { start: number; end: number } | null): void {
    this.textSelection = selection;
  }

  // ======================================================================
  // Entrées et réglages (remettent la validation à faux)
  // ======================================================================

  /**
   * Remplace le texte source. Repart de zéro : annule l'analyse en cours, efface
   * résultat, corrections, texte transformé et validation. Conserve réglages, session
   * et réponse du LLM. Avec l'analyse automatique, relance l'analyse tout de suite
   * (`immediate`) ou après la pause de saisie.
   */
  setText(text: string, options: SetTextOptions = {}): void {
    if (text === this.text) return;
    this.#cancelScheduled();
    this.#abortRun();
    this.text = text;
    this.analysis = null;
    this.analysisStatus = "idle";
    this.errorMessage = null;
    this.analysisStale = false;
    this.corrections = EMPTY_CORRECTIONS;
    this.selectedDetectionId = null;
    this.textSelection = null;
    this.#invalidateOutput();
    this.#autoAnalyze(options.immediate ? 0 : this.#autoDelay, false);
  }

  /**
   * Abandonne les corrections et relance l'analyse du même texte (« Modifier le texte »).
   * Le texte redevient modifiable.
   */
  discardCorrections(): void {
    if (!this.hasCorrections) return;
    this.corrections = EMPTY_CORRECTIONS;
    this.selectedDetectionId = null;
    this.textSelection = null;
    this.#invalidateOutput();
    if (this.analysis || this.analysisStatus === "running") void this.#run(false);
  }

  /** Change le mode. Le texte transformé et la validation sont effacés ; en masquage, les choix « pseudonymize » sont retirés. */
  setMode(mode: Mode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === "masking") {
      this.operatorByType = Object.fromEntries(
        Object.entries(this.operatorByType).filter(([, op]) => op !== "pseudonymize"),
      );
      this.corrections = {
        ...this.corrections,
        operatorOverrides: Object.fromEntries(
          Object.entries(this.corrections.operatorOverrides).filter(
            ([, op]) => op !== "pseudonymize",
          ),
        ),
      };
    }
    this.#invalidateOutput();
  }

  /** Change la langue : l'analyse devient obsolète (`analysisStale`). */
  setLanguage(language: LanguageChoice): void {
    if (language === this.language) return;
    this.language = language;
    this.#analysisInputsChanged();
  }

  /** Change le seuil (borné à 0..1) : l'analyse devient obsolète. */
  setMinScore(minScore: number): void {
    const value = Math.min(
      1,
      Math.max(0, Number.isFinite(minScore) ? minScore : DEFAULT_MIN_SCORE),
    );
    if (value === this.minScore) return;
    this.minScore = value;
    this.#analysisInputsChanged();
  }

  /** Active ou non le NER : l'analyse devient obsolète. */
  setNer(enabled: boolean): void {
    if (enabled === this.ner) return;
    this.ner = enabled;
    this.#analysisInputsChanged();
  }

  /** Change les catégories de sortie, sans relancer l’analyse ni effacer les corrections. */
  setCleaningCategories(categories: readonly CleaningCategory[]): void {
    const next = ALL_CLEANING_CATEGORIES.filter((c) => categories.includes(c));
    if (
      next.length === this.cleaningCategories.length &&
      next.every((c, i) => c === this.cleaningCategories[i])
    )
      return;
    this.cleaningCategories = next;
    this.selectedDetectionId = null;
    this.textSelection = null;
    this.#invalidateOutput();
    this.#savePreferences();
  }

  setCleaningCategory(category: CleaningCategory, enabled: boolean): void {
    this.setCleaningCategories(
      enabled
        ? [...this.cleaningCategories, category]
        : this.cleaningCategories.filter((c) => c !== category),
    );
  }

  /** Les valeurs par défaut remplacent toutes les catégories reconnues. */
  resetCleaningCategories(): void {
    this.setCleaningCategories(ALL_CLEANING_CATEGORIES);
  }

  /** Vrai si le navigateur permet de mémoriser le choix des catégories. */
  get canRememberCategories(): boolean {
    return this.#preferences !== null;
  }

  /**
   * Mémorise le choix des catégories sur cet appareil, ou l'oublie. Sur demande seulement :
   * rien n'est écrit tant que l'utilisateur ne l'a pas demandé.
   */
  setRememberCategories(remember: boolean): void {
    this.preferencesError = null;
    if (remember === this.rememberCategories) return;
    const store = this.#preferences;
    if (!store) {
      this.preferencesError = "Ce navigateur ne permet pas d’enregistrer ce choix.";
      return;
    }
    this.rememberCategories = remember;
    if (remember) {
      this.#savePreferences();
      return;
    }
    try {
      store.remove();
    } catch {
      this.preferencesError =
        "Le choix enregistré n’a pas pu être effacé. Videz les données du site dans le navigateur.";
    }
  }

  #loadPreferences(): void {
    const store = this.#preferences;
    if (!store) return;
    try {
      const raw = store.read();
      const selected = parseSelectedCategories(raw);
      if (selected) {
        this.cleaningCategories = selected;
        this.rememberCategories = true;
      } else if (raw !== null) {
        // Valeur illisible : on revient aux valeurs par défaut, toutes cochées.
        store.remove();
      }
    } catch {
      // Stockage refusé : comportement par défaut, rien de mémorisé.
    }
  }

  #savePreferences(): void {
    if (!this.rememberCategories || !this.#preferences) return;
    try {
      this.#preferences.write(serializeExcludedCategories(this.cleaningCategories));
    } catch {
      this.rememberCategories = false;
      this.preferencesError =
        "Le choix n’a pas pu être enregistré sur cet appareil. Il reste valable jusqu’au rechargement de la page.";
    }
  }

  /** Active ou désactive un pack entier : l'analyse devient obsolète. */
  setPackEnabled(packId: string, enabled: boolean): void {
    if (!this.registry.has(packId)) throw new RangeError(`Pack « ${packId} » inconnu.`);
    const others = this.disabledPackIds.filter((id) => id !== packId);
    this.disabledPackIds = enabled ? others : [...others, packId];
    this.#analysisInputsChanged();
  }

  isPackEnabled(packId: string): boolean {
    return !this.disabledPackIds.includes(packId);
  }

  /** Active ou désactive une règle (`<pack>/<règle>`) : l'analyse devient obsolète. */
  setRuleEnabled(globalRuleId: string, enabled: boolean): void {
    const [packId, ruleId] = globalRuleId.split("/");
    const rule = this.registry.get(packId ?? "")?.rules.find((r) => r.id === ruleId);
    if (!rule) throw new RangeError(`Règle « ${globalRuleId} » inconnue.`);
    this.ruleOverrides = { ...this.ruleOverrides, [globalRuleId]: enabled };
    this.#analysisInputsChanged();
  }

  /** Rétablit les packs et règles par défaut : l'analyse devient obsolète. */
  resetRules(): void {
    this.disabledPackIds = [];
    this.ruleOverrides = {};
    this.#analysisInputsChanged();
  }

  // ======================================================================
  // Analyse
  // ======================================================================

  /**
   * Lance l'analyse du texte courant dans le worker (annule celle en cours).
   * En cas de succès : `analysis` est remplacé, les corrections liées aux
   * identifiants du moteur (suppressions, types, opérateurs par détection) sont
   * effacées car les identifiants peuvent changer ; les ajouts manuels sont conservés.
   * Remet la validation à faux. Ne fait rien si `canAnalyze` est faux
   * (texte vide ou trop long) et signale alors l'erreur.
   */
  async analyze(): Promise<void> {
    this.#cancelScheduled();
    await this.#run(false);
  }

  /**
   * Analyse automatique : rien sans `autoAnalysisDelayMs`, ni pour un texte vide ou trop long.
   * `delay` à 0 : tout de suite ; `null` : rien.
   */
  #autoAnalyze(delay: number | null, keepCorrections: boolean): void {
    this.#cancelScheduled();
    if (this.#autoDelay === null || delay === null) return;
    if (this.text.trim().length === 0 || this.text.length > MAX_INPUT_LENGTH) return;
    if (delay <= 0) {
      void this.#run(keepCorrections);
      return;
    }
    this.analysisScheduled = true;
    this.#autoTimer = setTimeout(() => {
      this.#autoTimer = undefined;
      this.analysisScheduled = false;
      void this.#run(keepCorrections);
    }, delay);
  }

  #cancelScheduled(): void {
    if (this.#autoTimer !== undefined) clearTimeout(this.#autoTimer);
    this.#autoTimer = undefined;
    this.analysisScheduled = false;
  }

  /** Annule l'analyse en cours ; revient à `done` si un résultat existe, sinon `idle`. */
  cancelAnalysis(): void {
    this.#cancelScheduled();
    if (this.analysisStatus !== "running") return;
    this.#abortRun();
    this.analysisStatus = this.analysis ? "done" : "idle";
  }

  async #run(keepCorrections: boolean): Promise<void> {
    this.#cancelScheduled();
    if (this.text.length > MAX_INPUT_LENGTH) {
      this.analysisStatus = "error";
      this.errorMessage = `Texte trop long : maximum ${MAX_INPUT_LENGTH} caractères.`;
      return;
    }
    if (this.text.trim().length === 0) return;
    this.#abortRun();
    const runId = ++this.#runId;
    this.analysisStatus = "running";
    this.progress = 0;
    this.analysisStage = "rules";
    this.errorMessage = null;
    const knownPersons = this.#knownPersons();
    const job = this.#getService().start(
      {
        text: this.text,
        minScore: this.minScore,
        manual: this.#manualDetections(),
        activeRuleIds: [...this.activeRuleIds],
        ner: this.ner,
        ...(knownPersons.length > 0 ? { knownPersons } : {}),
        ...(this.language !== "auto" ? { language: this.language } : {}),
      },
      (stage, progress) => {
        if (runId !== this.#runId) return;
        this.analysisStage = stage;
        this.progress = progress;
        if (stage === "ner" && this.modelStatus === "stored") this.modelStatus = "loading";
      },
      (status) => {
        if (runId === this.#runId) this.#onNerStatus(status);
      },
    );
    this.#job = job;
    try {
      const result = await job.result;
      if (runId !== this.#runId) return;
      const previous = this.analysis;
      this.analysis = result;
      this.analysisStatus = "done";
      this.analysisStale = false;
      if (keepCorrections) {
        this.corrections = remapCorrections(this.corrections, previous, result);
      } else {
        this.corrections = { ...EMPTY_CORRECTIONS, added: this.corrections.added };
      }
      this.selectedDetectionId = null;
      this.#invalidateOutput();
    } catch (err) {
      if (runId !== this.#runId || err instanceof AnalysisCancelledError) return;
      this.analysisStatus = "error";
      // Les messages d'AnalysisFailure sont sans valeur du texte par contrat (R5).
      this.errorMessage =
        err instanceof AnalysisFailure ? err.message : "Erreur inattendue pendant l'analyse.";
    } finally {
      if (runId === this.#runId) {
        this.#job = null;
        this.progress = null;
        this.analysisStage = null;
      }
    }
  }

  /** Formes de surface des personnes de la session : propagation d'un document à l'autre (worker local seulement). */
  #knownPersons(): string[] {
    return (this.session?.entities() ?? [])
      .filter((e) => e.entityType === "PERSON")
      .flatMap((e) => e.surfaceForms);
  }

  /** Le worker n'est créé qu'au premier besoin. */
  #getService(): AnalysisService {
    return (this.#service ??= this.#given ?? new AnalysisClient());
  }

  #abortRun(): void {
    this.#runId++;
    this.#job?.cancel();
    this.#job = null;
    this.progress = null;
    this.analysisStage = null;
  }

  /**
   * Un réglage qui influe sur l'analyse a changé : résultat obsolète, sortie invalidée, calcul en
   * cours abandonné. Avec l'analyse automatique, relance après la pause en gardant les corrections ;
   * `rerun` à faux quand l'appelant relance lui-même.
   */
  #analysisInputsChanged(rerun = true): void {
    const wasRunning = this.analysisStatus === "running";
    if (wasRunning) {
      this.#abortRun();
      this.analysisStatus = this.analysis ? "done" : "idle";
    }
    if (this.analysis) this.analysisStale = true;
    this.#invalidateOutput();
    if (rerun && (this.analysis || wasRunning)) this.#autoAnalyze(this.#autoDelay, true);
  }

  #manualDetections(): Detection[] {
    return this.corrections.added.map((s, i) => ({
      id: `m${i + 1}`,
      start: s.start,
      end: s.end,
      entityType: s.entityType,
      score: 1,
      recognizerId: "manual",
      packId: "manual",
      source: "manual" as const,
      explanation: ["Ajout manuel de l'utilisateur"],
    }));
  }

  // ======================================================================
  // Corrections manuelles (remettent la validation à faux)
  // ======================================================================

  /** Ajoute une détection manuelle puis relance l'analyse (le moteur arbitre les conflits : le manuel gagne). */
  addManual(span: ManualSpan): void {
    this.addManualMany([span]);
  }

  /**
   * Ajoute plusieurs détections manuelles (ex. toutes les occurrences d'une valeur,
   * T5.3) avec une seule relance d'analyse. Lève `RangeError` (sans valeur du texte)
   * si un intervalle est invalide ; les doublons exacts sont ignorés. Le moteur
   * rejette les bornes coupant une paire de substitution : l'erreur apparaît alors
   * comme erreur d'analyse.
   */
  addManualMany(spans: readonly ManualSpan[]): void {
    const added = [...this.corrections.added];
    for (const s of spans) {
      const ok =
        Number.isInteger(s.start) &&
        Number.isInteger(s.end) &&
        s.start >= 0 &&
        s.start < s.end &&
        s.end <= this.text.length &&
        (ENTITY_TYPES as readonly string[]).includes(s.entityType);
      if (!ok) throw new RangeError("Intervalle de détection manuelle invalide.");
      if (!added.some((a) => a.start === s.start && a.end === s.end)) added.push({ ...s });
    }
    if (added.length === this.corrections.added.length) return;
    this.corrections = { ...this.corrections, added };
    const hadAnalysis = this.analysis !== null;
    this.#analysisInputsChanged(false);
    if (hadAnalysis) void this.#run(true);
  }

  /**
   * Supprime une détection. Un ajout manuel est retiré de la liste des ajouts (puis
   * l'analyse est relancée) ; une détection du moteur est ajoutée aux suppressions.
   */
  removeDetection(id: string): void {
    const d = this.analysis?.detections.find((x) => x.id === id);
    if (!d) return;
    if (this.selectedDetectionId === id) this.selectedDetectionId = null;
    const m = MANUAL_ID.exec(id);
    if (d.source === "manual" && m) {
      const rank = Number(m[1]);
      const added = this.corrections.added.filter((_, i) => i !== rank - 1);
      this.corrections = {
        ...this.corrections,
        added,
        typeOverrides: rekeyAfterManualRemoval(this.corrections.typeOverrides, rank),
        operatorOverrides: rekeyAfterManualRemoval(this.corrections.operatorOverrides, rank),
        entityAssignments: rekeyAfterManualRemoval(this.corrections.entityAssignments ?? {}, rank),
        removedIds: this.corrections.removedIds.filter((x) => x !== id),
      };
      this.#analysisInputsChanged(false);
      void this.#run(true);
      return;
    }
    if (this.corrections.removedIds.includes(id)) return;
    this.corrections = { ...this.corrections, removedIds: [...this.corrections.removedIds, id] };
    this.#invalidateOutput();
  }

  /** Annule la suppression d'une détection du moteur. */
  restoreDetection(id: string): void {
    if (!this.corrections.removedIds.includes(id)) return;
    this.corrections = {
      ...this.corrections,
      removedIds: this.corrections.removedIds.filter((x) => x !== id),
    };
    this.#invalidateOutput();
  }

  /** Change le type d'une détection (`null` : retour au type du moteur). */
  setDetectionType(id: string, entityType: EntityType | null): void {
    const next = { ...this.corrections.typeOverrides };
    if (entityType === null) delete next[id];
    else next[id] = entityType;
    const assignments = { ...this.corrections.entityAssignments };
    delete assignments[id];
    this.corrections = { ...this.corrections, typeOverrides: next, entityAssignments: assignments };
    this.#invalidateOutput();
  }

  /** Affecte un passage à une personne connue, sans fusionner les autres occurrences homonymes. */
  assignOccurrence(id: string, pseudonym: string | null): void {
    const assignments = { ...this.corrections.entityAssignments };
    if (pseudonym === null) delete assignments[id];
    else {
      const detection = this.detections.find((d) => d.id === id);
      const entity = this.session?.byPseudonym(pseudonym);
      if (!detection || detection.entityType !== "PERSON" || entity?.entityType !== "PERSON") {
        throw new Error("Rattachement indisponible : choisissez une personne connue.");
      }
      assignments[id] = entity.pseudonym;
    }
    this.corrections = { ...this.corrections, entityAssignments: assignments };
    this.#invalidateOutput();
  }

  /** Choisit l'opérateur d'une détection (`null` : retour au plan). Lève `Error` pour « pseudonymize » en masquage. */
  setDetectionOperator(id: string, operator: OperatorId | null): void {
    this.#assertOperatorAllowed(operator);
    const next = { ...this.corrections.operatorOverrides };
    if (operator === null) delete next[id];
    else next[id] = operator;
    this.corrections = { ...this.corrections, operatorOverrides: next };
    this.#invalidateOutput();
  }

  /** Choisit l'opérateur d'un type d'entité (`null` : retour au défaut du mode). */
  setOperatorForType(entityType: EntityType, operator: OperatorId | null): void {
    this.#assertOperatorAllowed(operator);
    const next = { ...this.operatorByType };
    if (operator === null) delete next[entityType];
    else next[entityType] = operator;
    this.operatorByType = next;
    this.#invalidateOutput();
  }

  #assertOperatorAllowed(operator: OperatorId | null): void {
    if (operator === "pseudonymize" && this.mode === "masking") {
      throw new Error("L'opérateur pseudonymize n'est pas disponible en mode Masquage.");
    }
  }

  // ======================================================================
  // Transformation, validation, session
  // ======================================================================

  /**
   * Calcule `transformed` à partir du texte, des détections effectives et du plan.
   * En pseudonymisation, crée la session au besoin et l'alimente. Renvoie le
   * résultat, ou `null` (et renseigne `transformError`) en cas d'échec.
   * À appeler depuis un gestionnaire d'événement ou un `$effect`, jamais depuis un `$derived`.
   * Ne modifie pas la validation (celle-ci n'est remise à faux que par une modification).
   */
  refreshTransform(): TransformResult | null {
    if (!this.analysis) return null;
    try {
      let session: Session | undefined;
      if (this.mode === "pseudonymization") {
        this.session ??= createSession();
        session = this.session;
      }
      this.transformed = transform(this.text, this.detections, this.plan, session);
      if (session && this.corrections.entityAssignments) {
        this.transformed = applyOccurrenceAssignments(
          this.transformed,
          this.corrections.entityAssignments,
          session,
        );
      }
      this.transformError = null;
      // La transformation alimente la session en place : la réidentification doit suivre.
      if (session) this.sessionRevision++;
    } catch (err) {
      this.transformed = null;
      // Les TransformError sont sans valeur originale par contrat (R5).
      this.transformError =
        err instanceof TransformError ? err.message : "Échec de la transformation.";
    }
    return this.transformed;
  }

  /** Valide le résultat affiché. Refusé (renvoie `false`) sans texte transformé à jour. */
  validate(): boolean {
    if (this.transformed === null || this.analysisStale || this.analysisStatus === "running") {
      return false;
    }
    this.validated = true;
    return true;
  }

  /** Retire la validation (« modifier » après relecture). */
  unvalidate(): void {
    this.validated = false;
  }

  /**
   * Remplace la session de pseudonymisation par une session vide (pseudonymes
   * recommencés). Efface texte transformé et validation. Utilisé par T5.5.
   */
  newSession(): void {
    this.corrections = { ...this.corrections, entityAssignments: {} };
    this.session = createSession();
    this.sessionRevision++;
    this.#invalidateOutput();
  }

  /** Remplace la session (import chiffré, T5.5). Efface texte transformé et validation. */
  replaceSession(session: Session): void {
    if (session !== this.session) {
      this.corrections = { ...this.corrections, entityAssignments: {} };
    }
    this.session = session;
    this.sessionRevision++;
    this.#invalidateOutput();
  }

  // ======================================================================
  // Réponse du LLM (T5.6)
  // ======================================================================

  /** Enregistre la réponse collée ; `reidentification` suit. N'affecte pas la validation. */
  setLlmResponse(text: string): void {
    this.llmResponse = text;
  }

  // ======================================================================
  // Remise à zéro
  // ======================================================================

  /** « Nouveau document » : efface texte, analyse, corrections, sortie et réponse du LLM. Conserve réglages et session. */
  reset(): void {
    this.#cancelScheduled();
    this.#abortRun();
    this.text = "";
    this.analysis = null;
    this.analysisStatus = "idle";
    this.errorMessage = null;
    this.analysisStale = false;
    this.corrections = EMPTY_CORRECTIONS;
    this.operatorByType = {};
    this.selectedDetectionId = null;
    this.textSelection = null;
    this.llmResponse = "";
    this.#invalidateOutput();
  }

  /** Libère le worker. */
  dispose(): void {
    this.#cancelScheduled();
    this.#abortRun();
    this.#service?.dispose();
    this.#service = undefined;
  }

  /** Toute modification : texte transformé effacé, validation remise à faux. */
  #invalidateOutput(): void {
    this.transformed = null;
    this.transformError = null;
    this.validated = false;
  }

  // ======================================================================
  // Modèle local (ADR 0003) : le modèle NER est chargé par l'utilisateur, jamais livré
  // ======================================================================

  /** `absent` : rien de chargé ; `stored` : fichiers conservés ; `loading`/`ready` : moteur en cours de chargement ou prêt ; `error` : fichiers inutilisables. */
  modelStatus = $state<ModelStatus>("absent");
  /** Description du modèle conservé, `null` si absent. */
  modelInfo = $state.raw<ModelInfo | null>(null);
  /** Dernier problème (sélection refusée, chargement impossible), en français et sans valeur du texte. */
  modelError = $state<string | null>(null);
  /** Explication quand le modèle ne vit que dans cette session (Cache Storage indisponible). */
  modelNotice = $state<string | null>(null);
  /** Une sélection est en cours de validation et de copie. */
  modelBusy = $state(false);
  /** Développement seulement : `models/` du dépôt est servi par Vite. */
  devModelAvailable = $state(false);

  /**
   * Vrai quand l'encadré d'état du modèle (en tête de page) annonce déjà que les noms ne seront pas
   * reconnus : même condition que ModelStatus, hors installation et chargement en cours.
   */
  modelLimitShown = $derived.by(
    () =>
      !this.modelBusy &&
      this.modelStatus !== "loading" &&
      (this.modelStatus === "absent" || this.modelStatus === "error" || !this.ner),
  );

  /**
   * Avertissements d'analyse que l'encadré du modèle n'affiche pas déjà : l'absence de NER y est
   * annoncée par l'état du modèle, la répéter doublait le message. La colonne « Texte à copier »
   * garde la liste complète.
   */
  newWarnings = $derived.by(() =>
    this.modelLimitShown ? this.warnings.filter((w) => w !== NER_INACTIVE_WARNING) : this.warnings,
  );
  /** Modèle fourni par cette version publiée (ADR 0004), `null` si elle n'en contient pas. */
  bundledModel = $state.raw<BundledManifest | null>(null);
  /** Téléchargement du modèle fourni en cours : entre 0 et 1 ; `null` sinon. */
  bundledProgress = $state<number | null>(null);

  /** Fichiers gardés en mémoire quand Cache Storage est indisponible. */
  #memoryModel: PreparedModel | undefined;

  /** Racine de l'application, comme la calcule le worker (`<racine>/assets/….js` → `<racine>/`). */
  #appRoot(): string {
    const href = globalThis.location?.href ?? "http://localhost/";
    return href.replace(/[?#].*$/, "").replace(/[^/]*$/, "");
  }

  /** Détecte un modèle déjà conservé (au démarrage) et, en développement, le modèle du dépôt. */
  async refreshModel(): Promise<void> {
    if (this.modelStatus === "loading" || this.modelStatus === "ready" || this.modelBusy) return;
    const stored = await readStoredModel(this.#appRoot());
    if (stored && !this.#memoryModel) {
      this.modelInfo = stored;
      this.modelStatus = "stored";
      this.modelError = null;
      // Un modèle déjà chargé lors d'une visite précédente : la reconnaissance des noms est
      // activée d'office (recette T6.6). L'utilisateur peut toujours la décocher.
      if (!this.ner) this.setNer(true);
    }
    if (import.meta.env.MODE !== "test") {
      this.bundledModel = (await probeBundledModel(this.#appRoot())) ?? null;
    }
    if (import.meta.env.DEV && import.meta.env.MODE !== "test") {
      const { probeDevModel } = await import("./dev-model.ts");
      this.devModelAvailable = await probeDevModel(this.#appRoot());
      // Développement : le modèle du dépôt ne vit qu'en mémoire, il serait perdu à chaque
      // rechargement. Sans autre modèle conservé, il est repris d'office.
      if (this.devModelAvailable && this.modelStatus === "absent" && !this.modelBusy) {
        await this.useDevModel();
      }
    }
  }

  /**
   * Installe le modèle fourni (ADR 0004) : téléchargement depuis l'origine de l'application, validation,
   * puis conservation comme un modèle chargé depuis le disque. Toujours à la demande de l'utilisateur.
   */
  async installBundledModel(): Promise<boolean> {
    const manifest = this.bundledModel;
    if (!manifest || this.modelBusy) return false;
    this.modelBusy = true;
    this.modelError = null;
    this.bundledProgress = 0;
    try {
      const prepared = await fetchBundledModel(this.#appRoot(), manifest, (p) => {
        this.bundledProgress = p;
      });
      if (!prepared.ok) {
        this.modelError = prepared.error;
        return false;
      }
      return await this.#adoptPrepared(prepared.value);
    } catch {
      this.modelError = "Le modèle fourni n'a pas pu être installé. Réessayez plus tard.";
      return false;
    } finally {
      this.modelBusy = false;
      this.bundledProgress = null;
    }
  }

  /**
   * Valide la sélection de l'utilisateur et conserve le modèle. Une sélection refusée ne touche pas au
   * modèle déjà chargé : seule `modelError` est renseignée.
   */
  async loadModelFromFiles(files: readonly PickedFile[]): Promise<boolean> {
    this.modelBusy = true;
    this.modelError = null;
    try {
      const prepared = await prepareModel(files);
      if (!prepared.ok) {
        this.modelError = prepared.error;
        return false;
      }
      return await this.#adoptPrepared(prepared.value);
    } catch {
      this.modelError =
        "Le modèle n'a pas pu être lu : fichiers illisibles ou déplacés pendant la lecture.";
      return false;
    } finally {
      this.modelBusy = false;
    }
  }

  /** Conserve un modèle validé (Cache Storage, sinon mémoire de la session) et l'active. */
  async #adoptPrepared(prepared: PreparedModel): Promise<boolean> {
    const outcome = await storeModel(prepared, this.#appRoot());
    this.#memoryModel = outcome.where === "memory" ? prepared : undefined;
    this.modelNotice =
      outcome.where === "memory"
        ? `${outcome.reason} Le modèle est gardé en mémoire pour cette session seulement : il faudra le recharger à la prochaine visite.`
        : null;
    this.modelInfo = { ...prepared.info, origin: outcome.where === "cache" ? "cache" : "memory" };
    this.modelStatus = "stored";
    this.#sendModelSource();
    if (this.ner) this.#analysisInputsChanged();
    else this.setNer(true); // charger un modèle, c'est vouloir s'en servir
    return true;
  }

  /** Oublie le modèle : vide Cache Storage et la mémoire de la session. */
  async forgetModel(): Promise<void> {
    this.#memoryModel = undefined;
    await forgetStoredModel();
    this.modelInfo = null;
    this.modelStatus = "absent";
    this.modelError = null;
    this.modelNotice = null;
    this.#sendModelSource();
    if (this.ner) this.#analysisInputsChanged();
  }

  /** Développement seulement : utilise `models/` du dépôt, servi par Vite. */
  async useDevModel(): Promise<void> {
    if (!import.meta.env.DEV || !this.devModelAvailable) return;
    const { devModelInfo } = await import("./dev-model.ts");
    this.#memoryModel = undefined;
    this.modelInfo = devModelInfo();
    this.modelStatus = "stored";
    this.modelError = null;
    this.modelNotice = null;
    this.#getService().setModel?.({ kind: "dev" });
    if (this.ner) this.#analysisInputsChanged();
    else this.setNer(true);
  }

  /** Dit au worker où lire le modèle (Cache Storage par défaut, Blob en mémoire sinon). */
  #sendModelSource(): void {
    const mem = this.#memoryModel;
    const files: [string, Blob][] = mem ? [...mem.blobs] : [];
    this.#getService().setModel?.(
      mem
        ? { kind: "memory", files, dtype: mem.info.dtype, name: mem.info.name }
        : { kind: "cache" },
    );
  }

  /** Issue du chargement du NER, rapportée par le worker. */
  #onNerStatus(status: "ready" | "missing" | "error"): void {
    if (status === "ready") {
      this.modelStatus = "ready";
      this.modelError = null;
    } else if (status === "missing") {
      // Cache vidé hors de l'application (réglages du navigateur) : la fiche affichée est périmée.
      if (!this.#memoryModel && this.modelStatus !== "absent") this.modelInfo = null;
      this.modelStatus = "absent";
    } else {
      this.modelStatus = "error";
      this.modelError =
        "Le modèle n'a pas pu être chargé : fichiers illisibles ou incompatibles. Chargez-le de nouveau.";
    }
  }
}

/** Instance unique utilisée par l'interface. Les tests créent leur propre `AppState`. */
export const app = new AppState({
  autoAnalysisDelayMs: import.meta.env.MODE === "test" ? null : AUTO_ANALYSIS_DELAY_MS,
  preferences: import.meta.env.MODE === "test" ? null : browserPreferenceStore(),
});
