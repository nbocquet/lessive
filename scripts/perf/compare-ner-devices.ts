/** Essai local CPU/WebGPU q8 : aucun téléchargement, texte synthétique uniquement. */
import { env, LogLevel } from "@huggingface/transformers";
import { listSupportedBackends } from "onnxruntime-node";
import { resolve } from "node:path";
import { createModelFileSource } from "../../src/cli/ner.ts";
import { TransformersNerEngine } from "../../src/ner/transformers-engine.ts";

const device = process.argv[2];
if (device !== "cpu" && device !== "webgpu") {
  throw new Error("Usage : node scripts/perf/compare-ner-devices.ts cpu|webgpu [dossier]");
}
env.allowRemoteModels = false;
env.useFS = false;
env.useFSCache = false;
env.useBrowserCache = false;
env.logLevel = LogLevel.NONE;
env.fetch = () => Promise.resolve(new Response(null, { status: 404 }));
globalThis.fetch = () => Promise.reject(new Error("NETWORK_FORBIDDEN"));

const engine = new TransformersNerEngine({
  modelFiles: await createModelFileSource(
    resolve(process.argv[3] ?? "models/Xenova/camembert-ner"),
  ),
  device,
  dtype: "q8",
});
let phase = "LOAD";
const start = performance.now();
try {
  await engine.load();
  const loadMs = performance.now() - start;
  phase = "RECOGNIZE";
  let id = 0;
  const context = () => ({ nextId: () => `d${++id}` });
  const first = performance.now();
  const detections = await engine.recognize("Le docteur Lorian Valtorin arrive.", context());
  const firstInferenceMs = performance.now() - first;
  if (!detections.some((d) => d.entityType === "PERSON")) throw new Error("PERSON_NOT_FOUND");
  const prefix = "event probe@example.org ";
  const line = prefix + "x".repeat(999 - prefix.length);
  // Même ligne (sans LF) que measure-cli.ts. Une première inférence sert d'échauffement.
  await engine.recognize(line, context());
  const lines = 20;
  const millisecondsPerLineByRound: number[] = [];
  for (let round = 0; round < 3; round++) {
    const measured = performance.now();
    for (let i = 0; i < lines; i++) await engine.recognize(line, context());
    millisecondsPerLineByRound.push((performance.now() - measured) / lines);
  }
  const medianMillisecondsPerLine = [...millisecondsPerLineByRound].sort((a, b) => a - b)[1];
  process.stdout.write(
    JSON.stringify(
      {
        node: process.version,
        device,
        dtype: "q8",
        backends: listSupportedBackends(),
        loadMs,
        firstInferenceMs,
        personDetected: true,
        lines,
        lineBytesIncludingLF: 1000,
        millisecondsPerLineByRound,
        medianMillisecondsPerLine,
        maxRssKiB: process.resourceUsage().maxRSS,
      },
      null,
      2,
    ) + "\n",
  );
} catch (error) {
  // Essai de développement sur données synthétiques ; la cause permet d'identifier un opérateur incompatible.
  process.stderr.write(
    JSON.stringify({ device, phase, error: error instanceof Error ? error.message : "UNKNOWN" }) +
      "\n",
  );
  process.exitCode = 1;
} finally {
  await engine.dispose();
}
