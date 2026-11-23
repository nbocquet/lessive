import { mount } from "svelte";
import "../../src/web/app.css";
import "./maquette.css";
import App from "./App.svelte";

mount(App, { target: document.getElementById("app")! });
