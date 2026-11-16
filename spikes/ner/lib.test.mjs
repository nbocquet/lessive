// Tests des fonctions pures, sans modèle : prédictions factices.
// Lancer : npm test (dans spikes/ner)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  mapLabel,
  normalizeWithMap,
  reconstructSpans,
  groupRawTokens,
  normalizePipelineOutput,
  chunkText,
  predictText,
  scoreSentence,
  scoreRows,
  prf,
  percentile,
  buildLongText,
  evaluateCriteria,
  renderReport,
} from "./lib.mjs";
import { parseMarkup } from "./corpus-tools/build.mjs";
import { verifyCorpus } from "./corpus-tools/verify.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const loadCorpus = (lang) =>
  readFileSync(join(here, "..", "..", "corpus", `ner-${lang}.jsonl`), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));

// --- étiquettes -----------------------------------------------------------

test("mapLabel : PER/ORG/LOC, préfixes BIOES, casse, inconnus", () => {
  assert.equal(mapLabel("B-PER"), "PERSON");
  assert.equal(mapLabel("I-PER"), "PERSON");
  assert.equal(mapLabel("PER"), "PERSON");
  assert.equal(mapLabel("B-ORG"), "ORGANIZATION");
  assert.equal(mapLabel("E-LOC"), "LOCATION");
  assert.equal(mapLabel("S-LOC"), "LOCATION");
  assert.equal(mapLabel("B-PERSON"), "PERSON");
  assert.equal(mapLabel("loc"), "LOCATION");
  assert.equal(mapLabel("B-GPE"), "LOCATION");
  assert.equal(mapLabel("B-MISC"), null);
  assert.equal(mapLabel("O"), null);
  assert.equal(mapLabel("B-DATE"), null);
  assert.equal(mapLabel(undefined), null);
});

// --- normalisation ----------------------------------------------------------

test("normalizeWithMap : sans espaces ni accents, indices UTF-16 d'origine", () => {
  const text = "😊 Zoé  Béguelin";
  const { norm, startMap, endMap } = normalizeWithMap(text);
  // L'emoji (2 unités) est conservé tel quel dans norm : on regarde la fin.
  assert.ok(norm.endsWith("zoebeguelin"));
  const i = norm.indexOf("zoebeguelin");
  assert.equal(startMap[i], 3); // 2 unités d'emoji + 1 espace
  assert.equal(endMap[i + "zoebeguelin".length - 1], text.length);
});

// --- reconstruction ---------------------------------------------------------

test("reconstructSpans : positions après un emoji (UTF-16) et accents", () => {
  const text = "🎉 Bravo à Marc Rochat pour Zoé 🎉";
  const r = reconstructSpans(text, [
    { entity_group: "PER", word: "Marc Rochat", score: 0.9 },
    { entity_group: "PER", word: "Zoé", score: 0.8 },
  ]);
  assert.equal(r.unlocated, 0);
  assert.equal(text.slice(r.spans[0].start, r.spans[0].end), "Marc Rochat");
  assert.equal(text.slice(r.spans[1].start, r.spans[1].end), "Zoé");
  assert.equal(r.spans[0].type, "PERSON");
  assert.equal(r.spans[0].source, "search");
});

test("reconstructSpans : mot décodé en minuscules, sans accents, espaces autour de ' et -", () => {
  const text = "Merci à Jean-Pierre D'Épinay et à l'Électricité du Chablais SA.";
  const r = reconstructSpans(text, [
    { entity_group: "PER", word: "jean - pierre d ' epinay", score: 1 },
    { entity_group: "ORG", word: "electricite du chablais sa", score: 1 },
  ]);
  assert.equal(text.slice(r.spans[0].start, r.spans[0].end), "Jean-Pierre D'Épinay");
  assert.equal(text.slice(r.spans[1].start, r.spans[1].end), "Électricité du Chablais SA");
});

test("reconstructSpans : apostrophe typographique et tiret long", () => {
  const text = "Chez L’Atelier – Marc";
  const r = reconstructSpans(text, [
    { entity_group: "ORG", word: "L'Atelier", score: 1 },
    { entity_group: "PER", word: "Marc", score: 1 },
  ]);
  assert.equal(text.slice(r.spans[0].start, r.spans[0].end), "L’Atelier");
  assert.equal(text.slice(r.spans[1].start, r.spans[1].end), "Marc");
});

