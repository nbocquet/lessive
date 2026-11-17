import { describe, expect, it } from "vitest";
import { AbortError } from "../core/recognizers/index.ts";
import {
  buildDetections,
  createProgressTracker,
  dedupeSpans,
  foldForSearch,
  groupRawTokens,
  locateGroups,
  mapLabel,
  recognizeSegments,
  segmentText,
  stripPrefix,
  type NerSpan,
  type RawToken,
  type TokenGroup,
} from "./postprocess.ts";
import { fakeClassifier } from "./test-helpers.ts";

const tok = (entity: string, word: string, index: number, score = 0.9): RawToken => ({
  entity,
  word,
  index,
  score,
});
const group = (label: string, word: string, score = 0.9): TokenGroup => ({ label, word, score });
const slices = (text: string, spans: readonly { start: number; end: number }[]) =>
  spans.map((s) => text.slice(s.start, s.end));

describe("étiquettes", () => {
  it("retire les préfixes BIOES", () => {
    expect(["B-PER", "I-PER", "E-LOC", "S-ORG", "PER", "O"].map(stripPrefix)).toEqual([
      "PER",
      "PER",
      "LOC",
      "ORG",
      "PER",
      "O",
    ]);
  });

  it("fait correspondre PER, ORG, LOC et ignore le reste", () => {
    expect(mapLabel("B-PER")).toBe("PERSON");
    expect(mapLabel("I-PER")).toBe("PERSON");
    expect(mapLabel("PER")).toBe("PERSON");
    expect(mapLabel("B-ORG")).toBe("ORGANIZATION");
    expect(mapLabel("E-LOC")).toBe("LOCATION");
    expect(mapLabel("S-LOC")).toBe("LOCATION");
    expect(mapLabel("loc")).toBe("LOCATION");
    expect(mapLabel("B-MISC")).toBeNull();
    expect(mapLabel("B-DATE")).toBeNull();
    expect(mapLabel("O")).toBeNull();
    expect(mapLabel(undefined)).toBeNull();
  });
});

describe("groupRawTokens", () => {
  it("IO sans B- : deux personnes séparées par des mots restent deux entités", () => {
    // « Claire Dubois a rencontré Jean Marc Favre » : modèle IO (CamemBERT), aucun B-.
    const groups = groupRawTokens([
      tok("I-PER", "Claire", 1),
      tok("I-PER", "Dubois", 2),
      tok("I-PER", "Jean", 5),
      tok("I-PER", "Marc", 6),
      tok("I-PER", "Favre", 7),
    ]);
    expect(groups.map((g) => g.word)).toEqual(["Claire Dubois", "Jean Marc Favre"]);
    expect(groups.every((g) => g.label === "PER")).toBe(true);
  });

  it("rattache les continuations WordPiece ##, même avec un B-", () => {
    const groups = groupRawTokens([
      tok("B-PER", "Du", 1),
      tok("I-PER", "##pont", 2),
      tok("B-PER", "Ka", 4),
      tok("B-PER", "##rim", 5),
    ]);
    expect(groups.map((g) => g.word)).toEqual(["Dupont", "Karim"]);
  });

  it("SentencePiece : jetons contigus de même type fusionnés, marqueur ▁ retiré", () => {
    const groups = groupRawTokens([
      tok("I-PER", "▁Du", 1),
      tok("I-PER", "pont", 2),
      tok("I-LOC", "▁Nyon", 3),
    ]);
    // Le premier groupe garde un espace interne : sans effet sur la recherche normalisée.
    expect(groups.map((g) => [g.label, foldForSearch(g.word).norm])).toEqual([
      ["PER", "dupont"],
      ["LOC", "nyon"],
    ]);
  });

  it("B- ouvre un nouveau groupe entre deux personnes contiguës", () => {
    const groups = groupRawTokens([
      tok("B-PER", "Marie", 1),
      tok("I-PER", "Curie", 2),
      tok("B-PER", "Pierre", 3),
      tok("I-PER", "Martin", 4),
    ]);
    expect(groups.map((g) => g.word)).toEqual(["Marie Curie", "Pierre Martin"]);
  });

  it("un changement de type sépare les groupes contigus", () => {
    const groups = groupRawTokens([tok("I-PER", "Anne", 1), tok("I-ORG", "Acme", 2)]);
    expect(groups.map((g) => g.label)).toEqual(["PER", "ORG"]);
  });

  it("le score d'un groupe est la moyenne des scores des jetons", () => {
    const [g] = groupRawTokens([tok("B-PER", "Du", 1, 0.9), tok("I-PER", "##pont", 2, 0.7)]);
    expect(g?.score).toBeCloseTo(0.8, 10);
  });

  it("ne renvoie rien pour une entrée vide", () => {
    expect(groupRawTokens([])).toEqual([]);
  });
});

