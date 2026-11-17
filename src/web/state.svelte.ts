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
 * Convention d'identifiants : les détections issues du moteur sont `d1`, `d2`…, les
 * ajouts manuels `m1`, `m2`… (dans l'ordre d'ajout). Les corrections par détection
 * (suppressions, types, opérateurs) sont indexées par ces identifiants.
 */
import {
  ENTITY_TYPES,
  MAX_INPUT_LENGTH,
  TransformError,
  createSession,
  transform,
  type AnalysisResult,
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
import { loadBundledRegistry } from "./packs.ts";

export type LanguageChoice = Language | "auto";
export type ScreenId = "text" | "review" | "result" | "reidentify";
export type AnalysisStatus = "idle" | "running" | "done" | "error";
/** État du modèle NER chargé par l'utilisateur (ADR 0003). */
export type ModelStatus = "absent" | "stored" | "loading" | "ready" | "error";

export const SCREEN_ORDER: readonly ScreenId[] = ["text", "review", "result", "reidentify"];
export const DEFAULT_MIN_SCORE = 0.5;

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

  // ---- Navigation ----
  screen = $state<ScreenId>("text");

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

  // ---- Corrections manuelles ----
  corrections = $state.raw<Corrections>(EMPTY_CORRECTIONS);
  /** Opérateur par type d'entité (priorité entre le défaut du mode et les choix par détection). */
  operatorByType = $state.raw<Partial<Record<EntityType, OperatorId>>>({});

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

  // ---- Réponse du LLM (logique en T5.6) ----
  llmResponse = $state("");
  reidentified = $state<string | null>(null);

  // ---- Dérivés ----
  readonly registry: PackRegistry;

  /** Détections effectives : résultat du moteur moins les suppressions, avec les types corrigés. */
  detections = $derived.by<Detection[]>(() => {
    if (!this.analysis) return [];
    const { removedIds, typeOverrides } = this.corrections;
    return this.analysis.detections
      .filter((d) => !removedIds.includes(d.id))
      .map((d) => {
        const type = typeOverrides[d.id];
        return type && type !== d.entityType ? { ...d, entityType: type } : d;
      });
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

  readonly #given: AnalysisService | undefined;
  #service: AnalysisService | undefined;
  #job: AnalysisJob | null = null;
  #runId = 0;

  constructor(options: AppStateOptions = {}) {
    this.registry = options.registry ?? loadBundledRegistry();
    this.#given = options.service;
    // Pas de détection sous Vitest ni sans navigateur : aucun stockage à interroger.
    if (typeof caches !== "undefined" && import.meta.env.MODE !== "test") void this.refreshModel();
  }

  // ======================================================================
  // Navigation
  // ======================================================================

  /** Vrai si l'écran est accessible : « vérification » et « résultat » exigent une analyse. */
  canGoTo(screen: ScreenId): boolean {
    if (screen === "review" || screen === "result") return this.analysis !== null;
    return true;
  }

  /** Change d'écran si possible ; renvoie `false` sinon. Ne modifie pas la validation. */
  goTo(screen: ScreenId): boolean {
    if (!this.canGoTo(screen)) return false;
    this.screen = screen;
    return true;
  }

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
   * résultat, corrections, texte transformé et validation, et revient à l'écran 1
   * si l'écran courant exige une analyse. Conserve réglages, session et réponse du LLM.
   */
  setText(text: string): void {
    if (text === this.text) return;
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
    if (this.screen === "review" || this.screen === "result") this.screen = "text";
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
    await this.#run(false);
  }

  /** Annule l'analyse en cours ; revient à `done` si un résultat existe, sinon `idle`. */
  cancelAnalysis(): void {
    if (this.analysisStatus !== "running") return;
    this.#abortRun();
    this.analysisStatus = this.analysis ? "done" : "idle";
  }

  async #run(keepIdCorrections: boolean): Promise<void> {
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
      this.analysis = result;
      this.analysisStatus = "done";
      this.analysisStale = false;
      if (!keepIdCorrections) {
        this.corrections = { ...EMPTY_CORRECTIONS, added: this.corrections.added };
        this.selectedDetectionId = null;
      }
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

  /** Un réglage qui influe sur l'analyse a changé : résultat obsolète, sortie invalidée, calcul en cours abandonné. */
  #analysisInputsChanged(): void {
    if (this.analysisStatus === "running") {
      this.#abortRun();
      this.analysisStatus = this.analysis ? "done" : "idle";
    }
    if (this.analysis) this.analysisStale = true;
    this.#invalidateOutput();
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
    this.#analysisInputsChanged();
    if (this.analysis) void this.#run(true);
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
        removedIds: this.corrections.removedIds.filter((x) => x !== id),
      };
      this.#analysisInputsChanged();
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
    this.corrections = { ...this.corrections, typeOverrides: next };
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
      this.transformError = null;
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
    this.session = createSession();
    this.#invalidateOutput();
  }

  /** Remplace la session (import chiffré, T5.5). Efface texte transformé et validation. */
  replaceSession(session: Session): void {
    this.session = session;
    this.#invalidateOutput();
  }

  // ======================================================================
  // Réponse du LLM (T5.6)
  // ======================================================================

  /** Enregistre la réponse collée et efface la réidentification précédente. N'affecte pas la validation. */
  setLlmResponse(text: string): void {
    this.llmResponse = text;
    this.reidentified = null;
  }

  /** Enregistre le texte réidentifié (calculé par T5.6) ; `null` pour l'effacer. */
  setReidentified(text: string | null): void {
    this.reidentified = text;
  }

  // ======================================================================
  // Remise à zéro
  // ======================================================================

  /** « Nouveau document » : efface texte, analyse, corrections, sortie et réponse du LLM, revient à l'écran 1. Conserve réglages et session. */
  reset(): void {
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
    this.reidentified = null;
    this.screen = "text";
    this.#invalidateOutput();
  }

  /** Libère le worker. */
  dispose(): void {
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
    if (import.meta.env.DEV && import.meta.env.MODE !== "test") {
      const { probeDevModel } = await import("./dev-model.ts");
      this.devModelAvailable = await probeDevModel(this.#appRoot());
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
      const outcome = await storeModel(prepared.value, this.#appRoot());
      this.#memoryModel = outcome.where === "memory" ? prepared.value : undefined;
      this.modelNotice =
        outcome.where === "memory"
          ? `${outcome.reason} Le modèle est gardé en mémoire pour cette session seulement : il faudra le recharger à la prochaine visite.`
          : null;
      this.modelInfo = {
        ...prepared.value.info,
        origin: outcome.where === "cache" ? "cache" : "memory",
      };
      this.modelStatus = "stored";
      this.#sendModelSource();
      if (this.ner) this.#analysisInputsChanged();
      else this.setNer(true); // charger un modèle, c'est vouloir s'en servir
      return true;
    } catch {
      this.modelError =
        "Le modèle n'a pas pu être lu : fichiers illisibles ou déplacés pendant la lecture.";
      return false;
    } finally {
      this.modelBusy = false;
    }
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
export const app = new AppState();
