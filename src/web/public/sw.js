/**
 * Service worker de Lessive (T6.2), écrit à la main : aucune bibliothèque.
 *
 * Rôle : rendre l'application utilisable hors ligne. Il ne met en cache que les fichiers statiques de
 * l'application, listés dans le manifeste que `scripts/vite-plugin-service-worker.ts` injecte au build.
 *
 * Garde-fous (R1, R5) :
 * - jamais autre chose qu'un GET de même origine vers une URL du manifeste n'est mis en cache ;
 * - tout le reste (autre origine, autre méthode, URL inconnue, requête partielle) passe au réseau
 *   sans que le service worker n'y touche : il ne voit ni ne conserve aucun texte de l'utilisateur,
 *   qui ne transite jamais par le réseau ;
 * - le service worker ne fait des requêtes qu'avec les URL du manifeste (même origine).
 *
 * Stratégies :
 * - `index.html` (et la navigation vers la racine) : réseau d'abord, cache en secours hors ligne ;
 * - autres fichiers (nom versionné par un condensat, ou fichiers lourds) : cache d'abord.
 *
 * Caches :
 * - `lessive-app-<version>` : index.html et assets, mis en cache à l'installation ;
 * - `lessive-data-<version>` : WASM d'ONNX Runtime (~26 Mo), mis en cache en arrière-plan quand la page
 *   le demande, après son premier chargement. Une nouvelle version de l'application garde ce cache
 *   tant que ces fichiers n'ont pas changé.
 * - Le modèle NER n'est jamais livré ni mis en cache ici : l'application le range elle-même dans
 *   `lessive-models-v1`, que le service worker ne lit ni ne supprime.
 * - À l'activation, seuls les caches `lessive-app-*` et `lessive-data-*` d'une autre version sont supprimés.
 *
 * Messages (page -> service worker) : `{ type: "precache-data" }` lance la mise en cache des fichiers
 * lourds ; `{ type: "get-state" }` demande l'état. Réponses (service worker -> pages) :
 * `{ type: "lessive-offline", phase, cached, total }`, sans aucune donnée utilisateur.
 */
"use strict";

// Remplacé au build par l'objet { version, dataVersion, entries: [{ url, group, size }] }.
const MANIFEST = "__LESSIVE_MANIFEST__";

// Préfixes propres au service worker : « lessive-models-* » (modèle NER, écrit par l'application)
// ne doit jamais être touché.
const APP_PREFIX = "lessive-app-";
const DATA_PREFIX = "lessive-data-";
const SCOPE = self.registration.scope;
const ORIGIN = new URL(SCOPE).origin;
const valid = typeof MANIFEST === "object" && MANIFEST !== null;

const APP_CACHE = valid ? `${APP_PREFIX}${MANIFEST.version}` : "";
const DATA_CACHE = valid ? `${DATA_PREFIX}${MANIFEST.dataVersion}` : "";
const INDEX_HREF = new URL("index.html", SCOPE).href;

/** Entrées du manifeste, avec leur URL absolue. */
const entries = valid
  ? MANIFEST.entries.map((e) => ({ ...e, href: new URL(e.url, SCOPE).href }))
  : [];
const byHref = new Map(entries.map((e) => [e.href, e]));

/** Téléchargements de fichiers lourds en cours : évite de télécharger deux fois le même fichier. */
const inflight = new Map();
let lastError = false;
let caching = false;

const cacheNameOf = (entry) => (entry.group === "data" ? DATA_CACHE : APP_CACHE);

/** Seul un GET de même origine, complet, vers une URL du manifeste est géré ; sinon `undefined`. */
function entryFor(request) {
  if (request.method !== "GET" || request.headers.has("range")) return undefined;
  const url = new URL(request.url);
  if (url.origin !== ORIGIN) return undefined;
  if (request.mode === "navigate") {
    url.search = "";
    url.hash = "";
    if (url.href === SCOPE) return byHref.get(INDEX_HREF);
    return byHref.get(url.href) === byHref.get(INDEX_HREF) ? byHref.get(INDEX_HREF) : undefined;
  }
  url.hash = "";
  return byHref.get(url.href);
}

