import { describe, expect, it, vi } from "vitest";
import { confirmFocus } from "./confirm-focus.ts";

/** Élément minimal : focus et écouteurs clavier, sans DOM. */
function fakeNode() {
  const listeners = new Set<(e: KeyboardEvent) => void>();
  return {
    focus: vi.fn(),
    addEventListener: (_: string, l: (e: KeyboardEvent) => void) => listeners.add(l),
    removeEventListener: (_: string, l: (e: KeyboardEvent) => void) => listeners.delete(l),
    press(key: string) {
      const event = { key, preventDefault: vi.fn() } as unknown as KeyboardEvent;
      for (const l of listeners) l(event);
      return event;
    },
    listeners,
  };
}

describe("confirmation en ligne : focus et Échap", () => {
  it("prend le focus à l'apparition", () => {
    const node = fakeNode();
    confirmFocus(() => {})(node as unknown as HTMLElement);
    expect(node.focus).toHaveBeenCalledOnce();
  });

  it("annule sur Échap seulement", () => {
    const node = fakeNode();
    const cancel = vi.fn();
    confirmFocus(cancel)(node as unknown as HTMLElement);
    node.press("Enter");
    expect(cancel).not.toHaveBeenCalled();
    const event = node.press("Escape");
    expect(cancel).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("retire son écouteur quand la confirmation disparaît", () => {
    const node = fakeNode();
    const cleanup = confirmFocus(() => {})(node as unknown as HTMLElement);
    cleanup();
    expect(node.listeners.size).toBe(0);
  });
});
