import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";
import { initOffline } from "./offline.ts";

const target = document.getElementById("app");
if (!target) throw new Error("Élément #app introuvable");

// Service worker : fonctionnement hors ligne (T6.2), en production uniquement.
initOffline();

export default mount(App, { target });
