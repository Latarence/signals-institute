// thesignalsinstitute.com/play: mount Relay. Built on xps with esbuild into play/relay.js.
import { mountGame } from "./Play/Relay/game";
import { BRAND } from "./Play/brand";

const host = document.getElementById("app");
if (host) mountGame(host, BRAND);
