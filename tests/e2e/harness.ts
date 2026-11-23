/**
 * Outils communs des tests e2e (T6.1, T6.2) : session Chrome headless + serveur local, interception
 * de toutes les requêtes (page, workers, service worker), pilotage du DOM, inspection des stockages.
 * Aucune donnée réelle : le texte d'entrée est synthétique.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Cdp, findChrome, launchChrome, type CdpEvent, type ChromeProcess } from "./cdp.ts";
import { startServer, type StaticServer } from "./server.ts";

export const DIST = fileURLToPath(new URL("../../dist/", import.meta.url));

/** Texte d'entrée synthétique (valeurs de test publiques ou inventées, aucune donnée réelle). */
export const SENSITIVE = {
  name: "Zéphyrin Vandelbrouck",
  email: "zephyrin.vandelbrouck@example.org",
  iban: "CH93 0076 2011 6238 5295 7",
  avs: "756.9217.0769.85",
} as const;

export const INPUT_TEXT =
  `Bonjour, je suis ${SENSITIVE.name}. Mon courriel est ${SENSITIVE.email}, ` +
  `mon IBAN ${SENSITIVE.iban} et mon numéro AVS ${SENSITIVE.avs}. ` +
  `Merci de répondre à ${SENSITIVE.name}.`;

/** Fragments dont la présence dans un stockage révèle le texte d'entrée. Le nom est inventé et absent des
 * dictionnaires de l'application (un patronyme courant comme « Dupont » figure dans le bundle). */
export const NEEDLES = [
  "Vandelbrouck",
  "phyrin",
  "CH93",
  "0076 2011",
  "0076201162385295",
  "756.9217",
  "7569217",
  "Bonjour, je suis",
];

export function chromeOrNull(): string | null {
  return findChrome() ?? null;
}

/** Aperçu du texte à copier (colonne « Texte à copier »). */
export const RESULT_PREVIEW = '[aria-label="Aperçu du texte transformé"]';

export const SKIP_MESSAGE =
  "Aucun Chrome/Chromium trouvé : test e2e sauté. Définissez CHROME_PATH (sur macOS : " +
  '"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome") puis relancez `npm run test:e2e`.';

export function distFiles(): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
    );
  return walk(DIST).map((f) => relative(DIST, f).split(sep).join("/"));
}

const OFFLINE = { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };

interface NetRecord {
  url: string;
  target: string;
}

function isNetworkUrl(url: string): boolean {
  return /^(https?|wss?|ftp):/i.test(url);
}

export class Session {
  readonly net: NetRecord[] = [];
  readonly failed: { url: string; error: string }[] = [];
  private readonly fetchForeign: NetRecord[] = [];
  readonly attachedTypes = new Set<string>();
  private readonly sessions = new Map<string, string>();
  private offlineMode = false;
  private page = "";
  private readonly setups: Promise<void>[] = [];

  readonly chrome: ChromeProcess;
  readonly server: StaticServer;

  private constructor(chrome: ChromeProcess, server: StaticServer) {
    this.chrome = chrome;
    this.server = server;
  }

  /** Requêtes réellement parties vers une autre origine (hors celles bloquées par la CSP). */
  get foreign(): NetRecord[] {
    const urls = new Set(this.fetchForeign.map((f) => f.url));
    return [
      ...this.fetchForeign,
      ...[...this.observedForeign.values()].filter((f) => !urls.has(f.url)),
    ];
  }

  get browser(): Cdp {
    return this.chrome.browser;
  }

  get origin(): string {
    return this.server.origin;
  }

  static async start(): Promise<Session> {
    if (!existsSync(join(DIST, "index.html"))) {
      throw new Error("dist/ absent : lancez `npm run build` (ou `npm run test:e2e`).");
    }
    const exe = findChrome();
    if (!exe) throw new Error(SKIP_MESSAGE);
    const server = await startServer(DIST);
    const chrome = await launchChrome(exe);
    const s = new Session(chrome, server);
    await s.init();
    return s;
  }

  private async init(): Promise<void> {
    this.browser.on((e) => this.onEvent(e));
    await this.browser.send("Target.setAutoAttach", {
      autoAttach: true,
      waitForDebuggerOnStart: true,
      flatten: true,
    });
    const { targetId } = (await this.browser.send("Target.createTarget", {
      url: "about:blank",
    })) as {
      targetId: string;
    };
    for (let i = 0; i < 100 && !this.page; i++) {
      await Promise.all(this.setups);
      for (const [sid, type] of this.sessions) if (type === `page:${targetId}`) this.page = sid;
      if (!this.page) await new Promise((r) => setTimeout(r, 50));
    }
    if (!this.page) throw new Error("Onglet de test introuvable");
    await this.send("Page.enable");
    await this.send("Runtime.enable");
  }

