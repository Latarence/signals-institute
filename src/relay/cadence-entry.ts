// thesignalsinstitute.com/play/cadence: mount Cadence. Built on xps with esbuild into play/cadence.js.
import { mountGame } from "./Play/Cadence/game";
import { BRAND } from "./Play/brand";

const host = document.getElementById("app");
if (host) mountGame(host, BRAND);
