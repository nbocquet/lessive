import { describe, expect, it } from "vitest";
import { AbortError } from "../recognizers/index.ts";
import { urlQueryView } from "./url-query-view.ts";

describe("vue des paramètres query", () => {
  it("ne normalise pas le texte ordinaire ni les chemins sans query", () => {
    for (const text of ["100%20 recommandé", "/Romain%20Vuilleumier", "a+b", "?ids=123"]) {
      expect(urlQueryView(text)).toBeNull();
    }
  });

  it("décode une fois, conserve le + international et mappe les positions UTF-16", () => {
    const text = "😀 /c?name=%C3%89lodie+Morel&phone=+41+79+412+58+03&next=%2520 fin";
    const view = urlQueryView(text)!;
    expect(view.text).toBe("😀 /c?name=Élodie Morel&phone=+41 79 412 58 03&next=%20 fin");
    expect(view.emailText).toBe("😀 /c?name=Élodie+Morel&phone=+41+79+412+58+03&next=%20 fin");
    const start = view.text.indexOf("Élodie");
    const range = view.originalRange({ start, end: start + "Élodie Morel".length });
    expect(text.slice(range.start, range.end)).toBe("%C3%89lodie+Morel");
    expect(view.viewRange(range)).toEqual({ start, end: start + "Élodie Morel".length });
    expect(view.originalRange({ start: 0, end: 2 })).toEqual({ start: 0, end: 2 });
  });

  it("décode les valeurs des clés avec crochets ou encodées sans réécrire leurs noms", () => {
    const text = "/r?email[]=prenom+alias%40example.org&email%5B%5D=autre%2Balias%40example.org";
    const view = urlQueryView(text)!;
    expect(view.text).toBe(
      "/r?email[]=prenom alias@example.org&email%5B%5D=autre+alias@example.org",
    );
    expect(view.emailText).toBe(
      "/r?email[]=prenom+alias@example.org&email%5B%5D=autre+alias@example.org",
    );
  });

  it("garde un caractère astral encodé indivisible dans les deux sens", () => {
    const text = "/c?value=%F0%9F%98%80";
    const view = urlQueryView(text)!;
    expect(view.text).toBe("/c?value=😀");
    const start = text.indexOf("%");
    expect(view.originalRange({ start, end: start + 1 })).toEqual({ start, end: text.length });
    expect(view.viewRange({ start: start + 3, end: start + 6 })).toEqual({ start, end: start + 2 });
  });

  it.each(["%FF", "%C3", "%E0%80%80", "%ED%A0%80", "%F4%90%80%80"])(
    "laisse l'UTF-8 malformé littéral sans permettre de couper un triplet : %s",
    (value) => {
      const text = `/c?name=${value}`;
      const view = urlQueryView(text)!;
      expect(view.text).toBe(text);
      const start = text.indexOf("%");
      expect(view.originalRange({ start: start + 1, end: start + 2 })).toEqual({
        start,
        end: start + 3,
      });
    },
  );

  it("ne transforme ni les échappements incomplets ni les caractères après la valeur", () => {
    const view = urlQueryView("/c?x=%ZZ%2%&y=a+b#c+d")!;
    expect(view.text).toBe("/c?x=%ZZ%2%&y=a b#c+d");
  });

  it("ignore les faux paramètres dans les fragments puis reprend au prochain jeton URL", () => {
    expect(urlQueryView("/c#fragment?email=test%40example.org&name=Romain+Vuilleumier")).toBeNull();
    const view = urlQueryView(
      "/c?x=a+b#fragment&name=Romain+Vuilleumier /r?email[]=test%40example.org",
    )!;
    expect(view.text).toBe("/c?x=a b#fragment&name=Romain+Vuilleumier /r?email[]=test@example.org");
  });

  it("respecte l'annulation même quand les valeurs ne contiennent pas d'échappement valide", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => urlQueryView("/c?name=%ZZ", controller.signal)).toThrow(AbortError);
  });

  it("traite une valeur proche de la limite sans décodage récursif", () => {
    const text = `/c?x=${"%2520".repeat(39000)}`;
    const start = performance.now();
    const view = urlQueryView(text)!;
    expect(view.text).toBe(`/c?x=${"%20".repeat(39000)}`);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