  private onEvent(e: CdpEvent): void {
    const p = e.params as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- événements CDP non typés
    switch (e.method) {
      case "Target.attachedToTarget": {
        const info = p["targetInfo"] as { type: string; targetId: string };
        const sid = p["sessionId"] as string;
        this.attachedTypes.add(info.type);
        this.sessions.set(sid, info.type === "page" ? `page:${info.targetId}` : info.type);
        this.setups.push(this.setupSession(sid, info.type));
        break;
      }
      case "Target.detachedFromTarget":
        this.sessions.delete(p["sessionId"] as string);
        break;
      case "Fetch.requestPaused": {
        const url = (p["request"] as { url: string }).url;
        const target = this.targetOf(e.sessionId);
        this.net.push({ url, target });
        const requestId = p["requestId"] as string;
        if (isNetworkUrl(url) && new URL(url).origin !== this.origin) {
          this.fetchForeign.push({ url, target });
          void this.browser
            .send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }, e.sessionId)
            .catch(() => undefined);
        } else {
          void this.browser
            .send("Fetch.continueRequest", { requestId }, e.sessionId)
            .catch(() => undefined);
        }
        break;
      }
      case "Network.requestWillBeSent": {
        // Observation redondante (au cas où Fetch ne couvrirait pas un type de cible).
        const url = (p["request"] as { url: string }).url;
        const target = this.targetOf(e.sessionId);
        if (isNetworkUrl(url) && new URL(url).origin !== this.origin) {
          // Chrome signale aussi les requêtes que la CSP bloque : on les retire à l'échec « csp ».
          this.observedForeign.set(`${e.sessionId}:${p["requestId"]}`, { url, target });
        }
        break;
      }
      default:
    }
    if (e.method === "Network.requestWillBeSent") {
      this.urlById.set(`${e.sessionId}:${p["requestId"]}`, (p["request"] as { url: string }).url);
    }
    if (e.method === "Network.loadingFailed") {
      const key0 = `${e.sessionId}:${p["requestId"]}`;
      const seen = this.observedForeign.get(key0);
      if (seen && p["blockedReason"] === "csp") this.observedForeign.delete(key0);
      const key = `${e.sessionId}:${p["requestId"]}`;
      const url = this.urlById.get(key);
      if (url) this.failed.push({ url, error: String(p["errorText"] ?? "") });
    }
  }

  private readonly observedForeign = new Map<string, NetRecord>();
  private readonly urlById = new Map<string, string>();

  private targetOf(sessionId: string | undefined): string {
    const t = sessionId ? this.sessions.get(sessionId) : undefined;
    return t?.startsWith("page:") ? "page" : (t ?? "browser");
  }

  private async setupSession(sid: string, type: string): Promise<void> {
    const b = this.browser;
    // Une cible lancée avec « waitForDebuggerOnStart » ne répond à certaines commandes (Network.enable
    // d'un service worker) qu'une fois relancée : on envoie tout, puis on la relance, puis on attend.
    const pending: Promise<unknown>[] = [];
    const queue = (method: string, params: Record<string, unknown> = {}) =>
      pending.push(b.send(method, params, sid).catch(() => undefined));
    try {
      if (["page", "worker", "service_worker", "shared_worker"].includes(type)) {
        queue("Network.enable");
        queue("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
        if (this.offlineMode) queue("Network.emulateNetworkConditions", OFFLINE);
      }
      if (type === "page" || type === "worker") {
        queue("Target.setAutoAttach", {
          autoAttach: true,
          waitForDebuggerOnStart: true,
          flatten: true,
        });
      }
    } finally {
      pending.push(b.send("Runtime.runIfWaitingForDebugger", {}, sid).catch(() => undefined));
      await Promise.all(pending);
    }
  }

  private emulate(sid: string, offline: boolean): Promise<unknown> {
    return this.browser
      .send(
        "Network.emulateNetworkConditions",
        { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
        sid,
      )
      .catch(() => undefined);
  }

  /** Coupe (ou rétablit) le réseau pour la page, les workers et le service worker. */
  async setOffline(offline: boolean): Promise<void> {
    this.offlineMode = offline;
    await Promise.all([...this.sessions.keys()].map((sid) => this.emulate(sid, offline)));
  }

  /** Types de cibles dont des requêtes ont été vues (preuve que workers et SW sont bien observés). */
  observedTargets(): string[] {
    return [...new Set(this.net.map((n) => n.target))].sort();
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    return this.browser.send(method, params, this.page);
  }

  async evaluate<T>(expression: string): Promise<T> {
    const r = (await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })) as {
      result: { value: T };
      exceptionDetails?: { exception?: { description?: string }; text: string };
    };
    if (r.exceptionDetails) {
      throw new Error(
        `evaluate : ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`,
      );
    }
    return r.result.value;
  }

  async waitFor(expression: string, what: string, timeoutMs = 20_000): Promise<void> {
    const t0 = Date.now();
    let last = "";
    while (Date.now() - t0 < timeoutMs) {
      try {
        if (await this.evaluate<boolean>(`(async () => Boolean(await (${expression})))()`)) return;
      } catch (err) {
        last = (err as Error).message;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`Délai dépassé : ${what}${last ? ` (${last})` : ""}`);
  }

  async navigate(path = "/"): Promise<void> {
    await this.send("Page.navigate", { url: this.origin + path });
    await this.waitFor(
      `document.readyState === "complete" && document.querySelector("#source-text")`,
      "chargement de la page",
    );
  }

  async reload(): Promise<void> {
    await this.send("Page.reload", { ignoreCache: false });
    await new Promise((r) => setTimeout(r, 300));
    await this.waitFor(
      `document.readyState === "complete" && document.querySelector("#source-text")`,
      "rechargement de la page",
    );
  }

  /** Clique le bouton dont le texte est exactement `text` (attend qu'il soit actif). */
  async clickButton(text: string, timeoutMs = 20_000): Promise<void> {
    const find = `[...document.querySelectorAll("button")].find((b) => b.textContent.replace(/\\s+/g, " ").trim() === ${JSON.stringify(text)} && !b.disabled)`;
    await this.waitFor(find, `bouton « ${text} » actif`, timeoutMs);
    await this.evaluate(`(${find}).click()`);
  }

  /** Coche/clique un champ (radio, case) retrouvé par le texte de son libellé. */
  async clickLabelled(labelText: string): Promise<void> {
    const find = `[...document.querySelectorAll("label")].find((l) => l.textContent.includes(${JSON.stringify(labelText)}))?.querySelector("input")`;
    await this.waitFor(find, `champ « ${labelText} »`);
    await this.evaluate(`(${find}).click()`);
  }

  /** Coche ou décoche une case libellée, sans la basculer si elle est déjà dans l'état voulu. */
  async setChecked(labelText: string, checked: boolean): Promise<void> {
    const find = `[...document.querySelectorAll("label")].find((l) => l.textContent.includes(${JSON.stringify(labelText)}))?.querySelector("input")`;
    await this.waitFor(find, `case « ${labelText} »`);
    await this.evaluate(
      `(() => { const el = ${find}; if (el.checked !== ${checked}) el.click(); })()`,
    );
  }

  /** Choisit le mode de traitement dans la liste déroulante de la barre d'outils. */
  async setMode(mode: "masking" | "pseudonymization"): Promise<void> {
    const find = `document.querySelector(".compact-mode select")`;
    await this.waitFor(find, "liste du mode de traitement");
    await this.evaluate(
      `(() => { const el = ${find}; el.value = ${JSON.stringify(mode)}; el.dispatchEvent(new Event("change", { bubbles: true })); })()`,
    );
  }

  /** Saisit du texte dans un champ (focus puis insertion, comme au clavier). */
  async type(selector: string, text: string): Promise<void> {
    await this.waitFor(`document.querySelector(${JSON.stringify(selector)})`, `champ ${selector}`);
    await this.evaluate(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.focus(); el.select(); })()`,
    );
    await this.send("Input.insertText", { text });
  }

  text(selector: string): Promise<string> {
    return this.evaluate<string>(
      `document.querySelector(${JSON.stringify(selector)})?.innerText ?? ""`,
    );
  }

  /**
   * Parcours complet par l'interface, sur une seule page (#38) : saisie, analyse automatique,
   * résultat validé, réponse simulée du LLM, réidentification en direct. Renvoie le texte
   * transformé et le texte réidentifié.
   */
  async runJourney(opts: {
    ner: boolean;
  }): Promise<{ transformed: string; reidentified: string; tokens: string[] }> {
    await this.setMode("pseudonymization");
    // Le NER s'active d'office quand un modèle est chargé : on fixe l'état voulu, sans basculer.
    await this.setChecked("Reconnaître les noms", opts.ner);
    await this.type("#source-text", INPUT_TEXT);
    await this.waitForResult(opts.ner ? 180_000 : 30_000);
    await this.clickLabelled("J'ai relu le résultat");
    await this.waitFor(
      `[...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Copier le texte pour l'IA" && !b.disabled)`,
      "validation du résultat",
    );
    const transformed = await this.text(RESULT_PREVIEW);
    const tokens = [...new Set(transformed.match(/\b[A-ZÉ]+_\d{3}\b/g) ?? [])];
    await this.type(
      "#llm-response",
      `Voici la réponse simulée. Contacts : ${tokens.join(", ")}. Cordialement.`,
    );
    await this.waitFor(
      `document.querySelector("#reponse [role=status]")?.innerText.includes("retrouvé")`,
      "réidentification",
    );
    const reidentified = await this.text("#reponse");
    return { transformed, reidentified, tokens };
  }

  /**
   * Attend la fin de l'analyse automatique (lancée par la saisie) et l'aperçu du texte à copier,
   * à jour : il n'est affiché qu'une fois l'analyse terminée et le résultat recalculé.
   */
  async waitForResult(timeoutMs = 30_000): Promise<void> {
    await this.waitFor(
      `document.querySelector(${JSON.stringify(RESULT_PREVIEW)})`,
      "fin de l'analyse et aperçu du résultat",
      timeoutMs,
    );
  }

  /**
   * Inspecte localStorage, sessionStorage, IndexedDB et Cache Storage de la page. Renvoie les fragments
   * trouvés (liste vide = rien) et les URL en cache.
   */
  async inspectStorage(needles: string[]): Promise<{
    localStorage: number;
    sessionStorage: number;
    indexedDbs: string[];
    hits: string[];
    cache: { name: string; urls: string[] }[];
  }> {
    return this.evaluate(`(async () => {
      const needles = ${JSON.stringify(needles)};
      const hits = [];
      const longest = Math.max(...needles.map((n) => n.length));
      const scanString = (where, s) => { for (const n of needles) if (s.includes(n)) hits.push(where + " : " + n); };
      let ls = 0, ss = 0;
      for (const [store, name] of [[localStorage, "localStorage"], [sessionStorage, "sessionStorage"]]) {
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i);
          scanString(name + " clé", k); scanString(name, store.getItem(k) ?? "");
          name === "localStorage" ? ls++ : ss++;
        }
      }
      const dbNames = [];
      for (const info of (await indexedDB.databases?.()) ?? []) {
        dbNames.push(info.name);
        const db = await new Promise((res, rej) => { const r = indexedDB.open(info.name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
        for (const store of [...db.objectStoreNames]) {
          const rows = await new Promise((res, rej) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
          const keys = await new Promise((res, rej) => { const r = db.transaction(store).objectStore(store).getAllKeys(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
          let dump = ""; try { dump = JSON.stringify([keys, rows]); } catch { dump = String(rows); }
          scanString("IndexedDB " + info.name + "/" + store, dump);
        }
        db.close();
      }
      const cache = [];
      const latin1 = new TextDecoder("latin1");
      for (const name of await caches.keys()) {
        const c = await caches.open(name);
        const urls = [];
        for (const req of await c.keys()) {
          urls.push(req.url);
          scanString("Cache " + name + " URL", decodeURIComponent(req.url));
          const resp = await c.match(req);
          if (!resp || !resp.body) continue;
          const reader = resp.body.getReader();
          let tail = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = tail + latin1.decode(value);
            scanString("Cache " + name + " corps " + req.url, chunk);
            tail = chunk.slice(-(longest - 1));
          }
        }
        cache.push({ name, urls });
      }
      return { localStorage: ls, sessionStorage: ss, indexedDbs: dbNames, hits: [...new Set(hits)], cache };
    })()`);
  }

  async close(): Promise<void> {
    await this.chrome.close();
    await this.server.close().catch(() => undefined);
  }
}

export function sizeOf(path: string): number {
  return statSync(join(DIST, path)).size;
}
