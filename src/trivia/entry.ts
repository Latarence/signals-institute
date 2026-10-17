// thesignalsinstitute.com/trivia: mount the daily trivia. Built on xps with esbuild into trivia/trivia.js.
import { mountTrivia } from "./trivia";
import type { TriviaBank } from "./daily";
import bank from "./questions.json";

const host = document.getElementById("trivia");
if (host) {
  host.removeAttribute("aria-busy");
  mountTrivia(host, bank as unknown as TriviaBank, {
    bg: "var(--card)",
    line: "rgba(127,127,127,0.35)",
    ink: "var(--text-bright)",
    muted: "var(--text)",
    good: "#22C55E",
    bad: "#E06C6C",
    accent: "var(--blue)",
    button: "var(--blue)",
    buttonInk: "var(--on-accent)",
    font: "var(--font-sans)",
  });
}