test("reconstructSpans : même nom deux fois, on avance dans l'ordre", () => {
  const text = "Marc a écrit à Marc.";
  const r = reconstructSpans(text, [
    { entity_group: "PER", word: "Marc" },
    { entity_group: "PER", word: "Marc" },
  ]);
  assert.deepEqual(
    r.spans.map((s) => [s.start, s.end]),
    [
      [0, 4],
      [15, 19],
    ],
  );
});

test("reconstructSpans : préfère une occurrence alignée sur des frontières de mots", () => {
  const text = "Pierrette et Pierre sont là";
  const r = reconstructSpans(text, [{ entity_group: "PER", word: "Pierre" }]);
  assert.deepEqual([r.spans[0].start, r.spans[0].end], [13, 19]);
  assert.equal(r.spans[0].source, "search");
});

test("reconstructSpans : repli approximatif si aucune frontière ne convient", () => {
  const text = "Mme Dupontel est là";
  const r = reconstructSpans(text, [{ entity_group: "PER", word: "Dupont" }]);
  assert.equal(r.spans[0].source, "approx");
  assert.equal(text.slice(r.spans[0].start, r.spans[0].end), "Dupont");
});

test("reconstructSpans : start/end natifs utilisés s'ils sont valides, ignorés sinon", () => {
  const text = "Bonjour Camille";
  const ok = reconstructSpans(text, [{ entity_group: "PER", word: "x", start: 8, end: 15 }]);
  assert.equal(ok.spans[0].source, "native");
  assert.deepEqual([ok.spans[0].start, ok.spans[0].end], [8, 15]);
  const bad = reconstructSpans(text, [{ entity_group: "PER", word: "Camille", start: 8, end: 99 }]);
  assert.equal(bad.spans[0].source, "search");
  assert.deepEqual([bad.spans[0].start, bad.spans[0].end], [8, 15]);
});

test("reconstructSpans : non localisé, mot vide, MISC ignoré", () => {
  const text = "Bonjour tout le monde";
  const r = reconstructSpans(text, [
    { entity_group: "PER", word: "Inconnu" },
    { entity_group: "PER", word: "" },
    { entity_group: "MISC", word: "Bonjour" },
    { entity_group: "LOC", word: "monde" },
  ]);
  assert.equal(r.unlocated, 2);
  assert.equal(r.ignored, 1);
  assert.equal(r.spans.length, 1);
  assert.equal(r.spans[0].type, "LOCATION");
});

test("reconstructSpans : entité non retrouvée n'avance pas le curseur", () => {
  const text = "Alice voit Bob";
  const r = reconstructSpans(text, [
    { entity_group: "PER", word: "Zorglub" },
    { entity_group: "PER", word: "Alice" },
    { entity_group: "PER", word: "Bob" },
  ]);
  assert.equal(r.spans.length, 2);
  assert.equal(r.unlocated, 1);
});

// --- jetons bruts -------------------------------------------------------------

test("groupRawTokens : BIO, morceaux ##, jetons non contigus", () => {
  const raw = [
    { entity: "B-PER", word: "Du", index: 1, score: 0.9 },
    { entity: "I-PER", word: "##pont", index: 2, score: 0.7 },
    { entity: "B-PER", word: "Marie", index: 3, score: 0.8 },
    { entity: "I-PER", word: "Curie", index: 4, score: 0.6 },
    { entity: "B-LOC", word: "Nyon", index: 8, score: 0.99 },
    { entity: "I-LOC", word: "Gare", index: 12, score: 0.99 },
  ];
  const g = groupRawTokens(raw);
  assert.deepEqual(
    g.map((x) => [x.entity_group, x.word]),
    [
      ["PER", "Dupont"],
      ["PER", "Marie Curie"],
      ["LOC", "Nyon"],
      ["LOC", "Gare"],
    ],
  );
  assert.ok(Math.abs(g[0].score - 0.8) < 1e-9);
});

