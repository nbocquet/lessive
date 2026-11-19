/**
 * Petit client Chrome DevTools Protocol, sans dépendance (WebSocket natif de Node).
 * Sert uniquement aux tests e2e : lancement de Chrome headless, envoi de commandes, événements.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

type Params = Record<string, unknown>;
export type CdpEvent = { method: string; params: Params; sessionId?: string };
type Pending = { resolve: (v: Params) => void; reject: (e: Error) => void; method: string };

export class Cdp {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Set<(e: CdpEvent) => void>();

  private readonly ws: WebSocket;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener("message", (msg) => {
      const data = JSON.parse(String(msg.data)) as Params & { id?: number; sessionId?: string };
      if (typeof data["id"] === "number") {
        const p = this.pending.get(data["id"]);
        if (!p) return;
        this.pending.delete(data["id"]);
        const error = data["error"] as { message?: string } | undefined;
        if (error) p.reject(new Error(`${p.method} : ${error.message ?? "erreur CDP"}`));
        else p.resolve((data["result"] as Params | undefined) ?? {});
      } else {
        const event: CdpEvent = {
          method: String(data["method"]),
          params: (data["params"] as Params | undefined) ?? {},
        };
        if (data.sessionId) event.sessionId = data.sessionId;
        for (const l of this.listeners) l(event);
      }
    });
    ws.addEventListener("close", () => {
      for (const p of this.pending.values()) p.reject(new Error(`${p.method} : connexion fermée`));
      this.pending.clear();
    });
  }

  static async connect(url: string): Promise<Cdp> {
    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("error", () => reject(new Error("WebSocket DevTools inaccessible")), {
        once: true,
      });
    });
    return new Cdp(ws);
  }

  send(method: string, params: Params = {}, sessionId?: string): Promise<Params> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  on(listener: (e: CdpEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.ws.close();
  }
}

/** Cherche un Chrome/Chromium : CHROME_PATH, emplacements usuels (Linux, macOS), cache « Chrome for Testing ». */
export function findChrome(): string | undefined {
  const fromEnv = process.env["CHROME_PATH"];
  if (fromEnv) return existsSync(fromEnv) ? fromEnv : undefined;
  const fixed = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  for (const path of fixed) if (existsSync(path)) return path;
  // ~/.cache/puppeteer/chrome/<version>/chrome-linux64/chrome et équivalents.
  const roots = [join(homedir(), ".cache", "puppeteer", "chrome")];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const v of readdirSync(root).sort().reverse()) {
      for (const sub of [
        "chrome-linux64/chrome",
        "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
      ]) {
        const p = join(root, v, sub);
        if (existsSync(p)) return p;
      }
    }
  }
  return undefined;
}

export interface ChromeProcess {
  browser: Cdp;
  close(): Promise<void>;
}

/** Lance Chrome headless avec un profil neuf et jetable, et se connecte au protocole DevTools. */
export async function launchChrome(executable: string): Promise<ChromeProcess> {
  const profile = mkdtempSync(join(tmpdir(), "lessive-e2e-"));
  const args = [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-sync",
    "--disable-component-update",
    "--disable-background-networking",
    "--disable-default-apps",
    "--metrics-recording-only",
    "--mute-audio",
    "about:blank",
  ];
  if (typeof process.getuid === "function" && process.getuid() === 0) args.unshift("--no-sandbox");
  const child: ChildProcess = spawn(executable, args, { stdio: "ignore" });
  const exited = new Promise<never>((_, reject) =>
    child.once("exit", (code) => reject(new Error(`Chrome s'est arrêté (code ${code})`))),
  );
  const portFile = join(profile, "DevToolsActivePort");
  const wsUrl = await Promise.race([
    (async () => {
      for (let i = 0; i < 200; i++) {
        if (existsSync(portFile)) {
          const [port, path] = readFileSync(portFile, "utf8").trim().split("\n");
          if (port && path) return `ws://127.0.0.1:${port}${path}`;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error("Chrome n'a pas ouvert le port DevTools");
    })(),
    exited,
  ]);
  exited.catch(() => undefined);
  const browser = await Cdp.connect(wsUrl);
  return {
    browser,
    async close() {
      browser.close();
      child.kill("SIGKILL");
      await new Promise((r) => setTimeout(r, 200));
      rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
    },
  };
}
