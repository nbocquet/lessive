/** Cohérence des métadonnées statiques, disponibles sans exécution de l'application. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const canonical = /rel="canonical" href="([^"]+)"/.exec(html)![1]!;
const meta = (key: string) =>
  new RegExp(`(?:name|property)="${key}"\\s+content="([^"]+)"`).exec(html)?.[1];

describe("référencement de la page publique", () => {
  it("décrit l'outil dans le HTML initial et autorise l'indexation", () => {
    expect(html).toContain("<title>Masquage et pseudonymisation de textes — Lessive</title>");
    expect(meta("description")).toContain("Traitement local dans le navigateur");
    expect(meta("robots")).toBe("index, follow, max-image-preview:large");
    // Ce contenu reste présent sans JS et ne dépend pas du texte saisi dans l'application.
    expect(html).toContain('<section class="about"');
    expect(html).toContain("ne garantit pas l’anonymat");
    expect(html).toMatch(/<noscript>[\s\S]*Activez JavaScript[\s\S]*<\/noscript>/);
  });

  it("utilise une même URL absolue pour la canonique, le partage et le sitemap", () => {
    expect(canonical).toBe("https://nbocquet.github.io/lessive/");
    expect(meta("og:url")).toBe(canonical);
    const sitemap = readFileSync(new URL("./public/sitemap.xml", import.meta.url), "utf8");
    expect([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])).toEqual([canonical]);
  });

  it("fournit un aperçu PNG local de 1200 × 630 pour le partage", () => {
    const url = new URL(meta("og:image")!);
    expect(url.href).toBe(`${canonical}social-preview.png`);
    expect(meta("twitter:image")).toBe(url.href);
    expect(meta("twitter:card")).toBe("summary_large_image");
    expect(meta("og:image:alt")).toContain("document masqué");
    const png = readFileSync(new URL("./public/social-preview.png", import.meta.url));
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });

  it("décrit une application web avec des données structurées statiques sans avis inventés", () => {
    const json = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1]!;
    const schema = JSON.parse(json);
    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@graph"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ "@type": "WebSite", name: "Lessive", url: canonical }),
        expect.objectContaining({
          "@type": "WebApplication",
          name: "Lessive",
          url: canonical,
          isAccessibleForFree: true,
        }),
      ]),
    );
    expect(json).not.toMatch(/aggregateRating|ratingValue|reviewCount/);
  });
});
