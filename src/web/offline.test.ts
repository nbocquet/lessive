import { describe, expect, it } from "vitest";
import { parseOfflineMessage } from "./offline.ts";

describe("parseOfflineMessage", () => {
  it("accepte un message d'état du service worker", () => {
    expect(
      parseOfflineMessage({ type: "lessive-offline", phase: "ready", cached: 7, total: 7 }),
    ).toEqual({ phase: "ready", cached: 7, total: 7 });
  });

  it("ignore tout autre message", () => {
    expect(parseOfflineMessage(null)).toBeUndefined();
    expect(parseOfflineMessage({ type: "autre" })).toBeUndefined();
    expect(
      parseOfflineMessage({ type: "lessive-offline", phase: "inconnue", cached: 1, total: 2 }),
    ).toBeUndefined();
    expect(parseOfflineMessage({ type: "lessive-offline", phase: "ready" })).toBeUndefined();
  });
});
