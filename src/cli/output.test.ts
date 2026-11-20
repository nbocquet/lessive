import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, readdir, writeFile, symlink, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { createFileOutput, streamOutput } from "./output.ts";

describe("sortie CLI", () => {
  it("publie avec permissions privées et refuse une collision tardive", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lessive-output-"));
    try {
      const target = join(dir, "result");
      const output = await createFileOutput(target);
      await output.write("[EMAIL]\n");
      expect((await stat(join(dir, (await readdir(dir))[0]!))).mode & 0o777).toBe(0o600);
      await writeFile(target, "concurrent");
      await expect(output.commit()).rejects.toThrow();
      await output.cleanup();
      expect(await readdir(dir)).toEqual(["result"]);
      expect(await readFile(target, "utf8")).toBe("concurrent");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("refuse aussi les liens symboliques pendants", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lessive-output-"));
    try {
      const target = join(dir, "result");
      await symlink(join(dir, "absent"), target);
      await expect(createFileOutput(target)).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("attend le consommateur et contrôle les erreurs de sortie", async () => {
    let finish: (() => void) | undefined;
    const stream = new Writable({
      write(_chunk, _encoding, callback) {
        finish = callback;
      },
    });
    const output = streamOutput(stream);
    let done = false;
    const pending = output.write("résultat").then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    finish!();
    await pending;
    stream.destroy(new Error("synthetic"));
    await new Promise((resolve) => setImmediate(resolve));
    await expect(output.write("suite")).rejects.toThrow();
  });
});
