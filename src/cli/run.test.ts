import { Readable, Writable } from "node:stream";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AnalysisContext, Detection, NerEngine } from "../core/types/index.ts";
import { run } from "./run.ts";

function capture() {
  const chunks: Buffer[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  return { stream, text: () => Buffer.concat(chunks).toString("utf8") };
}

function fakeNer(recognize: NerEngine["recognize"] = async () => []) {
  return {
    load: vi.fn(async () => undefined),
    recognize: vi.fn(recognize),
    dispose: vi.fn(async () => undefined),
  } satisfies NerEngine;
}

function person(text: string, context: AnalysisContext): Detection[] {
  return [
    {
      id: context.nextId(),
      start: 0,
      end: text.length,
      entityType: "PERSON",
      score: 1,
      recognizerId: "test/ner",
      packId: "test",
      source: "ner",
      explanation: [],
    },
  ];
}

describe("run avec moteur injecté", () => {
  it("charge une seule fois, masque chaque ligne puis libère le moteur", async () => {
    const engine = fakeNer(async (text, context) => person(text, context));
    const loadNer = vi.fn(async () => engine);
    const stdout = capture();
    const stderr = capture();
    const code = await run(["--ner", "modele-local"], {
      stdin: Readable.from([Buffer.from("Zorvane\r\nKelvane")]),
      stdout: stdout.stream,
      stderr: stderr.stream,
      loadNer,
    });
    expect(code).toBe(0);
    expect(stdout.text()).toBe("[PERSONNE]\r\n[PERSONNE]");
    expect(stderr.text()).toBe("");
    expect(loadNer).toHaveBeenCalledExactlyOnceWith("modele-local");
    expect(engine.recognize).toHaveBeenCalledTimes(2);
    expect(engine.dispose).toHaveBeenCalledOnce();
  });

  it("interrompt avant d'émettre une ligne dont la reconnaissance a échoué", async () => {
    const engine = fakeNer(async (text, context) => {
      if (text === "SOURCE_SYNTHETIQUE") throw new Error("BIBLIOTHEQUE SOURCE_SYNTHETIQUE");
      return person(text, context);
    });
    const stdout = capture();
    const stderr = capture();
    const code = await run(["--ner", "modele-local"], {
      stdin: Readable.from([Buffer.from("Zorvane\nKelvane\nSOURCE_SYNTHETIQUE\nJamais\n")]),
      stdout: stdout.stream,
      stderr: stderr.stream,
      loadNer: async () => engine,
    });
    expect(code).toBe(1);
    expect(stdout.text()).toBe("[PERSONNE]\n[PERSONNE]\n");
    expect(stderr.text()).toBe("Échec du traitement (ANALYSE). Ligne 3.\n");
    expect(stderr.text()).not.toMatch(/SOURCE_SYNTHETIQUE|BIBLIOTHEQUE|Error|at /);
    expect(engine.recognize).toHaveBeenCalledTimes(3);
    expect(engine.dispose).toHaveBeenCalledOnce();
  });

  it("refuse un échec de chargement avant de lire l'entrée avec un diagnostic contrôlé", async () => {
    let reads = 0;
    const stdin = new Readable({
      read() {
        reads++;
        this.push(null);
      },
    });
    const stdout = capture();
    const stderr = capture();
    expect(
      await run(["--ner", "modele-local"], {
        stdin,
        stdout: stdout.stream,
        stderr: stderr.stream,
        loadNer: async () => {
          throw new Error("CHEMIN_SYNTHETIQUE /detail/prive");
        },
      }),
    ).toBe(1);
    expect(reads).toBe(0);
    expect(stdout.text()).toBe("");
    expect(stderr.text()).toBe(
      "Échec du traitement (MODELE). Vérifiez les fichiers du modèle local et la disponibilité du runtime CPU q8.\n",
    );
  });

  it("signale aussi un échec de libération sans recopier le message brut", async () => {
    const engine = fakeNer();
    engine.dispose.mockRejectedValue(new Error("SOURCE_SYNTHETIQUE"));
    const stdout = capture();
    const stderr = capture();
    expect(
      await run(["--ner", "modele-local"], {
        stdin: Readable.from([]),
        stdout: stdout.stream,
        stderr: stderr.stream,
        loadNer: async () => engine,
      }),
    ).toBe(1);
    expect(stderr.text()).toBe("Échec du traitement (LIBERATION_MODELE).\n");
  });

  it("borne la lecture pendant qu'un consommateur bloque la première écriture", async () => {
    let reads = 0;
    const stdin = new Readable({
      highWaterMark: 1,
      read() {
        if (reads === 100) this.push(null);
        else {
          reads++;
          this.push(Buffer.from("texte\n"));
        }
      },
    });
    let unblock: (() => void) | undefined;
    let notifyFirstWrite: () => void = () => undefined;
    const firstWrite = new Promise<void>((resolve) => {
      notifyFirstWrite = resolve;
    });
    let blocked = true;
    const stdout = new Writable({
      highWaterMark: 1,
      write(_chunk, _encoding, callback) {
        if (blocked) {
          unblock = callback;
          notifyFirstWrite();
        } else callback();
      },
    });
    const stderr = capture();
    const engine = fakeNer();
    const running = run(["--ner", "modele-local"], {
      stdin,
      stdout,
      stderr: stderr.stream,
      loadNer: async () => engine,
    });
    await firstWrite;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(reads).toBeLessThanOrEqual(2);
    expect(engine.recognize).toHaveBeenCalledOnce();
    blocked = false;
    unblock!();
    expect(await running).toBe(0);
    expect(reads).toBe(100);
    expect(engine.recognize).toHaveBeenCalledTimes(100);
    expect(engine.dispose).toHaveBeenCalledOnce();
  });

  it("termine avec le code 1 sur EPIPE et libère le moteur", async () => {
    const engine = fakeNer();
    const stderr = capture();
    const stdout = new Writable({
      write(_chunk, _encoding, callback) {
        callback(Object.assign(new Error("SORTIE_SYNTHETIQUE"), { code: "EPIPE" }));
      },
    });
    expect(
      await run(["--ner", "modele-local"], {
        stdin: Readable.from([Buffer.from("texte\nsuivant\n")]),
        stdout,
        stderr: stderr.stream,
        loadNer: async () => engine,
      }),
    ).toBe(1);
    expect(stderr.text()).toBe("Échec du traitement (ECRITURE).\n");
    expect(engine.recognize).toHaveBeenCalledOnce();
    expect(engine.dispose).toHaveBeenCalledOnce();
  });

  it("interrompt une écriture bloquée sans attendre son callback et libère le moteur", async () => {
    const controller = new AbortController();
    const engine = fakeNer();
    const stderr = capture();
    let notifyWrite: () => void = () => undefined;
    const firstWrite = new Promise<void>((resolve) => {
      notifyWrite = resolve;
    });
    const stdout = new Writable({
      write() {
        // Le consommateur ne rend jamais la main : seul SIGINT doit débloquer run.
        notifyWrite();
      },
    });
    const running = run(["--ner", "modele-local"], {
      stdin: Readable.from([Buffer.from("texte\nsuivant\n")]),
      stdout,
      stderr: stderr.stream,
      signal: controller.signal,
      loadNer: async () => engine,
    });
    await firstWrite;
    controller.abort();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const status = await Promise.race([
        running,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("Interruption bloquée")), 1000);
        }),
      ]);
      expect(status).toBe(130);
      expect(stderr.text()).toBe("Traitement interrompu.\n");
      expect(engine.recognize).toHaveBeenCalledOnce();
      expect(engine.dispose).toHaveBeenCalledOnce();
    } finally {
      clearTimeout(timer);
    }
  });

  it("ne publie aucun fichier si la libération du modèle échoue", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lessive-cli-dispose-"));
    try {
      const engine = fakeNer();
      engine.dispose.mockRejectedValue(new Error("SOURCE_SYNTHETIQUE"));
      const stdout = capture();
      const stderr = capture();
      expect(
        await run(["--ner", "modele-local", "--output", join(directory, "resultat.txt")], {
          stdin: Readable.from([Buffer.from("essai@example.org\n")]),
          stdout: stdout.stream,
          stderr: stderr.stream,
          loadNer: async () => engine,
        }),
      ).toBe(1);
      expect(await readdir(directory)).toEqual([]);
      expect(stdout.text()).toBe("");
      expect(stderr.text()).not.toContain("SOURCE_SYNTHETIQUE");
      expect(engine.dispose).toHaveBeenCalledOnce();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
