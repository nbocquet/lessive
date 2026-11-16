import type {
  AnalysisContext,
  Detection,
  EntityType,
  Language,
  PatternRule,
  Recognizer,
  Validator,
} from "../types/index.ts";
import { ABORT_CHECK_INTERVAL, assertInputLength, formatScore, throwIfAborted } from "./errors.ts";

const ALLOWED_FLAGS = new Set(["i", "m", "s", "u"]);

/** Vérifie les drapeaux d'une règle : seuls i, m, s, u, sans doublon. `g` est ajouté par le moteur. */
function checkFlags(ruleId: string, flags: string): void {
  const seen = new Set<string>();
  for (const f of flags) {
    if (!ALLOWED_FLAGS.has(f)) {
      throw new Error(
        `Règle « ${ruleId} » : drapeau d'expression régulière « ${f} » interdit (autorisés : i, m, s, u ; « g » est ajouté par le moteur).`,
      );
    }
    if (seen.has(f)) {
      throw new Error(`Règle « ${ruleId} » : drapeau « ${f} » en double.`);
    }
    seen.add(f);
  }
}

/** Avance d'un point de code (évite de couper une paire de substitution avec le drapeau u). */
function nextIndex(text: string, index: number): number {
  const cp = text.codePointAt(index);
  return index + (cp !== undefined && cp > 0xffff ? 2 : 1);
}

/** Détecteur par expression régulière, avec validateur optionnel injecté. */
export class PatternRecognizer implements Recognizer {
  readonly id: string;
  readonly packId: string;
  readonly supportedEntities: readonly EntityType[];
  readonly languages: readonly Language[] | "any";
  private readonly source: string;
  private readonly flags: string;

  /**
   * @param validator fonction fournie par le registre ; obligatoire si la règle déclare un validateur.
   */
  constructor(
    private readonly rule: PatternRule,
    packId: string,
    private readonly validator?: Validator | undefined,
  ) {
    this.packId = packId;
    this.id = `${packId}/${rule.id}`;
    this.supportedEntities = [rule.entityType];
    this.languages =
      rule.languages === undefined || rule.languages === "any" ? "any" : rule.languages;
    checkFlags(rule.id, rule.flags ?? "");
    if (rule.validator !== undefined && validator === undefined) {
      throw new Error(
        `Règle « ${rule.id} » : le validateur « ${rule.validator} » est déclaré mais n'a pas été fourni.`,
      );
    }
    this.source = rule.pattern;
    this.flags = (rule.flags ?? "") + "g";
    try {
      new RegExp(this.source, this.flags);
    } catch {
      throw new Error(`Règle « ${rule.id} » : expression régulière invalide.`);
    }
  }

  async analyze(text: string, ctx: AnalysisContext): Promise<Detection[]> {
    assertInputLength(text);
    throwIfAborted(ctx.signal);
    const { rule } = this;
    // Une instance par appel : lastIndex n'est jamais partagé entre analyses concurrentes.
    const re = new RegExp(this.source, this.flags);
    const detections: Detection[] = [];
    let iterations = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (++iterations % ABORT_CHECK_INTERVAL === 0) throwIfAborted(ctx.signal);
      if (m[0].length === 0) {
        // Correspondance vide : on avance pour ne pas boucler indéfiniment, sans créer de détection.
        re.lastIndex = nextIndex(text, re.lastIndex);
        continue;
      }
      const explanation = [`motif « ${rule.id} » (score ${formatScore(rule.score)})`];
      let score = rule.score;
      let validated: boolean | undefined;
      if (this.validator) {
        if (!this.validator(m[0])) continue;
        score = 1;
        validated = true;
        explanation.push(`validateur ${rule.validator} réussi → 1,0`);
      }
      const d: Detection = {
        id: ctx.nextId(),
        start: m.index,
        end: m.index + m[0].length,
        entityType: rule.entityType,
        score,
        recognizerId: this.id,
        packId: this.packId,
        source: "pattern",
        explanation,
      };
      if (validated) d.validated = true;
      detections.push(d);
    }
    return detections;
  }
}
