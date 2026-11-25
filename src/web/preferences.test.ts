/** Préférences mémorisées sur demande (ADR 0005) : format, validation et état. */
import { describe, expect, it } from "vitest";
import { ALL_CLEANING_CATEGORIES } from "./cleaning-categories.ts";
import {
  parseSelectedCategories,
  serializeExcludedCategories,
  type PreferenceStore,
} from "./preferences.ts";
import { AppState } from "./state.svelte.ts";

function memoryStore(initial: string | null = null) {
  const store = {
    value: initial,
    writes: 0,
    fail: false,
    read: () => store.value,
    write(v: string) {
      if (store.fail) throw new Error("quota");
      store.writes++;
      store.value = v;
    },
    remove() {
      store.value = null;
    },
  };
  return store satisfies PreferenceStore;
}

describe("format des préférences", () => {
  it("enregistre les catégories décochées, pas les cochées", () => {
    const raw = serializeExcludedCategories(ALL_CLEANING_CATEGORIES.filter((c) => c !== "dates"));
    expect(JSON.parse(raw)).toEqual({ v: 1, excludedCategories: ["dates"] });
    expect(serializeExcludedCategories(ALL_CLEANING_CATEGORIES)).toBe(
      '{"v":1,"excludedCategories":[]}',
    );
  });

  it("relit la sélection ; une catégorie inconnue est ignorée, une nouvelle est cochée", () => {
    expect(parseSelectedCategories('{"v":1,"excludedCategories":["dates","retiree"]}')).toEqual(
      ALL_CLEANING_CATEGORIES.filter((c) => c !== "dates"),
    );
  });

  it.each([
    null,
    "",
    "pas du json",
    "null",
    "[]",
    '{"v":2,"excludedCategories":[]}',
    '{"v":1}',
    '{"v":1,"excludedCategories":"dates"}',
    '{"v":1,"excludedCategories":[1]}',
  ])("refuse une valeur absente ou invalide : %s", (raw) => {
    expect(parseSelectedCategories(raw)).toBeNull();
  });
});

describe("AppState : mémorisation sur demande", () => {
  it("n’écrit rien tant que l’utilisateur ne l’a pas demandé", () => {
    const store = memoryStore();
    const app = new AppState({ preferences: store });
    app.setCleaningCategory("dates", false);
    expect(app.rememberCategories).toBe(false);
    expect(store.writes).toBe(0);
    expect(store.value).toBeNull();
  });

  it("sur demande, enregistre puis suit chaque changement", () => {
    const store = memoryStore();
    const app = new AppState({ preferences: store });
    app.setCleaningCategory("dates", false);
    app.setRememberCategories(true);
    expect(parseSelectedCategories(store.value)).toEqual(app.cleaningCategories);
    app.setCleaningCategory("places", false);
    expect(JSON.parse(store.value!).excludedCategories).toEqual(["dates", "places"]);
    app.resetCleaningCategories();
    expect(JSON.parse(store.value!).excludedCategories).toEqual([]);
  });

  it("relit le choix enregistré à l’ouverture", () => {
    const app = new AppState({
      preferences: memoryStore('{"v":1,"excludedCategories":["dates"]}'),
    });
    expect(app.rememberCategories).toBe(true);
    expect(app.cleaningCategories).not.toContain("dates");
    expect(app.cleaningCategories).toHaveLength(ALL_CLEANING_CATEGORIES.length - 1);
  });

  it("efface une valeur illisible et revient aux valeurs par défaut", () => {
    const store = memoryStore("{cassé");
    const app = new AppState({ preferences: store });
    expect(app.rememberCategories).toBe(false);
    expect(app.cleaningCategories).toEqual(ALL_CLEANING_CATEGORIES);
    expect(store.value).toBeNull();
  });

  it("décocher la mémorisation efface la préférence et garde le choix en cours", () => {
    const store = memoryStore('{"v":1,"excludedCategories":["dates"]}');
    const app = new AppState({ preferences: store });
    app.setRememberCategories(false);
    expect(store.value).toBeNull();
    expect(app.cleaningCategories).not.toContain("dates");
    app.setCleaningCategory("places", false);
    expect(store.value).toBeNull();
  });

  it("un échec d’écriture désactive la mémorisation et le signale", () => {
    const store = memoryStore();
    store.fail = true;
    const app = new AppState({ preferences: store });
    app.setRememberCategories(true);
    expect(app.rememberCategories).toBe(false);
    expect(app.preferencesError).toMatch(/n’a pas pu être enregistré/);
  });

  it("sans stockage disponible, la mémorisation n’est pas proposée", () => {
    const app = new AppState();
    expect(app.canRememberCategories).toBe(false);
    app.setRememberCategories(true);
    expect(app.rememberCategories).toBe(false);
    expect(app.preferencesError).not.toBeNull();
  });

  it("un nouveau document conserve la mémorisation", () => {
    const store = memoryStore('{"v":1,"excludedCategories":["dates"]}');
    const app = new AppState({ preferences: store });
    app.reset();
    expect(app.rememberCategories).toBe(true);
    expect(app.cleaningCategories).not.toContain("dates");
    expect(store.value).not.toBeNull();
  });
});
