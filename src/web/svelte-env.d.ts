// Pour `tsc` seul : svelte-check connaît déjà les types exacts des composants.
declare module "*.svelte" {
  import type { Component } from "svelte";
  const component: Component<Record<string, unknown>>;
  export default component;
}
