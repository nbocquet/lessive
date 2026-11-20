#!/usr/bin/env node
import { run } from "./run.ts";

const controller = new AbortController();
process.on("SIGINT", () => controller.abort());
process.exitCode = await run(process.argv.slice(2), {
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
  signal: controller.signal,
});
