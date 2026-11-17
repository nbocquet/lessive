// S2 — Exécution automatique des essais par l'API d'un LLM (un appel isolé par essai).
//
// Usage (depuis la racine du dépôt) :
//   node spikes/tokens/run-api.mjs --provider openai    --model <modèle> [--lot court] [--dry-run]
//   node spikes/tokens/run-api.mjs --provider anthropic --model <modèle> [--lot court]
//   node spikes/tokens/run-api.mjs --provider gemini    --model <modèle> [--lot court]
//
// Options :
//   --lot <id>      lot du plan (config.mjs : court, court-B, 1, 2, 3) ; défaut : court
//   --llm <nom>     nom du dossier de réponses (défaut : le fournisseur : chatgpt, claude, gemini)
//   --dry-run       affiche le premier message et la liste des essais, n'appelle rien
//   --force         refait les essais dont la réponse existe déjà
//
// Clés lues dans l'environnement, jamais écrites ni affichées :
//   OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY
//
// Chaque essai = UNE requête sans historique, sans instruction système d'API (la consigne
// système est en tête du message, comme dans une conversation ordinaire), température par défaut
// du fournisseur. La réponse brute est écrite telle quelle dans
// spikes/tokens/reponses/<llm>/<texte>-<format>-<consigne>.txt.
// Aucun appel LLM n'est fait par l'application Lessive : ce script ne sert qu'à l'expérience S2.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LOTS, buildPrompt, trialKey } from "./config.mjs";
import { ROOT } from "./corpus.mjs";

const PROVIDERS = {
  openai: { env: "OPENAI_API_KEY", folder: "chatgpt" },
  anthropic: { env: "ANTHROPIC_API_KEY", folder: "claude" },
  gemini: { env: "GEMINI_API_KEY", folder: "gemini" },
};

function parseArgs(argv) {
  const o = { lot: "court", dryRun: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = () => {
      const x = argv[++i];
      if (x === undefined) throw new Error(`Valeur manquante après ${a}`);
      return x;
    };
    if (a === "--provider") o.provider = v();
    else if (a === "--model") o.model = v();
    else if (a === "--lot") o.lot = v();
    else if (a === "--llm") o.llm = v();
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--force") o.force = true;
    else throw new Error(`Option inconnue : ${a}`);
  }
  if (!PROVIDERS[o.provider]) throw new Error("--provider doit valoir openai, anthropic ou gemini.");
  if (!o.model && !o.dryRun) throw new Error("--model est obligatoire (nom exact du modèle).");
  if (!LOTS[o.lot]) throw new Error(`Lot inconnu : ${o.lot} (${Object.keys(LOTS).join(", ")}).`);
  o.llm ??= PROVIDERS[o.provider].folder;
  if (!/^[a-z0-9-]+$/.test(o.llm)) throw new Error("--llm : minuscules, chiffres et tirets.");
  return o;
}

async function call(provider, model, key, prompt) {
  const json = async (res) => {
    const body = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} : ${body.slice(0, 300)}`);
    return JSON.parse(body);
  };
  if (provider === "openai") {
    const r = await json(
      await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
      }),
    );
    return r.choices?.[0]?.message?.content ?? "";
  }
  if (provider === "anthropic") {
    const r = await json(
      await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({ model, max_tokens: 4096, messages: [{ role: "user", content: prompt }] }),
      }),
    );
    return (r.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
  }
  const r = await json(
    await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
      },
    ),
  );
  return (r.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const lot = LOTS[o.lot];
  const outDir = join(ROOT, "reponses", o.llm);
  const textOf = (t) => readFileSync(join(ROOT, "textes", `${t.texte}.${t.format}.txt`), "utf8");

  console.log(`${lot.label}\nRéponses : ${outDir}`);
  if (o.dryRun) {
    const first = lot.trials[0];
    console.log(`\n--- Message de l'essai ${trialKey(first)} ---\n${buildPrompt(first, textOf(first))}\n---`);
    for (const t of lot.trials) console.log(`  ${trialKey(t)}`);
    return;
  }

  const key = process.env[PROVIDERS[o.provider].env];
  if (!key) throw new Error(`Variable d'environnement ${PROVIDERS[o.provider].env} absente.`);
  mkdirSync(outDir, { recursive: true });
  const modelFile = join(outDir, "_modele.txt");
  if (!existsSync(modelFile)) {
    writeFileSync(
      modelFile,
      `Fournisseur : ${o.provider}\nModèle : ${o.model}\nDate : ${new Date().toISOString()}\nExécution : API, un appel isolé par essai (run-api.mjs)\n`,
    );
  }

  let done = 0;
  for (const t of lot.trials) {
    const file = join(outDir, `${trialKey(t)}.txt`);
    if (existsSync(file) && !o.force) {
      console.log(`  déjà fait : ${trialKey(t)}`);
      continue;
    }
    try {
      const answer = await call(o.provider, o.model, key, buildPrompt(t, textOf(t)));
      writeFileSync(file, answer);
      done++;
      console.log(`  ok : ${trialKey(t)}`);
    } catch (err) {
      console.error(`  échec : ${trialKey(t)} : ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`\n${done} réponse(s) écrite(s). Ensuite : node spikes/tokens/score.mjs`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
