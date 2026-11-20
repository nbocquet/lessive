/**
 * Mesure le binaire compilé : node scripts/perf/measure-cli.ts [--sizes 10,100] [--line-bytes 1000] [--ner dossier].
 * Les tailles sont exprimées en Mo décimaux. Aucune donnée réelle n'est lue ou conservée.
 */
import { spawn } from "node:child_process";
import { mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { cpus, platform, release, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const args = process.argv.slice(2);
let sizeList = "10,100";
let ner: string | undefined;
let lineBytes = 1000;
for (let i = 0; i < args.length; i += 2) {
  const value = args[i + 1];
  if (!value || !["--sizes", "--ner", "--line-bytes"].includes(args[i]!)) {
    throw new Error(
      "Usage : node scripts/perf/measure-cli.ts [--sizes 10,100] [--line-bytes 1000] [--ner dossier]",
    );
  }
  if (args[i] === "--sizes") sizeList = value;
  else if (args[i] === "--line-bytes") lineBytes = Number(value);
  else ner = resolve(value);
}
const sizes = sizeList.split(",").map(Number);
if (sizes.some((size) => !Number.isFinite(size) || size < 0 || size > 10_000)) {
  throw new Error("Tailles invalides (Mo décimaux, de 0 à 10 000 inclus).");
}
if (!Number.isInteger(lineBytes) || lineBytes < 25 || lineBytes > 200_000) {
  throw new Error("Longueur de ligne invalide (25 à 200 000 octets, LF inclus).");
}
const directory = await mkdtemp(join(tmpdir(), "lessive-cli-perf-"));
const binary = fileURLToPath(new URL("../../dist-cli/src/cli/main.js", import.meta.url));
// Ligne ASCII de longueur configurable : un courriel synthétique et un remplissage sans entité.
const prefix = "event probe@example.org ";
const line = Buffer.from(prefix + "x".repeat(lineBytes - 1 - prefix.length) + "\n");
const block = Buffer.concat(Array.from({ length: 64 }, () => line));
const measurements: {
  bytes: number;
  lines: number;
  linesPerSecond: number;
  seconds: number;
  megabytesPerSecond: number;
  maxRssKiB: number;
}[] = [];
try {
  const hook = join(directory, "memory.mjs");
  await writeFile(
    hook,
    `process.on("exit", () => process.stderr.write("LESSIVE_PERF_RSS_KIB=" + process.resourceUsage().maxRSS + "\\n"));\n`,
    { mode: 0o600 },
  );
  for (const size of sizes) {
    const bytes = Math.ceil((size * 1_000_000) / line.length) * line.length;
    const input = join(directory, "input.log");
    const output = join(directory, "output.log");
    await rm(output, { force: true });
    const file = await open(input, "w", 0o600);
    try {
      for (let written = 0; written < bytes;) {
        const part = block.subarray(0, Math.min(block.length, bytes - written));
        const result = await file.write(part);
        if (result.bytesWritten !== part.length)
          throw new Error("Écriture synthétique incomplète.");
        written += result.bytesWritten;
      }
    } finally {
      await file.close();
    }
    process.stderr.write(
      `Mesure de ${bytes / 1_000_000} Mo, ${ner ? "avec NER CPU q8" : "sans NER"}…\n`,
    );
    const start = performance.now();
    const child = spawn(
      process.execPath,
      [
        "--import",
        pathToFileURL(hook).href,
        binary,
        input,
        "--output",
        output,
        ...(ner ? ["--ner", ner] : []),
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let diagnostics = "";
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      diagnostics += chunk;
    });
    await new Promise<void>((resolve, reject) => {
      child.on("error", () => reject(new Error("Impossible de lancer le binaire compilé.")));
      child.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error("Le CLI a échoué pendant la mesure.")),
      );
    });
    const seconds = (performance.now() - start) / 1000;
    const rss = /LESSIVE_PERF_RSS_KIB=(\d+)/u.exec(diagnostics);
    if (!rss) throw new Error("Mesure mémoire indisponible.");
    const measurement = {
      bytes,
      lines: bytes / line.length,
      linesPerSecond: bytes / line.length / seconds,
      seconds,
      megabytesPerSecond: bytes / 1_000_000 / seconds,
      maxRssKiB: Number(rss[1]),
    };
    measurements.push(measurement);
    process.stderr.write(
      `Terminé : ${seconds.toFixed(2)} s, ${measurement.megabytesPerSecond.toFixed(2)} Mo/s, RSS ${measurement.maxRssKiB} Kio.\n`,
    );
  }
  process.stdout.write(
    JSON.stringify(
      {
        node: process.version,
        platform: platform(),
        release: release(),
        cpu: cpus()[0]?.model,
        lineBytes: line.length,
        ner: ner ?? false,
        measurements,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
