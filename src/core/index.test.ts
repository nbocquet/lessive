import { describe, expect, it } from "vitest";
import { ENGINE_VERSION } from "./index.ts";

describe("core", () => {
  it("expose une version du moteur", () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
