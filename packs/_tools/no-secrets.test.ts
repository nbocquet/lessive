/**
 * Aucun fichier du dépôt ne doit contenir une chaîne en forme de secret en clair.
 *
 * Les cas de test des règles SECRET en ont besoin : on y écrit le premier caractère sous forme
 * d'échappement JSON (« xoxb-… » pour « xoxb-… ») ; la valeur lue est identique, mais les
 * scanners de secrets (GitHub push protection) ne la reconnaissent plus. Sans cela, un push
 * vers GitHub est refusé (incident du 17 novembre 2026).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../..", import.meta.url).pathname;

const SECRET_SHAPES: Array<[string, RegExp]> = [
  ["jeton Slack", /xox[abprs]-[0-9A-Za-z-]{10,}/u],
  ["jeton GitHub", /gh[pousr]_[0-9A-Za-z]{30,}/u],
  ["jeton GitHub à granularité fine", /github_pat_[0-9A-Za-z_]{20,}/u],
  ["clé Stripe", /sk_(?:live|test)_[0-9A-Za-z]{10,}/u],
  ["clé Google", /AIza[0-9A-Za-z_-]{30,}/u],
  ["clé Anthropic", /sk-ant-[0-9A-Za-z_-]{20,}/u],
  ["clé OpenAI", /sk-(?:proj-)?[0-9A-Za-z]{30,}/u],
  ["clé AWS", /AKIA[0-9A-Z]{16}/u],
  ["JWT", /eyJ[0-9A-Za-z_-]{10,}\.eyJ[0-9A-Za-z_-]{5,}/u],
  ["clé privée PEM", /-----BEGIN [A-Z ]*PRIVATE KEY-----/u],
];

function trackedTextFiles(): string[] {
  const out = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" });
  return out.split("\0").filter((f) => f && !/\.(onnx|wasm|png|jpg|gif|ico|woff2?)$/u.test(f));
}

describe("aucun secret en clair dans le dépôt", () => {
  it("aucune chaîne en forme de jeton ou de clé dans les fichiers suivis", () => {
    const hits: string[] = [];
    for (const file of trackedTextFiles()) {
      if (file === "packs/_tools/no-secrets.test.ts") continue;
      let content: string;
      try {
        content = readFileSync(join(ROOT, file), "utf8");
      } catch {
        continue;
      }
      for (const [label, rx] of SECRET_SHAPES) {
        if (rx.test(content)) hits.push(`${file} : ${label}`);
      }
    }
    expect(
      hits,
      "Écrire le premier caractère sous forme d'échappement \\uXXXX (voir l'en-tête de ce test).",
    ).toEqual([]);
  });
});
