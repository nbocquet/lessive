/** Serveur statique minimal pour les tests e2e : sert `dist/`, 404 pour les fichiers absents. */
import { createServer, type Server } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".onnx": "application/octet-stream",
  ".txt": "text/plain; charset=utf-8",
};

export interface StaticServer {
  origin: string;
  /** Chemins demandés depuis le démarrage (ou depuis le dernier `requests.length = 0`). */
  requests: string[];
  close(): Promise<void>;
}

export async function startServer(root: string): Promise<StaticServer> {
  const base = resolve(root);
  const requests: string[] = [];
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://local");
    requests.push(url.pathname);
    let path: string;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (path.endsWith("/")) path += "index.html";
    const file = resolve(join(base, path));
    let size = -1;
    try {
      const st = statSync(file);
      if (st.isFile() && file.startsWith(base + sep)) size = st.size;
    } catch {
      // absent
    }
    if (size < 0) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Introuvable");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
      "Content-Length": size,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (typeof address !== "object" || address === null) throw new Error("Port introuvable");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((r) => {
        server.close(() => r());
        server.closeAllConnections();
      }),
  };
}