describe("locateGroups", () => {
  it("retrouve les positions après un emoji (UTF-16) et avec des accents", () => {
    const text = "🎉 Bravo à Marc Rochat pour Zoé 🎉";
    const { spans, unlocated } = locateGroups(text, [
      group("PER", "Marc Rochat"),
      group("PER", "Zoé"),
    ]);
    expect(unlocated).toBe(0);
    expect(slices(text, spans)).toEqual(["Marc Rochat", "Zoé"]);
    expect(spans[0]?.entityType).toBe("PERSON");
    expect(spans[0]?.approximate).toBe(false);
  });

  it("retrouve un texte décodé en minuscules et sans accents", () => {
    const text = "Merci à Élodie Béguelin et à l'Électricité du Chablais SA.";
    const { spans } = locateGroups(text, [
      group("PER", "elodie beguelin"),
      group("ORG", "electricite du chablais sa"),
    ]);
    expect(slices(text, spans)).toEqual(["Élodie Béguelin", "Électricité du Chablais SA"]);
  });

  it("ignore les espaces ajoutés autour des tirets et apostrophes", () => {
    const text = "Merci à Jean-Pierre D'Épinay.";
    const { spans } = locateGroups(text, [group("PER", "jean - pierre d ' epinay")]);
    expect(slices(text, spans)).toEqual(["Jean-Pierre D'Épinay"]);
  });

  it("unifie apostrophe et tiret typographiques", () => {
    const text = "Chez L’Atelier – Marc";
    const { spans } = locateGroups(text, [group("ORG", "L'Atelier"), group("PER", "Marc")]);
    expect(slices(text, spans)).toEqual(["L’Atelier", "Marc"]);
  });

  it("avance dans l'ordre pour un même nom répété", () => {
    const text = "Marc a écrit à Marc.";
    const { spans } = locateGroups(text, [group("PER", "Marc"), group("PER", "Marc")]);
    expect(spans.map((s) => [s.start, s.end])).toEqual([
      [0, 4],
      [15, 19],
    ]);
  });

  it("un groupe d'un type ignoré fait quand même avancer le curseur", () => {
    const text = "Marc (MISC) puis Marc";
    const { spans } = locateGroups(text, [group("MISC", "Marc"), group("PER", "Marc")]);
    expect(spans).toHaveLength(1);
    expect(spans[0]?.start).toBe(17);
  });

  it("préfère une occurrence alignée sur des frontières de mots", () => {
    const text = "Pierrette et Pierre sont là";
    const { spans } = locateGroups(text, [group("PER", "Pierre")]);
    expect([spans[0]?.start, spans[0]?.end]).toEqual([13, 19]);
    expect(spans[0]?.approximate).toBe(false);
  });

  it("se rabat sur une occurrence approximative", () => {
    const text = "Mme Dupontel est là";
    const { spans } = locateGroups(text, [group("PER", "Dupont")]);
    expect(spans[0]?.approximate).toBe(true);
    expect(slices(text, spans)).toEqual(["Dupont"]);
  });

  it("compte les entités non localisées et ignore les mots vides", () => {
    const { spans, unlocated } = locateGroups("Bonjour tout le monde", [
      group("PER", "Inconnu"),
      group("PER", ""),
      group("MISC", "Introuvable"),
      group("LOC", "monde"),
    ]);
    expect(unlocated).toBe(2);
    expect(spans).toHaveLength(1);
    expect(spans[0]?.entityType).toBe("LOCATION");
  });

  it("une entité non retrouvée n'avance pas le curseur", () => {
    const text = "Alice voit Bob";
    const { spans } = locateGroups(text, [
      group("PER", "Zorglub"),
      group("PER", "Alice"),
      group("PER", "Bob"),
    ]);
    expect(slices(text, spans)).toEqual(["Alice", "Bob"]);
  });

  it("gère les espaces insécables et les sauts de ligne dans le texte", () => {
    const text = "Bonjour,\n\nMarie Curie";
    const { spans } = locateGroups(text, [group("PER", "Marie Curie")]);
    expect(slices(text, spans)).toEqual(["Marie Curie"]);
  });
});

