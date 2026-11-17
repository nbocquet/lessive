/**
 * Rendu serveur (sans DOM, sans dépendance) du texte surligné : contrôle l'absence
 * d'injection HTML et l'exactitude des positions UTF-16 portées par `data-start`.
 */
import { render } from "svelte/server";
import { afterEach, describe, expect, it } from "vitest";
import type { Detection } from "../../core/index.ts";
import { app } from "../state.svelte.ts";
import HighlightedText from "./HighlightedText.svelte";

function det(id: string, start: number, end: number): Detection {
  return {
    id,
    start,
    end,
    entityType: "PERSON",
    score: 0.9,
    recognizerId: "x/y",
    packId: "x",
    source: "pattern",
    explanation: [],
  };
}

function show(text: string, detections: Detection[]): string {
  app.text = text;
  app.analysis = { detections, discarded: [], warnings: [] };
  return render(HighlightedText).body;
}

afterEach(() => app.reset());

describe("HighlightedText (rendu serveur)", () => {
  it("n'interprète jamais le texte comme du HTML", () => {
    const text = 'Paul <script>alert("x")</script> <img src=x onerror=alert(1)> Durand';
    const html = show(text, [det("d1", 0, 4)]);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)>");
  });

  it("n'interprète pas une détection qui couvre des balises", () => {
    const text = "a <b>gras</b> z";
    const html = show(text, [det("d1", 2, 13)]);
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b>gras&lt;/b>");
  });

  it("rend chaque détection comme un bouton focusable avec sa position", () => {
    const html = show("Bonjour Paul", [det("d1", 8, 12)]);
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('data-start="8"');
    expect(html).toContain('data-start="0"');
  });

  it("garde les positions UTF-16 exactes après un emoji", () => {
    const text = "😀😀 Paul";
    const start = text.indexOf("Paul");
    const html = show(text, [det("d1", start, start + 4)]);
    expect(html).toContain(`data-start="${start}"`);
    expect(start).toBe(5);
  });

  it("ne glisse aucun texte parasite entre les segments (retours à la ligne conservés)", () => {
    const text = "ligne un\nPaul\nligne trois";
    const html = show(text, [det("d1", 9, 13)]);
    const inner = /id="review-text"[^>]*>(.*)<\/div>/s.exec(html)?.[1] ?? "";
    const stripped = inner.replace(/<!--.*?-->/g, "");
    expect(stripped.replace(/<[^>]*>/g, "")).toBe(text);
  });
});
