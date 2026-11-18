// Page de mesure : tout le texte affiché passe par textContent (jamais innerHTML).
const $ = (id) => document.getElementById(id);
let worker = null;
let currentText = "";

function row(table, label, value) {
  const tr = document.createElement("tr");
  const th = document.createElement("th");
  th.textContent = label;
  const td = document.createElement("td");
  td.textContent = value;
  tr.append(th, td);
  table.append(tr);
}
const stats = {};
function setStat(key, label, value) {
  stats[key] = [label, value];
  $("stats").replaceChildren();
  for (const [l, v] of Object.values(stats)) row($("stats"), l, v);
}
const fmt = (ms) => `${ms.toFixed(0)} ms`;
const log = (m) => ($("log").textContent += m + "\n");

function checkExternal(list) {
  const own = list.filter((n) => !n.startsWith(location.origin));
  setStat("ext", "Requêtes hors origine (doit être 0)", String(own.length));
  if (own.length) log("Requêtes externes : " + own.join(", "));
}

function render(text, spans) {
  const view = $("view");
  view.replaceChildren();
  let pos = 0;
  for (const s of [...spans].sort((a, b) => a.start - b.start)) {
    if (s.start < pos) continue;
    view.append(document.createTextNode(text.slice(pos, s.start)));
    const mark = document.createElement("mark");
    mark.className = s.type;
    mark.title = `${s.type} [${s.start}, ${s.end}[`;
    mark.textContent = text.slice(s.start, s.end);
    view.append(mark);
    pos = s.end;
  }
  view.append(document.createTextNode(text.slice(pos)));
  const t = $("spans");
  t.replaceChildren();
  const head = document.createElement("tr");
  for (const h of ["Type", "Début", "Fin", "Texte à [début, fin[", "Source"]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  t.append(head);
  for (const s of spans) {
    const tr = document.createElement("tr");
    for (const v of [s.type, s.start, s.end, JSON.stringify(text.slice(s.start, s.end)), s.source]) {
      const td = document.createElement("td");
      td.textContent = String(v);
      tr.append(td);
    }
    t.append(tr);
  }
}

async function init() {
  const models = await (await fetch("/api/models")).json();
  const sel = $("model");
  for (const m of models) {
    const o = document.createElement("option");
    o.value = m.id;
    o.textContent = `${m.id}  [${m.files.join(", ")}]`;
    sel.append(o);
  }
  $("models-hint").textContent = models.length
    ? ""
    : "Aucun modèle trouvé dans models/ : voir tools/ner-eval/README.md.";
  $("load").disabled = models.length === 0;
  setStat("iso", "Isolation inter-origines (multi-thread possible)", String(window.crossOriginIsolated));
  if (performance.memory) setStat("heap", "Tas JS page (Chrome)", `${(performance.memory.usedJSHeapSize / 1e6).toFixed(0)} Mo`);
}

$("load").onclick = () => {
  worker?.terminate();
  $("run").disabled = true;
  $("run5000").disabled = true;
  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  worker.onmessage = async ({ data }) => {
    if (data.type === "loaded") {
      setStat("load", "Temps de chargement", fmt(data.loadMs));
      setStat("threads", "Threads WASM effectifs / isolé", `${data.numThreads} / ${data.isolated}`);
      checkExternal(data.external);
      $("run").disabled = false;
      $("run5000").disabled = false;
      log("Modèle chargé.");
    } else if (data.type === "result") {
      setStat("infer", "Dernière inférence (texte saisi)", `${fmt(data.ms)} (${currentText.length} car.)`);
      setStat("unloc", "Entités non localisées", String(data.unlocated));
      checkExternal(data.external);
      render(currentText, data.spans);
    } else if (data.type === "result5000") {
      const sorted = [...data.times].sort((a, b) => a - b);
      setStat("long", `Texte de ${data.chars} car. (3 essais)`, data.times.map(fmt).join(" · ") + ` — médiane ${fmt(sorted[1])}`);
      checkExternal(data.external);
    } else if (data.type === "error") {
      log("ERREUR : " + data.message);
    }
    if (performance.memory) setStat("heap", "Tas JS page (Chrome)", `${(performance.memory.usedJSHeapSize / 1e6).toFixed(0)} Mo`);
  };
  setStat("load", "Temps de chargement", "en cours…");
  worker.postMessage({
    type: "load",
    model: $("model").value,
    dtype: $("dtype").value,
    device: $("device").value,
    threads: Number($("threads").value),
  });
};

$("run").onclick = () => {
  currentText = $("text").value;
  worker.postMessage({ type: "run", text: currentText });
};

$("run5000").onclick = async () => {
  const raw = await (await fetch("/corpus/ner-fr.jsonl")).text();
  const texts = raw.split("\n").filter(Boolean).map((l) => JSON.parse(l).text);
  worker.postMessage({ type: "run5000", texts });
};

init().catch((e) => log("ERREUR : " + e.message));