describe("segmentText", () => {
  it("renvoie un seul segment identique au texte quand il est court", () => {
    expect(segmentText("Bonjour Marie.")).toEqual([{ offset: 0, text: "Bonjour Marie." }]);
    expect(segmentText("")).toEqual([]);
  });

  it("borne les segments, couvre tout le texte et recouvre d'environ 100 unités", () => {
    const sentence = "Marie Curie habite à Nyon depuis longtemps. ";
    const text = sentence.repeat(120).trim();
    const segments = segmentText(text, 1000, 100);
    expect(segments.length).toBeGreaterThan(4);
    let covered = 0;
    segments.forEach((s, i) => {
      expect(s.text.length).toBeLessThanOrEqual(1000);
      expect(text.slice(s.offset, s.offset + s.text.length)).toBe(s.text);
      expect(s.offset).toBeLessThanOrEqual(covered); // pas de trou
      covered = Math.max(covered, s.offset + s.text.length);
      if (i > 0) {
        const prev = segments[i - 1]!;
        const lap = prev.offset + prev.text.length - s.offset;
        expect(lap).toBeGreaterThan(40);
        expect(lap).toBeLessThanOrEqual(100);
      }
    });
    expect(covered).toBe(text.length);
  });

  it("coupe de préférence après une fin de phrase", () => {
    const text = `${"mot ".repeat(60)}Fin de phrase. ${"autre ".repeat(60)}`.trim();
    const [first] = segmentText(text, 300, 50);
    expect(first?.text.endsWith("Fin de phrase. ")).toBe(true);
  });

  it("coupe après un espace à défaut de fin de phrase, et ne coupe pas les paires de substitution", () => {
    const text = "mot 😊 ".repeat(400).trim();
    for (const s of segmentText(text, 100, 20)) {
      const first = s.text.charCodeAt(0);
      const last = s.text.charCodeAt(s.text.length - 1);
      expect(first >= 0xdc00 && first <= 0xdfff).toBe(false);
      expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
    }
    const noSpace = "😊".repeat(300);
    const segments = segmentText(noSpace, 51, 10);
    expect(segments.length).toBeGreaterThan(5);
    for (const s of segments) {
      expect(s.text.charCodeAt(s.text.length - 1) & 0xfc00).not.toBe(0xd800);
      expect(s.text.charCodeAt(0) & 0xfc00).not.toBe(0xdc00);
    }
  });

  it("progresse toujours, même sans espace", () => {
    const segments = segmentText("x".repeat(5000), 100, 30);
    expect(segments[segments.length - 1]!.offset + segments[segments.length - 1]!.text.length).toBe(
      5000,
    );
    expect(segments.length).toBeLessThan(200);
  });

  it("refuse une taille invalide", () => {
    expect(() => segmentText("abc", 5)).toThrow(RangeError);
  });
});