/** Une réponse n'est conservée que si elle est complète et sans redirection. */
const cacheable = (response) =>
  response.ok && response.status === 200 && response.type === "basic" && !response.redirected;

async function isCached(entry) {
  const cache = await caches.open(cacheNameOf(entry));
  return (await cache.match(entry.href)) !== undefined;
}

async function countCached() {
  let cached = 0;
  for (const entry of entries) if (await isCached(entry)) cached += 1;
  return cached;
}

async function currentState() {
  const cached = await countCached();
  const total = entries.length;
  const phase = cached === total ? "ready" : lastError ? "error" : caching ? "caching" : "partial";
  return { type: "lessive-offline", phase, cached, total };
}

async function broadcast(onlyTo) {
  const state = await currentState();
  if (onlyTo) {
    onlyTo.postMessage(state);
    return;
  }
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  for (const client of clients) client.postMessage(state);
}

/** Télécharge un fichier du manifeste et le range dans son cache. Rejette en cas d'échec. */
async function download(entry) {
  const response = await fetch(entry.href, { cache: "reload", credentials: "omit" });
  if (!cacheable(response)) throw new Error(`Réponse inattendue (${response.status})`);
  const cache = await caches.open(cacheNameOf(entry));
  await cache.put(entry.href, response);
}

self.addEventListener("install", (event) => {
  if (!valid) return;
  // Tout ou rien : si un fichier manque, l'installation échoue et l'ancienne version reste active.
  event.waitUntil(
    Promise.all(entries.filter((e) => e.group === "app").map((e) => download(e))).then(
      () => undefined,
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([APP_CACHE, DATA_CACHE]);
      for (const name of await caches.keys()) {
        if ((name.startsWith(APP_PREFIX) || name.startsWith(DATA_PREFIX)) && !keep.has(name))
          await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(event, entry) {
  const pending = inflight.get(entry.href);
  if (pending) await pending.catch(() => undefined);
  const cache = await caches.open(cacheNameOf(entry));
  const hit = await cache.match(entry.href);
  if (hit) return hit;
  const response = await fetch(event.request);
  if (cacheable(response)) {
    event.waitUntil(cache.put(entry.href, response.clone()).catch(() => undefined));
  }
  return response;
}

async function networkFirst(event, entry) {
  const cache = await caches.open(cacheNameOf(entry));
  try {
    const response = await fetch(event.request);
    if (cacheable(response)) {
      event.waitUntil(cache.put(entry.href, response.clone()).catch(() => undefined));
      return response;
    }
    const fallback = await cache.match(entry.href);
    return fallback ?? response;
  } catch (error) {
    const fallback = await cache.match(entry.href);
    if (fallback) return fallback;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const entry = entryFor(event.request);
  if (!entry) return;
  event.respondWith(
    entry.href === INDEX_HREF ? networkFirst(event, entry) : cacheFirst(event, entry),
  );
});

/** Met en cache, un fichier à la fois, les fichiers lourds pas encore présents. */
async function precacheData() {
  if (caching) return;
  caching = true;
  lastError = false;
  try {
    await broadcast();
    for (const entry of entries.filter((e) => e.group === "data")) {
      if (await isCached(entry)) continue;
      const job = download(entry);
      inflight.set(entry.href, job);
      try {
        await job;
      } catch {
        // Réseau coupé, quota dépassé… : on continue avec les autres, l'état dira « error ».
        lastError = true;
      } finally {
        inflight.delete(entry.href);
      }
      await broadcast();
    }
  } finally {
    caching = false;
    await broadcast();
  }
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!valid || typeof data !== "object" || data === null) return;
  if (data.type === "precache-data") event.waitUntil(precacheData());
  else if (data.type === "get-state") event.waitUntil(broadcast(event.source ?? undefined));
});
