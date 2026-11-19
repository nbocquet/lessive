import type {
  AnalysisContext,
  Detection,
  DictionaryRule,
  EntityType,
  Language,
  Recognizer,
} from "../types/index.ts";
import { ABORT_CHECK_INTERVAL, assertInputLength, formatScore, throwIfAborted } from "./errors.ts";
import { foldText, tokenizeWords } from "./normalize.ts";

/** Séparateurs « équivalents » entre deux mots : espaces, tirets, apostrophes. */
const SIMPLE_SEPARATOR = /^[\s\p{Pd}'’ʼ]+$/u;

/** Ramène un intervalle entre deux mots à une forme comparable. */
function canonGap(gap: string): string {
  return SIMPLE_SEPARATOR.test(gap) ? " " : gap.replace(/\s+/g, " ");
}

interface TrieNode {
  children: Map<string, TrieNode>;
  terminal: boolean;
}

function newNode(): TrieNode {
  return { children: new Map(), terminal: false };
}

/** Clé d'arête : séparateur canonique puis mot (le premier mot n'a pas de séparateur). */
function edgeKey(gap: string | null, word: string): string {
  return gap === null ? word : `${canonGap(gap)}\u0000${word}`;
}

/**
 * Détecteur par dictionnaire. Les termes sont rangés dans un arbre de mots :
 * une analyse parcourt le texte une seule fois, quel que soit le nombre de termes.
 * Correspondance la plus longue à gauche, sans chevauchement.
 */
export class DictionaryRecognizer implements Recognizer {
  readonly id: string;
  readonly packId: string;
  readonly supportedEntities: readonly EntityType[];
  readonly languages: readonly Language[] | "any";
  private readonly root: TrieNode = newNode();
  private readonly lowerCase: boolean;
  private readonly rule: DictionaryRule;

  constructor(rule: DictionaryRule, packId: string) {
    this.rule = rule;
    this.packId = packId;
    this.id = `${packId}/${rule.id}`;
    this.supportedEntities = [rule.entityType];
    this.languages =
      rule.languages === undefined || rule.languages === "any" ? "any" : rule.languages;
    this.lowerCase = !rule.caseSensitive;
    for (const term of rule.terms) this.addTerm(term);
  }

  private addTerm(term: string): void {
    const folded = foldText(term, { lowerCase: this.lowerCase }).text;
    const tokens = tokenizeWords(folded);
    if (tokens.length === 0) return;
    let node = this.root;
    let prevEnd = 0;
    tokens.forEach((t, i) => {
      const key = edgeKey(i === 0 ? null : folded.slice(prevEnd, t.start), t.text);
      let next = node.children.get(key);
      if (!next) {
        next = newNode();
        node.children.set(key, next);
      }
      node = next;
      prevEnd = t.end;
    });
    node.terminal = true;
  }

  async analyze(text: string, ctx: AnalysisContext): Promise<Detection[]> {
    assertInputLength(text);
    throwIfAborted(ctx.signal);
    const folded = foldText(text, { lowerCase: this.lowerCase });
    const tokens = tokenizeWords(folded.text);
    const detections: Detection[] = [];
    let i = 0;
    while (i < tokens.length) {
      if (i % ABORT_CHECK_INTERVAL === 0) throwIfAborted(ctx.signal);
      const first = tokens[i] as (typeof tokens)[number];
      let node = this.root.children.get(edgeKey(null, first.text));
      let lastTerminal = -1;
      let j = i;
      while (node) {
        if (node.terminal) lastTerminal = j;
        const nextTok = tokens[j + 1];
        if (!nextTok) break;
        const gap = folded.text.slice((tokens[j] as (typeof tokens)[number]).end, nextTok.start);
        node = node.children.get(edgeKey(gap, nextTok.text));
        j++;
      }
      if (lastTerminal < 0) {
        i++;
        continue;
      }
      const last = tokens[lastTerminal] as (typeof tokens)[number];
      const span = folded.toOriginal(first.start, last.end);
      detections.push({
        id: ctx.nextId(),
        start: span.start,
        end: span.end,
        entityType: this.rule.entityType,
        score: this.rule.score,
        recognizerId: this.id,
        packId: this.packId,
        source: "dictionary",
        explanation: [`dictionnaire « ${this.rule.id} » (score ${formatScore(this.rule.score)})`],
      });
      i = lastTerminal + 1;
    }
    return detections;
  }
}