describe("dedupeSpans", () => {
  const span = (start: number, end: number, score = 0.9): NerSpan => ({
    start,
    end,
    score,
    entityType: "PERSON",
    approximate: false,
  });

  it("garde la plus longue en cas de chevauchement", () => {
    expect(
      dedupeSpans([span(10, 15), span(10, 25), span(20, 30)]).map((s) => [s.start, s.end]),
    ).toEqual([[10, 25]]);
  });

  it("garde le meilleur score à longueur égale, et un seul de deux doublons identiques", () => {
    const kept = dedupeSpans([span(0, 5, 0.6), span(0, 5, 0.95), span(0, 5, 0.95)]);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.score).toBe(0.95);
  });

  it("conserve les entités adjacentes ou disjointes, triées", () => {
    const kept = dedupeSpans([span(20, 25), span(0, 5), span(5, 10)]);
    expect(kept.map((s) => s.start)).toEqual([0, 5, 20]);
  });
});

describe("recognizeSegments (textes longs)", () => {
  const lexicon = {
    Marie: "B-PER",
    Curie: "I-PER",
    Claire: "B-PER",
    Dubois: "I-PER",
    Nyon: "B-LOC",
    Acme: "B-ORG",
  };
  const filler = (n: number) => "lorem ".repeat(n);

  it("une entité à cheval sur la frontière de segment est trouvée entière, une seule fois", async () => {
    // « Marie » finit le premier segment, « Curie » commence l'espace suivant.
    const prefix = filler(165).slice(0, 990); // 990 unités
    const text = `${prefix}Marie Curie${" ipsum".repeat(200)}`;
    const classify = fakeClassifier(lexicon);
    const spans = await recognizeSegments(text, classify, { maxChars: 1000, overlap: 100 });
    expect(classify.calls.length).toBeGreaterThanOrEqual(2);
    // Le premier segment ne contient que « Marie » : sans recouvrement, « Curie » serait perdu.
    expect(classify.calls[0]).toContain("Marie");
    expect(classify.calls[0]).not.toContain("Curie");
    expect(slices(text, spans)).toEqual(["Marie Curie"]);
  });

  it("donne les mêmes positions qu'une analyse d'un seul tenant", async () => {
    const sentences = [
      "Claire Dubois travaille chez Acme à Nyon.",
      "Le lundi, Marie Curie répond au courriel de Claire Dubois.",
      "Rien à signaler ici, tout est calme.",
      "Acme et Nyon sont cités sans personne.",
    ];
    const text = Array.from({ length: 60 }, (_, i) => sentences[i % sentences.length]).join(" ");
    const whole = await recognizeSegments(text, fakeClassifier(lexicon, { fold: true }), {
      maxChars: 1_000_000,
    });
    const chunked = await recognizeSegments(text, fakeClassifier(lexicon, { fold: true }), {
      maxChars: 200,
      overlap: 60,
    });
    expect(chunked.length).toBeGreaterThan(60);
    expect(chunked.map((s) => [s.start, s.end, s.entityType])).toEqual(
      whole.map((s) => [s.start, s.end, s.entityType]),
    );
  });

  it("texte court : un seul appel, positions exactes", async () => {
    const text = "Bonjour Marie Curie, de Nyon.";
    const classify = fakeClassifier(lexicon);
    const spans = await recognizeSegments(text, classify);
    expect(classify.calls).toEqual([text]);
    expect(slices(text, spans)).toEqual(["Marie Curie", "Nyon"]);
  });

  it("traite 20 000 caractères avec des positions exactes et sans doublon", async () => {
    const sentence = "Claire Dubois a écrit à Acme depuis Nyon, merci de répondre vite. ";
    const text = sentence.repeat(Math.ceil(20_000 / sentence.length)).slice(0, 20_000);
    const spans = await recognizeSegments(text, fakeClassifier(lexicon), { minScore: 0.5 });
    const values = slices(text, spans);
    expect(values.every((v) => ["Claire Dubois", "Acme", "Nyon"].includes(v))).toBe(true);
    // Une dernière phrase tronquée peut perdre une entité : on compte avec la tolérance d'une phrase.
    const expected = Math.floor(20_000 / sentence.length) * 3;
    expect(values.length).toBeGreaterThanOrEqual(expected);
    expect(values.length).toBeLessThanOrEqual(expected + 3);
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i]!.start).toBeGreaterThanOrEqual(spans[i - 1]!.end);
    }
  });

  it("écarte les entités sous le seuil de score", async () => {
    const text = "Marie Curie et Nyon";
    const low = await recognizeSegments(text, fakeClassifier(lexicon, { score: 0.4 }), {
      minScore: 0.5,
    });
    expect(low).toEqual([]);
    const ok = await recognizeSegments(text, fakeClassifier(lexicon, { score: 0.6 }), {
      minScore: 0.5,
    });
    expect(ok).toHaveLength(2);
  });

  it("lève AbortError quand le signal est déjà annulé et entre deux segments", async () => {
    const text = `${filler(400)}Marie Curie`;
    const controller = new AbortController();
    controller.abort();
    await expect(
      recognizeSegments(text, fakeClassifier(lexicon), { signal: controller.signal }),
    ).rejects.toBeInstanceOf(AbortError);

    const later = new AbortController();
    const classify = fakeClassifier(lexicon);
    const wrapped: typeof classify = Object.assign(
      (t: string) => {
        later.abort(); // annulation pendant le premier segment
        return classify(t);
      },
      { calls: classify.calls },
    );
    await expect(
      recognizeSegments(text, wrapped, { maxChars: 500, signal: later.signal }),
    ).rejects.toBeInstanceOf(AbortError);
    expect(classify.calls).toHaveLength(1);
  });

  it("ignore un segment qui ne contient que des espaces", async () => {
    const classify = fakeClassifier(lexicon);
    await recognizeSegments("   \n  ", classify);
    expect(classify.calls).toEqual([]);
  });
});