test("groupRawTokens : un ## B- se rattache quand même au mot", () => {
  const g = groupRawTokens([
    { entity: "B-PER", word: "Ka", index: 1, score: 1 },
    { entity: "B-PER", word: "##rim", index: 2, score: 1 },
  ]);
  assert.equal(g.length, 1);
  assert.equal(g[0].word, "Karim");
});

test("normalizePipelineOutput : bascule sur le regroupement si l'agrégation est ignorée", () => {
  const raw = [{ entity: "B-PER", word: "Léa", index: 1, score: 1 }];
  assert.equal(normalizePipelineOutput(raw)[0].entity_group, "PER");
  const grouped = [{ entity_group: "PER", word: "Léa", score: 1 }];
  assert.equal(normalizePipelineOutput(grouped), grouped);
  assert.deepEqual(normalizePipelineOutput([]), []);
});

// --- découpage -----------------------------------------------------------------

test("chunkText : jointif, borné, coupe sur espace, pas de paire de substitution coupée", () => {
  const text = ("mot 😊 ".repeat(400) + "x".repeat(50)).trim();
  const chunks = chunkText(text, 100);
  let pos = 0;
  for (const c of chunks) {
    assert.equal(c.offset, pos);
    assert.ok(c.text.length <= 100);
    assert.equal(text.slice(c.offset, c.offset + c.text.length), c.text);
    pos += c.text.length;
  }
  assert.equal(pos, text.length);
  const noSpace = "😊".repeat(101);
  for (const c of chunkText(noSpace, 11)) {
    const last = c.text.charCodeAt(c.text.length - 1);
    assert.ok(!(last >= 0xd800 && last <= 0xdbff));
  }
  assert.deepEqual(chunkText("", 10), []);
});

test("predictText : décale les positions par l'offset du morceau", async () => {
  const text = "Alice habite à Nyon. ".repeat(10).trim();
  const classify = async (chunk) => {
    const out = [];
    for (const m of chunk.matchAll(/Alice|Nyon/g)) {
      out.push({ entity_group: m[0] === "Alice" ? "PER" : "LOC", word: m[0], score: 1 });
    }
    return out;
  };
  const r = await predictText(text, classify, { chunkSize: 50 });
  assert.equal(r.spans.length, 20);
  for (const s of r.spans) assert.ok(["Alice", "Nyon"].includes(text.slice(s.start, s.end)));
  assert.equal(r.unlocated, 0);
});

// --- métriques --------------------------------------------------------------------

const E = (start, end, type) => ({ start, end, type });

test("scoreSentence exact : bornes et type", () => {
  const gold = [E(0, 4, "PERSON"), E(10, 15, "LOCATION")];
  const pred = [E(0, 4, "PERSON"), E(10, 14, "LOCATION"), E(20, 25, "ORGANIZATION")];
  const r = scoreSentence(gold, pred, "exact");
  assert.deepEqual(r.PERSON, { tp: 1, fp: 0, fn: 0 });
  assert.deepEqual(r.LOCATION, { tp: 0, fp: 1, fn: 1 });
  assert.deepEqual(r.ORGANIZATION, { tp: 0, fp: 1, fn: 0 });
  assert.deepEqual(r.ALL, { tp: 1, fp: 2, fn: 1 });
});

test("scoreSentence recouvrement : bornes approximatives acceptées, mauvais type refusé", () => {
  const gold = [E(0, 10, "PERSON"), E(20, 30, "LOCATION")];
  const pred = [E(0, 4, "PERSON"), E(25, 40, "ORGANIZATION")];
  const r = scoreSentence(gold, pred, "overlap");
  assert.deepEqual(r.PERSON, { tp: 1, fp: 0, fn: 0 });
  assert.deepEqual(r.LOCATION, { tp: 0, fp: 0, fn: 1 });
  assert.deepEqual(r.ORGANIZATION, { tp: 0, fp: 1, fn: 0 });
  // ANY ignore le type : la localisation est « détectée » (recouvrement), même mal typée.
  assert.deepEqual(r.ANY, { tp: 2, fp: 0, fn: 0 });
});

