// S2 — Configuration de l'expérience : consignes, consigne système par format, plan d'essais.
// `consignes.md` reprend ces textes mot pour mot (vérifié par `consignes.test.mjs`).

import { FORMAT_IDS } from "./formats.mjs";

/**
 * `complete: true` : la consigne exige de conserver tout le texte (traduire, reformuler) ; tous les
 * jetons de la source doivent donc réapparaître. C'est sur ces consignes que porte le critère de
 * décision. Les autres (résumer, répondre, extraire) peuvent légitimement en omettre : leur taux
 * est indicatif.
 * `control: true` : essai témoin SANS consigne système, exclu du critère.
 */
export const CONSIGNES = Object.freeze({
  resumer: {
    label: "Résumer en 3 points",
    prompt: "Résume le texte ci-dessous en 3 points.",
    complete: false,
    control: false,
  },
  traduire: {
    label: "Traduire en anglais",
    prompt: "Traduis le texte ci-dessous en anglais.",
    complete: true,
    control: false,
  },
  reformuler: {
    label: "Reformuler plus poliment",
    prompt:
      "Reformule le texte ci-dessous sur un ton plus poli et plus formel, en gardant toutes les informations.",
    complete: true,
    control: false,
  },
  repondre: {
    label: "Répondre au courriel",
    prompt: "Rédige une réponse au courriel ci-dessous.",
    complete: false,
    control: false,
  },
  extraire: {
    label: "Extraire les personnes et leurs rôles",
    prompt: "Extrais du texte ci-dessous la liste des personnes mentionnées et de leurs rôles.",
    complete: false,
    control: false,
  },
  "traduire-sans": {
    label: "Traduire en anglais, sans consigne système (témoin)",
    prompt: "Traduis le texte ci-dessous en anglais.",
    complete: true,
    control: true,
  },
});

/** Consigne système à joindre, adaptée à chaque format. */
export const SYSTEM_CONSIGNES = Object.freeze({
  A: "Les mots de la forme PERSONNE_001 (par exemple ORGANISATION_002 ou LIEU_003) sont des pseudonymes : recopie-les à l'identique, sans les traduire, les modifier ni les expliquer.",
  B: "Les groupes de la forme [PERSONNE_1] (par exemple [ORGANISATION_2] ou [LIEU_3]) sont des pseudonymes : recopie-les à l'identique, crochets compris, sans les traduire, les modifier ni les expliquer.",
  C: "Les groupes de la forme ⟦P1⟧ (par exemple ⟦O2⟧ ou ⟦L3⟧) sont des pseudonymes : recopie-les à l'identique, délimiteurs ⟦ et ⟧ compris, sans les traduire, les modifier ni les expliquer.",
});

const grid = (textes, consignes) =>
  textes.flatMap((t) => FORMAT_IDS.flatMap((f) => consignes.map((c) => ({ texte: t, format: f, consigne: c }))));

const gridFormats = (textes, formats, consignes) =>
  textes.flatMap((t) => formats.flatMap((f) => consignes.map((c) => ({ texte: t, format: f, consigne: c }))));

const ALL_TEXTES = ["client", "copro", "medical", "reunion", "rh"];

/** Plan d'essais proposé, par LLM. Version courte recommandée : lot « court » (format A seul). */
export const LOTS = Object.freeze({
  court: {
    label: "Lot court (recommandé) : 5 textes x format A x {traduire, reformuler} = 10 essais",
    trials: gridFormats(ALL_TEXTES, ["A"], ["traduire", "reformuler"]),
  },
  "court-B": {
    label: "Lot court B (seulement si A < 98 %) : 5 textes x format B x {traduire, reformuler}",
    trials: gridFormats(ALL_TEXTES, ["B"], ["traduire", "reformuler"]),
  },
  1: {
    label: "Lot 1 (obligatoire) : 5 textes x 3 formats x {traduire, reformuler}",
    trials: grid(["client", "copro", "medical", "reunion", "rh"], ["traduire", "reformuler"]),
  },
  2: {
    label: "Lot 2 (facultatif) : {client, copro} x 3 formats x {résumer, répondre, extraire}",
    trials: grid(["client", "copro"], ["resumer", "repondre", "extraire"]),
  },
  3: {
    label: "Lot 3 (témoin, facultatif) : {rh, medical} x 3 formats x traduire sans consigne système",
    trials: grid(["rh", "medical"], ["traduire-sans"]),
  },
});

export const trialKey = (t) => `${t.texte}-${t.format}-${t.consigne}`;

/**
 * Message unique envoyé au LLM pour un essai : consigne système du format (sauf témoin), consigne,
 * puis le texte pseudonymisé. Identique au gabarit de `consignes.md` §3.
 */
export function buildPrompt(trial, pseudonymizedText) {
  const c = CONSIGNES[trial.consigne];
  if (!c) throw new Error(`Consigne inconnue : ${trial.consigne}`);
  const parts = [];
  if (!c.control) parts.push(SYSTEM_CONSIGNES[trial.format]);
  parts.push(c.prompt, `Texte :\n${pseudonymizedText.trim()}`);
  return parts.join("\n\n");
}

