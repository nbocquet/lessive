/** Sortie séquentielle et publication sans remplacement du fichier final. */
import { randomUUID } from "node:crypto";
import { lstat, open, link, unlink } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Writable } from "node:stream";

export interface Output {
  write(text: string): Promise<void>;
  commit(): Promise<void>;
  cleanup(): Promise<void>;
}

export async function createFileOutput(destination: string): Promise<Output> {
  const target = resolve(destination);
  try {
    await lstat(target);
    throw new Error("OUTPUT_EXISTS");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const temporary = join(dirname(target), `.lessive-${randomUUID()}.tmp`);
  let handle: FileHandle | undefined = await open(temporary, "wx", 0o600);
  return {
    async write(text) {
      if (!handle) throw new Error("OUTPUT_CLOSED");
      await handle.writeFile(text, "utf8");
    },
    async commit() {
      if (!handle) throw new Error("OUTPUT_CLOSED");
      await handle.close();
      handle = undefined;
      // link échoue si la destination apparaît pendant le traitement. Aucun repli écrasant.
      await link(temporary, target);
      await unlink(temporary);
    },
    async cleanup() {
      try {
        await handle?.close();
      } finally {
        handle = undefined;
        await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
      }
    },
  };
}

// Un seul gardien par flux, y compris pour les erreurs émises après un callback.
const streamFailures = new WeakMap<Writable, { error?: Error }>();

/** Attendre chaque callback borne aussi les écritures lorsque le consommateur est lent. */
export function streamOutput(stream: Writable, signal?: AbortSignal): Output {
  let failure = streamFailures.get(stream);
  if (!failure) {
    const state: { error?: Error } = {};
    streamFailures.set(stream, state);
    stream.on("error", (error: Error) => {
      state.error = error;
    });
    failure = state;
  }
  const interrupt = () => stream.destroy(new Error("INTERRUPTED"));
  signal?.addEventListener("abort", interrupt, { once: true });
  return {
    async write(text) {
      if (signal?.aborted) throw new Error("INTERRUPTED");
      if (failure.error) throw failure.error;
      await new Promise<void>((resolve, reject) => {
        const finish = (error?: Error | null) => {
          stream.removeListener("error", fail);
          signal?.removeEventListener("abort", abort);
          if (error) reject(error);
          else resolve();
        };
        const fail = (error: Error) => finish(error);
        const abort = () => finish(new Error("INTERRUPTED"));
        stream.once("error", fail);
        signal?.addEventListener("abort", abort, { once: true });
        stream.write(text, "utf8", finish);
      });
    },
    async commit() {
      if (failure.error) throw failure.error;
    },
    // Garder le gestionnaire jusqu'à la sortie du processus : une erreur peut suivre le callback.
    async cleanup() {
      signal?.removeEventListener("abort", interrupt);
    },
  };
}