test("scoreSentence : appariement un-pour-un", () => {
  const gold = [E(0, 10, "PERSON")];
  const pred = [E(0, 4, "PERSON"), E(5, 10, "PERSON")];
  const r = scoreSentence(gold, pred, "overlap");
  assert.deepEqual(r.PERSON, { tp: 1, fp: 1, fn: 0 });
  const two = scoreSentence([E(0, 4, "PERSON"), E(5, 10, "PERSON")], [E(0, 10, "PERSON")], "overlap");
  assert.deepEqual(two.PERSON, { tp: 1, fp: 0, fn: 1 });
});

test("prf : valeurs, zéros et cas indéfinis", () => {
  const a = prf({ tp: 8, fp: 2, fn: 8 });
  assert.equal(a.precision, 0.8);
  assert.equal(a.recall, 0.5);
  assert.ok(Math.abs(a.f1 - 2 * 0.8 * 0.5 / 1.3) < 1e-12);
  assert.equal(a.support, 16);
  const none = prf({ tp: 0, fp: 0, fn: 0 });
  assert.equal(none.precision, null);
  assert.equal(none.recall, null);
  assert.equal(none.f1, null);
  const zero = prf({ tp: 0, fp: 3, fn: 2 });
  assert.equal(zero.precision, 0);
  assert.equal(zero.recall, 0);
  assert.equal(zero.f1, 0);
  const onlyFp = prf({ tp: 0, fp: 1, fn: 0 });
  assert.equal(onlyFp.precision, 0);
  assert.equal(onlyFp.recall, null);
});

test("scoreRows : agrège plusieurs phrases", () => {
  const rows = [
    { id: "a", entities: [E(0, 4, "PERSON")] },
    { id: "b", entities: [E(0, 4, "PERSON"), E(5, 9, "LOCATION")] },
    { id: "c", entities: [] },
  ];
  const preds = new Map([
    ["a", [E(0, 4, "PERSON")]],
    ["b", [E(0, 4, "PERSON")]],
    ["c", [E(0, 3, "PERSON")]],
  ]);
  const s = scoreRows(rows, preds);
  assert.equal(s.exact.PERSON.tp, 2);
  assert.equal(s.exact.PERSON.fp, 1);
  assert.equal(s.exact.LOCATION.fn, 1);
  assert.equal(s.overlap.ALL.support, 3);
});

test("percentile et buildLongText", () => {
  assert.equal(percentile([5, 1, 3, 2, 4], 50), 3);
  assert.equal(percentile([], 50), null);
  const t = buildLongText(["Un peu de texte 😊.", "Autre phrase."], 5000);
  assert.equal(t.length, 5000);
  const last = t.charCodeAt(t.length - 1);
  assert.ok(!(last >= 0xd800 && last <= 0xdbff));
});

test("evaluateCriteria", () => {
  const c = evaluateCriteria({ neededBytes: 120e6, personRecallFr: 0.9, longMedianMs: 4000 });
  assert.deepEqual([c.size, c.recall, c.time], ["oui", "oui", "oui"]);
  const d = evaluateCriteria({ neededBytes: 180e6, personRecallFr: 0.5, longMedianMs: 6000 });
  assert.deepEqual([d.size, d.recall, d.time], ["non", "non", "non"]);
});

// --- corpus --------------------------------------------------------------------------

test("parseMarkup : positions UTF-16 avec emoji", () => {
  const { text, entities } = parseMarkup("😊 Merci {P:Zoé} à {L:Nyon}");
  assert.equal(text, "😊 Merci Zoé à Nyon");
  assert.equal(text.slice(entities[0].start, entities[0].end), "Zoé");
  assert.equal(entities[0].start, 9); // 2 unités pour l'emoji
  assert.equal(text.slice(entities[1].start, entities[1].end), "Nyon");
  assert.throws(() => parseMarkup("a {P:b"), /invalide/);
});

