import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONSIGNES, LOTS, SYSTEM_CONSIGNES } from "./config.mjs";
import { ROOT, loadCorpus } from "./corpus.mjs";
import { FORMAT_IDS } from "./formats.mjs";

const md = readFileSync(join(ROOT, "consignes.md"), "utf8");

describe("consignes.md", () => {
  it("reprend chaque consigne et chaque consigne système de config.mjs", () => {
    for (const c of Object.values(CONSIGNES)) expect(md).toContain(c.prompt);
    for (const f of FORMAT_IDS) expect(md).toContain(SYSTEM_CONSIGNES[f]);
  });
  it("mentionne chaque identifiant de consigne, de texte et de format", () => {
    for (const id of Object.keys(CONSIGNES)) expect(md).toContain(`\`${id}\``);
    for (const t of loadCorpus()) expect(md).toContain(`\`${t.id}\``);
  });
});

describe("consignes système", () => {
  it("contiennent un exemple de jeton du bon format et l'ordre de recopier à l'identique", () => {
    expect(SYSTEM_CONSIGNES.A).toContain("PERSONNE_001");
    expect(SYSTEM_CONSIGNES.B).toContain("[PERSONNE_1]");
    expect(SYSTEM_CONSIGNES.C).toContain("⟦P1⟧");
    for (const f of FORMAT_IDS) expect(SYSTEM_CONSIGNES[f]).toContain("recopie-les à l'identique");
  });
});

describe("plan d'essais", () => {
  it("lot 1 = 30 essais, uniquement des consignes complètes avec consigne système", () => {
    expect(LOTS[1].trials).toHaveLength(30);
    for (const t of LOTS[1].trials) {
      expect(CONSIGNES[t.consigne].complete).toBe(true);
      expect(CONSIGNES[t.consigne].control).toBe(false);
    }
  });
  it("les textes et consignes du plan existent", () => {
    const ids = new Set(loadCorpus().map((t) => t.id));
    for (const lot of Object.values(LOTS)) {
      for (const t of lot.trials) {
        expect(ids.has(t.texte)).toBe(true);
        expect(t.consigne in CONSIGNES).toBe(true);
      }
    }
  });
});

describe("version courte et message envoyé", () => {
  it("lot court = 10 essais au format A, consignes complètes", async () => {
    const { LOTS: lots } = await import("./config.mjs");
    expect(lots.court.trials).toHaveLength(10);
    for (const t of lots.court.trials) {
      expect(t.format).toBe("A");
      expect(CONSIGNES[t.consigne].complete).toBe(true);
    }
  });
  it("buildPrompt suit le gabarit : consigne système, consigne, texte ; pas de consigne système pour le témoin", async () => {
    const { buildPrompt } = await import("./config.mjs");
    const p = buildPrompt({ texte: "rh", format: "A", consigne: "traduire" }, "Bonjour PERSONNE_001.\n");
    expect(p).toBe(
      `${SYSTEM_CONSIGNES.A}\n\n${CONSIGNES.traduire.prompt}\n\nTexte :\nBonjour PERSONNE_001.`,
    );
    const t = buildPrompt({ texte: "rh", format: "A", consigne: "traduire-sans" }, "x");
    expect(t.startsWith(CONSIGNES["traduire-sans"].prompt)).toBe(true);
  });
});
