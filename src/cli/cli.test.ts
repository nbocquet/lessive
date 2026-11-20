import { beforeAll, describe, it, expect } from "vitest";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const binary = fileURLToPath(new URL("../../dist-cli/src/cli/main.js", import.meta.url));
function execute(args: string[], input: string | Uint8Array = "", timeout = 10000) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [binary, ...args], { cwd: tmpdir(), timeout });
    let stdout = "",
      stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}
describe("binaire CLI compilé", () => {
  beforeAll(async () => {
    await promisify(execFile)(process.execPath, [
      fileURLToPath(new URL("../../scripts/build-cli.ts", import.meta.url)),
    ]);
  }, 30000);
  it("fonctionne hors du dépôt et conserve les octets de structure", async () => {
    const result = await execute([], "\ufefftest@example.org\r\n\n192.0.2.1");
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("\ufeff[EMAIL]\r\n\n[IP]");
    expect(result.stderr.match(/Attention/g)).toHaveLength(1);
  });
  it("accepte vide, aide et version sans charger le modèle", async () => {
    expect((await execute([])).stdout).toBe("");
    expect(await execute(["--version", "--ner", "/absent"])).toMatchObject({
      code: 0,
      stdout: "0.1.0\n",
      stderr: "",
    });
    expect((await execute(["--help"])).stdout).toContain("--mask-dates");
  });
  it.each([["--inconnue"], ["a", "b"], ["--language", "xx"], ["-o"]])(
    "refuse les arguments %j",
    async (...args) => {
      const result = await execute(args);
      expect(result).toMatchObject({ code: 2, stdout: "" });
      expect(result.stderr).toBe("Échec du traitement (ARGUMENTS).\n");
    },
  );
  it("les dates sont optionnelles", async () => {
    expect((await execute([], "2026-11-19")).stdout).toBe("2026-11-19");
    expect((await execute(["--mask-dates"], "2026-11-19")).stdout).toBe("[DATE]");
  });
  it("publie uniquement après succès et conserve le fichier source", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lessive-cli-"));
    try {
      const source = join(dir, "source.txt"),
        target = join(dir, "result.txt");
      await writeFile(source, "test@example.org");
      expect((await execute([source, "-o", target])).code).toBe(0);
      expect(await readFile(target, "utf8")).toBe("[EMAIL]");
      expect(await readFile(source, "utf8")).toBe("test@example.org");
      expect((await execute([source, "-o", source])).code).toBe(1);
      expect((await execute([source, "-o", target])).code).toBe(1);
      const bad = Buffer.concat([Buffer.from("test@example.org\n"), Buffer.from([0xff])]);
      const failed = join(dir, "failed.txt");
      expect((await execute(["-o", failed], bad)).code).toBe(1);
      expect((await readdir(dir)).sort()).toEqual(["result.txt", "source.txt"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("refuse une ligne trop longue et ne révèle pas son contenu", async () => {
    const marker = "DONNEE_SYNTHETIQUE_PRIVEE";
    const result = await execute([], marker + "x".repeat(200001));
    expect(result).toMatchObject({ code: 1, stdout: "" });
    expect(result.stderr).not.toContain(marker);
  });
  it("les échecs de lecture et modèle restent contrôlés", async () => {
    for (const args of [["/absent/SYNTHETIQUE"], ["--ner", "/absent/SYNTHETIQUE"]]) {
      const result = await execute(args);
      expect(result).toMatchObject({ code: 1, stdout: "" });
      expect(result.stderr).not.toContain("SYNTHETIQUE");
      expect(result.stderr).not.toContain(" at ");
    }
  });
  it.skipIf(process.platform === "win32")(
    "refuse un tube nommé sans attendre de producteur et nettoie la sortie",
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "lessive-fifo-"));
      try {
        const source = join(dir, "source");
        await promisify(execFile)("mkfifo", [source]);
        const result = await execute([source, "-o", join(dir, "result")], "", 2000);
        expect(result).toMatchObject({ code: 1, stdout: "" });
        expect(result.stderr).toContain("Échec du traitement (LECTURE).");
        expect(await readdir(dir)).toEqual(["source"]);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
  it("interrompt SIGINT sans publier et nettoie le temporaire", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lessive-interrupt-"));
    try {
      const child = spawn(process.execPath, [binary, "-o", join(dir, "result")]);
      child.stderr.once("data", () => {
        child.kill("SIGINT");
      });
      const code = await new Promise((resolve) => child.on("close", resolve));
      expect(code).toBe(130);
      expect(await readdir(dir)).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