test("verifyCorpus : détecte chevauchement, type invalide, intervalle vide, doublon", () => {
  const line = (o) => JSON.stringify(o);
  const base = { id: "x", text: "Marc et Zoé", entities: [] };
  const check = (rows) => verifyCorpus(rows.map(line).join("\n"), { expectedCount: rows.length }).errors;
  assert.ok(check([{ ...base, entities: [E(0, 4, "PERSON"), E(2, 6, "PERSON")] }]).some((e) => /chevauchement/.test(e)));
  assert.ok(check([{ ...base, entities: [E(0, 4, "PERSONNE")] }]).some((e) => /type invalide/.test(e)));
  assert.ok(check([{ ...base, entities: [E(3, 3, "PERSON")] }]).some((e) => /intervalle invalide/.test(e)));
  assert.ok(check([{ ...base, entities: [E(0, 5, "PERSON")] }]).some((e) => /espaces en bordure/.test(e)));
  assert.ok(check([base, base]).some((e) => /doublon|double/.test(e)));
  const emoji = { id: "e", text: "😊 Marc", entities: [E(1, 6, "PERSON")] };
  assert.ok(check([emoji]).some((e) => /paire de substitution/.test(e)));
});

for (const lang of ["fr", "en"]) {
  test(`corpus ner-${lang}.jsonl : cohérent (150 phrases, annotations valides)`, () => {
    const raw = readFileSync(join(here, "..", "..", "corpus", `ner-${lang}.jsonl`), "utf8");
    const { errors, stats } = verifyCorpus(raw);
    assert.deepEqual(errors, []);
    assert.equal(stats.sentences, 150);
  });
}

// --- bout en bout avec un classifieur factice qui imite Transformers.js v4 --------------
// La sortie imite aggregation_strategy "simple" : { entity_group, word, score }, sans start/end,
// avec un `word` décodé de façon dégradée (minuscules, sans accents, espaces autour de ' et -).

function fakeClassifierFor(rows) {
  const byText = new Map(rows.map((r) => [r.text, r.entities]));
  const abbr = { PERSON: "PER", ORGANIZATION: "ORG", LOCATION: "LOC" };
  return async (chunk) => {
    const ents = byText.get(chunk) ?? [];
    return ents.map((e, i) => {
      let word = chunk.slice(e.start, e.end);
      if (i % 2 === 0) {
        word = word
          .normalize("NFD")
          .replace(/\p{M}/gu, "")
          .toLowerCase()
          .replace(/(['’-])/g, " $1 ");
      }
      return { entity_group: abbr[e.type], word, score: 0.99 };
    });
  };
}

for (const lang of ["fr", "en"]) {
  test(`reconstruction sur tout le corpus ${lang} : un décodage dégradé redonne exactement l'or`, async () => {
    const rows = loadCorpus(lang);
    const classify = fakeClassifierFor(rows);
    const preds = new Map();
    let unlocated = 0;
    for (const row of rows) {
      const r = await predictText(row.text, classify);
      unlocated += r.unlocated;
      preds.set(row.id, r.spans);
    }
    assert.equal(unlocated, 0);
    const s = scoreRows(rows, preds);
    assert.equal(s.exact.ALL.fp, 0);
    assert.equal(s.exact.ALL.fn, 0);
    assert.equal(s.exact.ALL.f1, 1);
  });
}

test("renderReport : produit un tableau Markdown sans planter", () => {
  const empty = prf({ tp: 0, fp: 0, fn: 0 });
  const scores = { exact: {}, overlap: {} };
  for (const m of ["exact", "overlap"]) for (const k of ["PERSON", "ORGANIZATION", "LOCATION", "ALL", "ANY"]) scores[m][k] = empty;
  const md = renderReport({
    model: "org/modele",
    date: "2026-01-01",
    dtype: "q8",
    env: { transformers: "x", node: "y", cpu: "cpu", cores: 4 },
    perf: {
      loadMs: 1, sentences: 1, meanSentenceMs: 1, p95SentenceMs: 1, longChars: 5000, longChunks: 5,
      longRuns: 3, longMedianMs: 1, longMinMs: 1, rssBefore: 1, rssAfterLoad: 1, rssPeak: 1,
    },
    size: { weightsFile: "onnx/model_quantized.onnx", weightsBytes: 1, neededBytes: 1, totalBytes: 1 },
    byLang: { fr: scores },
    byTag: { fr: { std: scores } },
    reconstruction: { native: 0, search: 0, approx: 0, unlocated: 0, ignored: 0 },
    criteria: evaluateCriteria({ neededBytes: 1, personRecallFr: null, longMedianMs: 1 }),
  });
  assert.match(md, /# Résultats NER — org\/modele/);
  assert.match(md, /\| PERSON \|/);
});
