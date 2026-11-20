/** Compilation dédiée et copie des seules données de packs nécessaires au CLI. */
import { chmod, copyFile, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const output = new URL("dist-cli/", root);
await rm(output, { recursive: true, force: true });
const compiled = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL("node_modules/typescript/bin/tsc", root)),
    "--project",
    fileURLToPath(new URL("tsconfig.cli.json", root)),
  ],
  { cwd: fileURLToPath(root), stdio: "inherit" },
);
if (compiled.error || compiled.status !== 0) process.exit(1);
const packs = new URL("packs/", root);
for (const entry of await readdir(packs, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
  const source = new URL(`${entry.name}/`, packs);
  const target = new URL(`packs/${entry.name}/`, output);
  const manifest = JSON.parse(await readFile(new URL("manifest.json", source), "utf8")) as {
    rules: string[];
  };
  for (const file of ["manifest.json", ...manifest.rules]) {
    const destination = new URL(file, target);
    await mkdir(new URL("./", destination), { recursive: true });
    await copyFile(new URL(file, source), destination);
  }
}
await chmod(new URL("src/cli/main.js", output), 0o755);
