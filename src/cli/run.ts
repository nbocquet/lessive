import { constants } from "node:fs";
import { open } from "node:fs/promises";
import type { Readable, Writable } from "node:stream";
import { createAnalyzer } from "../core/analyzer/index.ts";
import { transform } from "../core/transform/index.ts";
import type { NerEngine } from "../core/types/index.ts";
import { parseArgs, ArgumentError, HELP } from "./args.ts";
import { readLines, LineError } from "./lines.ts";
import { createFileOutput, streamOutput } from "./output.ts";
import type { Output } from "./output.ts";
import { loadRules } from "./packs.ts";
import { ENGINE_VERSION } from "../core/index.ts";

interface RunOptions {
  stdin: Readable;
  stdout: Writable;
  stderr: Writable;
  signal?: AbortSignal;
  loadNer?: (directory: string) => Promise<NerEngine>;
}

/** Diagnostics contrôlés : aucune exception d'une bibliothèque n'est recopiée. */
export async function run(argv: string[], io: RunOptions): Promise<number> {
  let output: Output | undefined;
  let input: Readable | undefined;
  let ner: NerEngine | undefined;
  let status = 0;
  let phase = "INITIALISATION";
  let lineNumber: number | undefined;
  const checkAbort = () => {
    if (io.signal?.aborted) throw new Error("INTERRUPTED");
  };
  const interrupt = () => {
    input?.destroy(new Error("INTERRUPTED"));
  };
  const diagnostic = async (message: string) => {
    try {
      await streamOutput(io.stderr).write(`${message}\n`);
    } catch {
      /* stderr fermé */
    }
  };
  io.signal?.addEventListener("abort", interrupt);
  try {
    const args = parseArgs(argv);
    if (args.help || args.version) {
      output = streamOutput(io.stdout, io.signal);
      await output.write(args.help ? HELP : `${ENGINE_VERSION}\n`);
      await output.commit();
      checkAbort();
    } else {
      checkAbort();
      phase = "SORTIE";
      output = args.output
        ? await createFileOutput(args.output)
        : streamOutput(io.stdout, io.signal);
      phase = "PACKS";
      const analyzer = createAnalyzer(await loadRules(args.maskDates));
      if (args.ner) {
        phase = "MODELE";
        const { guardNer, loadNer } = await import("./ner.ts");
        ner = guardNer(await (io.loadNer ?? loadNer)(args.ner));
      } else {
        await diagnostic(
          "Attention : seules les règles sont utilisées ; des noms peuvent rester en clair.",
        );
      }
      checkAbort();
      phase = "LECTURE";
      if (args.input && args.input !== "-") {
        // Ne pas attendre un producteur si le chemin désigne un tube nommé.
        const file = await open(args.input, constants.O_RDONLY | constants.O_NONBLOCK);
        try {
          if (!(await file.stat()).isFile()) throw new Error("INPUT_NOT_FILE");
          checkAbort();
          input = file.createReadStream({ highWaterMark: 64 * 1024 });
        } catch (error) {
          await file.close();
          throw error;
        }
      } else input = io.stdin;
      for await (const line of readLines(input)) {
        checkAbort();
        lineNumber = line.lineNumber;
        phase = "ANALYSE";
        const result = await analyzer.analyze(line.text, {
          ...(args.language === "all" ? {} : { language: args.language }),
          ner,
          signal: io.signal,
        });
        if (ner && (ner as NerEngine & { failed: boolean }).failed) throw new Error("NER_FAILED");
        const masked = transform(line.text, result.detections, {
          mode: "masking",
          defaultOperator: "categorize",
        });
        checkAbort();
        phase = "ECRITURE";
        await output.write(line.bom + masked.text + line.separator);
        phase = "LECTURE";
      }
      checkAbort();
      phase = "LIBERATION_MODELE";
      const loadedNer = ner;
      ner = undefined;
      await loadedNer?.dispose();
      checkAbort();
      phase = "PUBLICATION";
      await output.commit();
      checkAbort();
    }
  } catch (error) {
    status = io.signal?.aborted ? 130 : error instanceof ArgumentError ? 2 : 1;
    const reason =
      error instanceof ArgumentError
        ? "ARGUMENTS"
        : error instanceof LineError
          ? `${error.code}, ligne ${error.lineNumber}`
          : phase;
    const detail =
      phase === "MODELE"
        ? " Vérifiez les fichiers du modèle local et la disponibilité du runtime CPU q8."
        : phase === "SORTIE" || phase === "PUBLICATION"
          ? " La destination doit être nouvelle et son dossier accessible."
          : phase === "ANALYSE" && lineNumber !== undefined
            ? ` Ligne ${lineNumber}.`
            : "";
    await diagnostic(
      status === 130 ? "Traitement interrompu." : `Échec du traitement (${reason}).${detail}`,
    );
  } finally {
    io.signal?.removeEventListener("abort", interrupt);
    input?.destroy();
    try {
      await ner?.dispose();
    } catch {
      status ||= 1;
      await diagnostic("Échec de libération du modèle.");
    }
    try {
      await output?.cleanup();
    } catch {
      status ||= 1;
      await diagnostic("Échec du nettoyage de la sortie.");
    }
  }
  return status;
}
