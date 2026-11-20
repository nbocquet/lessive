import { expect, it, vi } from "vitest";

vi.mock("./run.ts", () => ({ run: vi.fn() }));

it("demande l’arrêt au premier SIGINT puis force la sortie au second pendant un chargement bloqué", async () => {
  const { run } = await import("./run.ts");
  let finish: (code: number) => void = () => undefined;
  vi.mocked(run).mockImplementation(
    async () =>
      new Promise<number>((resolve) => {
        finish = resolve;
      }),
  );
  let interrupt: (() => void) | undefined;
  const on = vi.spyOn(process, "on").mockImplementation((event, listener) => {
    if (event === "SIGINT") interrupt = listener;
    return process;
  });
  const exit = vi.spyOn(process, "exit").mockImplementation(() => {
    throw new Error("EXIT");
  });
  const previousCode = process.exitCode;
  const loading = import("./main.ts");
  try {
    await vi.waitFor(() => expect(interrupt).toBeDefined());
    const signal = vi.mocked(run).mock.calls[0]![1].signal!;
    interrupt!();
    expect(signal.aborted).toBe(true);
    expect(exit).not.toHaveBeenCalled();
    expect(() => interrupt!()).toThrow("EXIT");
    expect(exit).toHaveBeenCalledExactlyOnceWith(130);
  } finally {
    finish(0);
    await loading;
    process.exitCode = previousCode;
    on.mockRestore();
    exit.mockRestore();
  }
});