describe("buildDetections", () => {
  it("construit des détections conformes au contrat, sans valeur dans l'explication", () => {
    const text = "Écrire à Camille Rochat demain";
    const spans: NerSpan[] = [
      { start: 9, end: 23, entityType: "PERSON", score: 0.934, approximate: false },
    ];
    let n = 0;
    const [d] = buildDetections(spans, "org/modele", () => `d${++n}`);
    expect(d).toMatchObject({
      id: "d1",
      start: 9,
      end: 23,
      entityType: "PERSON",
      score: 0.934,
      recognizerId: "ner/org/modele",
      packId: "ner",
      source: "ner",
    });
    expect(text.slice(d!.start, d!.end)).toBe("Camille Rochat");
    expect(d!.explanation.join(" ")).not.toContain("Camille");
    expect(d!.explanation.join(" ")).toContain("0,93");
  });
});

describe("createProgressTracker", () => {
  it("agrège les fichiers, ne recule jamais et plafonne à 0,99", () => {
    const track = createProgressTracker();
    expect(track({ status: "initiate", file: "a" })).toBeNull();
    expect(track({ status: "progress", file: "tokenizer.json", loaded: 50, total: 100 })).toBe(0.5);
    expect(track({ status: "progress", file: "model.onnx", loaded: 0, total: 900 })).toBe(0.5);
    expect(track({ status: "progress", file: "model.onnx", loaded: 450, total: 900 })).toBe(0.5);
    expect(track({ status: "progress", file: "model.onnx", loaded: 900, total: 900 })).toBeCloseTo(
      0.95,
    );
    expect(track({ status: "done", file: "tokenizer.json" })).toBe(0.99);
    expect(track({ status: "ready" })).toBeNull();
  });
});
